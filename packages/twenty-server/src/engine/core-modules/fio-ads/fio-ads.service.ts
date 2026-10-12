import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { Pool } from 'pg';
import { PermissionFlagType } from 'twenty-shared/constants';

import { DesyncOnboardingService } from 'src/engine/core-modules/desync-onboarding/desync-onboarding.service';
import {
  FIO_AD_CATEGORY_SET,
  FIO_AD_LIMITS,
  FIO_AD_SUBMISSION_KV_KEY,
  FIO_ADS_FALLBACK_RECIPIENT,
} from 'src/engine/core-modules/fio-ads/constants/fio-ad.constants';
import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

type FioUpload = {
  filename?: string;
  contentType?: string;
  dataBase64?: string;
};

type FioAdPayload = {
  brand?: {
    contactName?: string;
    contactEmail?: string;
    brandName?: string;
    website?: string;
  };
  copy?: {
    headline?: string;
    subtitle?: string;
    ctaUrl?: string;
    learnMoreUrl?: string;
  };
  categories?: string[];
  audioTranscript?: string;
  logo?: FioUpload;
  adImage?: FioUpload;
  audio?: FioUpload;
};

export type FioAdStatus = {
  eligible: boolean;
  reason:
    | 'ok'
    | 'not_admin'
    | 'not_paid'
    | 'referral'
    | 'already_launched'
    | 'ineligible';
  alreadyLaunched: boolean;
  allowMultiple: boolean;
  plan: string;
};

@Injectable()
export class FioAdsService {
  private readonly logger = new Logger(FioAdsService.name);
  private readonly resendKey =
    process.env.RESEND_KEY ?? process.env.RESEND_API_KEY ?? '';
  private static readonly FROM = 'Desync CRM <noreply@desync.support>';
  // Small/fast model for the ad-script assistant (short copy, iterative).
  private static readonly ASSIST_MODEL = 'claude-haiku-4-5-20251001';
  private readonly anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  // Lazy pool on the lead-gen billing DB (scraper_db) for prefill, same conn as
  // EntitlementService. Reads only the user's own onboarding company + URL.
  private prefillPool: Pool | null = null;

