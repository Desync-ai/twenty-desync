import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { DesyncOnboardingService } from 'src/engine/core-modules/desync-onboarding/desync-onboarding.service';
import {
  FIO_AD_CATEGORY_SET,
  FIO_AD_LIMITS,
  FIO_AD_SUBMISSION_KV_KEY,
  FIO_ADS_FALLBACK_RECIPIENT,
} from 'src/engine/core-modules/fio-ads/constants/fio-ad.constants';
import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';

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
  reason: 'ok' | 'not_paid' | 'referral' | 'already_launched' | 'ineligible';
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

  constructor(
    private readonly desyncOnboardingService: DesyncOnboardingService,
    private readonly keyValuePairService: KeyValuePairService,
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

  async getStatus({
    userId,
    email,
  }: {
    userId?: string;
    email?: string;
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

    const eligible = isInternal || isPaid;
    const alreadyLaunched = userId
      ? await this.hasLaunched(userId)
      : false;

    let reason: FioAdStatus['reason'];
    if (!eligible) {
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
    payload,
  }: {
    userId: string;
    email: string;
    payload: FioAdPayload;
  }): Promise<{ ok: true }> {
    // Never trust the client: re-check eligibility + the one-ad rule server-side.
    const status = await this.getStatus({ userId, email });

    if (!status.eligible) {
      throw new ForbiddenException(
        'Fio ads are available on Starter and above.',
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