  constructor(
    private readonly desyncOnboardingService: DesyncOnboardingService,
    private readonly keyValuePairService: KeyValuePairService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // SAFETY: only an explicit FIO_ADS_EMAIL env var can change the recipient.
  // With it unset (dev, and prod until Jackson flips it) everything goes to him.
  private get recipient(): string {
    const configured = process.env.FIO_ADS_EMAIL?.trim();

    return configured && configured.length > 0
      ? configured
      : FIO_ADS_FALLBACK_RECIPIENT;
  }

  // Dev convenience: lets a tester submit more than once. Defaults to the real
  // one-ad-per-user rule when unset.
  private get allowMultiple(): boolean {
    return process.env.FIO_ADS_ALLOW_MULTIPLE === 'true';
  }

  private getPrefillPool(): Pool | null {
    const connectionString = process.env.ENTITLEMENT_DATABASE_URL;

    if (!connectionString) {
      return null;
    }
    if (!this.prefillPool) {
      this.prefillPool = new Pool({
        connectionString,
        max: 2,
        ssl: connectionString.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined,
      });
    }

    return this.prefillPool;
  }

  // What we already know about the user, to prefill the form. Only returns fields
  // we actually have (brand name + website from the onboarding company captured
  // in scraper_db). Everything is editable client-side; nothing is invented.
  async getPrefill(
    email?: string,
  ): Promise<{ brandName: string | null; website: string | null }> {
    const empty = { brandName: null, website: null };

    if (!email) {
      return empty;
    }

    const pool = this.getPrefillPool();

    if (!pool) {
      return empty;
    }

    try {
      const { rows } = await pool.query(
        `SELECT onboarding_company, onboarding_company_url
           FROM user_data
          WHERE lower(email) = lower($1)
          LIMIT 1`,
        [email],
      );
      const row = rows[0];

      return {
        brandName: (row?.onboarding_company as string) || null,
        website: (row?.onboarding_company_url as string) || null,
      };
    } catch (error) {
      this.logger.warn(
        `Fio ads: prefill lookup failed for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return empty;
    }
  }

  // Agentic helper: a short, multi-turn assistant that drafts/refines the audio
  // ad script. Stateless on the server (the client sends the running history);
  // brand context is injected into the system prompt. Returns the assistant's
  // reply text. Caller gates this on eligibility (it spends AI budget).
  async assist({
    brand,
    messages,
  }: {
    brand?: { name?: string; website?: string };
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{ reply: string }> {
    if (!this.anthropicKey) {
      throw new Error('The ad assistant is not configured (ANTHROPIC_API_KEY).');
    }

    const cleaned = (Array.isArray(messages) ? messages : [])
      .filter(
        (m) =>
          (m?.role === 'user' || m?.role === 'assistant') &&
          typeof m?.content === 'string' &&
          m.content.trim().length > 0,
      )
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (cleaned.length === 0) {
      throw new BadRequestException('No message to respond to.');
    }

    const brandLine =
      brand?.name || brand?.website
        ? `The user's brand is ${brand?.name ?? 'their organization'}${
            brand?.website ? ` (${brand.website})` : ''
          }.`
        : 'The user has not named their brand yet; ask for it if helpful.';

    const system =
      `You help a Desync CRM user write a short audio advertisement to run on ` +
      `Fio, a Catholic podcast network. ${brandLine} ` +
      `The spoken ad must be 20 to 30 seconds, which is roughly 50 to 75 words. ` +
      `Write warm, clear, broadcast-ready copy suitable for a Catholic audience; ` +
      `avoid hype and anything off-brand for that context. When the user asks for ` +
      `a script, reply with just the script text they can read aloud, no stage ` +
      `directions or labels. Keep within the time limit. You may also suggest a ` +
      `headline (<=45 chars) and subtitle (<=100 chars) if asked.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: FioAdsService.ASSIST_MODEL,
        max_tokens: 600,
        system,
        messages: cleaned,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Assistant error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const reply = (data.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return { reply: reply || 'Sorry, I could not generate a response.' };
  }

  async getStatus({
    userId,
    email,
    workspaceId,
    userWorkspaceId,
  }: {
    userId?: string;
    email?: string;
    workspaceId?: string;
    userWorkspaceId?: string;
  }): Promise<FioAdStatus> {
    const normalizedEmail = (email ?? '').toLowerCase();
    const isInternal = normalizedEmail.endsWith('@desync.ai');

    let plan = 'none';
    let isPaid = false;

    try {
      const sub = await this.desyncOnboardingService.getSubscription(
        email ?? '',
      );

      plan = sub?.planLevel ?? 'none';
      // isPaidPlan is defined server-side as plan NOT IN (Trial, Referral), i.e.
      // exactly "Starter or above", which is the gate we want.
      isPaid = sub?.isPaidPlan === true;
    } catch (error) {
      this.logger.warn(
        `Fio ads: subscription lookup failed for ${normalizedEmail}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Only workspace admins may launch (WORKSPACE settings permission == admin).
    let isAdmin = false;
    if (workspaceId && userWorkspaceId) {
      try {
        isAdmin = await this.permissionsService.userHasWorkspaceSettingPermission(
          {
            userWorkspaceId,
            workspaceId,
            setting: PermissionFlagType.WORKSPACE,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Fio ads: admin check failed for ${normalizedEmail}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Internal (@desync.ai) relaxes only the PAID requirement, never the admin
    // requirement; the rule is workspace-admins only.
    const planOk = isPaid || isInternal;
    const eligible = isAdmin && planOk;
    const alreadyLaunched = userId ? await this.hasLaunched(userId) : false;

    let reason: FioAdStatus['reason'];
    if (!isAdmin) {
      reason = 'not_admin';
    } else if (!planOk) {
      reason = plan === 'Referral' ? 'referral' : 'not_paid';
    } else if (alreadyLaunched && !this.allowMultiple) {
      reason = 'already_launched';
    } else {
      reason = 'ok';
    }

    return {
      eligible,
      reason,
      alreadyLaunched,
      allowMultiple: this.allowMultiple,
      plan,
    };
  }

  private async hasLaunched(userId: string): Promise<boolean> {
    const rows = await this.keyValuePairService.get({
      userId,
      workspaceId: null,
      applicationId: null,
      type: KeyValuePairType.USER_VARIABLE,
      key: FIO_AD_SUBMISSION_KV_KEY,
    });

    return rows.length > 0 && rows[0]?.value != null;
  }

  async launch({
    userId,
    email,
    workspaceId,
    userWorkspaceId,
    payload,
  }: {
    userId: string;
    email: string;
    workspaceId?: string;
    userWorkspaceId?: string;
    payload: FioAdPayload;
  }): Promise<{ ok: true }> {
    // Never trust the client: re-check eligibility (incl. admin) + the one-ad
    // rule server-side.
    const status = await this.getStatus({
      userId,
      email,
      workspaceId,
      userWorkspaceId,
    });

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason === 'not_admin'
          ? 'Only workspace admins can launch a Fio ad.'
          : 'Fio ads are available on Starter and above.',
      );
    }
    if (status.alreadyLaunched && !this.allowMultiple) {
      throw new BadRequestException('You have already submitted a Fio ad.');
    }

    this.validate(payload);

    const submittedAt = new Date().toISOString();
    const dataFile = JSON.stringify(
      {
        submittedAt,
        submittedByEmail: email,
        brand: payload.brand,
        copy: payload.copy,
        categories: payload.categories,
        audioTranscript: payload.audioTranscript,
        assets: {
          logo: payload.logo?.filename,
          adImage: payload.adImage?.filename,
          audio: payload.audio?.filename,
        },
      },
      null,
      2,
    );

    await this.sendEmail(email, payload, dataFile, submittedAt);

    await this.keyValuePairService.set({
      userId,
      workspaceId: null,
      applicationId: null,
      key: FIO_AD_SUBMISSION_KV_KEY,
      type: KeyValuePairType.USER_VARIABLE,
      value: {
        submittedAt,
        brandName: payload.brand?.brandName ?? '',
        sentTo: this.recipient,
      },
    });

    return { ok: true };
  }

  private validate(p: FioAdPayload): void {
    const brand = p?.brand ?? {};
    const copy = p?.copy ?? {};

    if (
      !brand.contactName?.trim() ||
      !brand.contactEmail?.trim() ||
      !brand.brandName?.trim() ||
      !/^https?:\/\//.test(brand.website ?? '')
    ) {
      throw new BadRequestException('Missing or invalid brand information.');
    }
    if (!copy.headline?.trim() || copy.headline.length > FIO_AD_LIMITS.headlineMax) {
      throw new BadRequestException('Invalid headline.');
    }
    if ((copy.subtitle ?? '').length > FIO_AD_LIMITS.subtitleMax) {
      throw new BadRequestException('Subtitle is too long.');
    }
    if (
      !/^https?:\/\//.test(copy.ctaUrl ?? '') ||
      !/^https?:\/\//.test(copy.learnMoreUrl ?? '')
    ) {
      throw new BadRequestException('Invalid call-to-action or Learn More URL.');
    }
    if (!p.audioTranscript?.trim()) {
      throw new BadRequestException('Missing audio transcript.');
    }

    const categories = Array.isArray(p.categories) ? p.categories : [];
    if (
      categories.length < FIO_AD_LIMITS.minCategories ||
      categories.length > FIO_AD_LIMITS.maxCategories
    ) {
      throw new BadRequestException('Pick 1 to 5 categories.');
    }
    for (const category of categories) {
      if (!FIO_AD_CATEGORY_SET.has(category)) {
        throw new BadRequestException(`Unknown category: ${category}`);
      }
    }

    this.validateUpload('logo', p.logo, ['image/jpeg', 'image/png'], FIO_AD_LIMITS.imageMaxBytes);
    this.validateUpload('advertisement image', p.adImage, ['image/jpeg', 'image/png'], FIO_AD_LIMITS.imageMaxBytes);
    this.validateUpload('audio', p.audio, ['audio/mpeg'], FIO_AD_LIMITS.audioMaxBytes);
  }

  private validateUpload(
    label: string,
    file: FioUpload | undefined,
    allowedTypes: string[],
    maxBytes: number,
  ): void {
    if (!file?.dataBase64 || !file?.filename) {
      throw new BadRequestException(`Missing ${label}.`);
    }
    if (!allowedTypes.includes(file.contentType ?? '')) {
      throw new BadRequestException(`Invalid ${label} file type.`);
    }
    const bytes = Buffer.byteLength(file.dataBase64, 'base64');
    if (bytes > maxBytes) {
      throw new BadRequestException(`${label} is too large.`);
    }
  }

  private async sendEmail(
    submitterEmail: string,
    p: FioAdPayload,
    dataFile: string,
    submittedAt: string,
  ): Promise<void> {
    if (!this.resendKey) {
      throw new Error('Fio ad email is not configured (RESEND_KEY).');
    }

    const esc = (s: string) =>
      (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const brand = p.brand ?? {};
    const copy = p.copy ?? {};

    const html =
      `<p>New Fio ad submission from <strong>${esc(brand.brandName ?? '')}</strong> ` +
      `(submitted by ${esc(submitterEmail)} at ${esc(submittedAt)}).</p>` +
      `<p><strong>Brand contact:</strong> ${esc(brand.contactName ?? '')} (${esc(brand.contactEmail ?? '')})<br/>` +
      `<strong>Website:</strong> ${esc(brand.website ?? '')}</p>` +
      `<p><strong>Headline:</strong> ${esc(copy.headline ?? '')}<br/>` +
      `<strong>Subtitle:</strong> ${esc(copy.subtitle ?? '')}<br/>` +
      `<strong>CTA URL:</strong> ${esc(copy.ctaUrl ?? '')}<br/>` +
      `<strong>Learn More URL:</strong> ${esc(copy.learnMoreUrl ?? '')}</p>` +
      `<p><strong>Categories:</strong> ${esc((p.categories ?? []).join(', '))}</p>` +
      `<p><strong>Transcript:</strong><br/>` +
      `<span style="white-space:pre-wrap">${esc(p.audioTranscript ?? '')}</span></p>` +
      `<p>Logo, advertisement image, the MP3, and a machine-readable JSON file are attached.</p>`;

    const attachments = [
      {
        filename: 'fio-ad.json',
        content: Buffer.from(dataFile, 'utf8').toString('base64'),
      },
      { filename: p.logo?.filename ?? 'logo', content: p.logo?.dataBase64 },
      { filename: p.adImage?.filename ?? 'ad-image', content: p.adImage?.dataBase64 },
      { filename: p.audio?.filename ?? 'audio.mp3', content: p.audio?.dataBase64 },
    ];

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FioAdsService.FROM,
        to: [this.recipient],
        reply_to: submitterEmail,
        subject: `Fio ad submission: ${brand.brandName ?? 'Unknown brand'}`,
        html,
        attachments,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend responded ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
