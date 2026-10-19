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
  CARTESIA_DEFAULT_VOICE_ID,
  CARTESIA_EN_VOICE_ALLOWLIST,
  FIO_AD_CATEGORY_SET,
  FIO_AD_LIMITS,
  FIO_AD_SUBMISSION_KV_KEY,
  FIO_ADS_FALLBACK_RECIPIENT,
  FIO_VOICE_FALLBACK,
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
  // Groq-hosted Whisper for optional auto-transcription of the ad audio.
  private static readonly TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
  private readonly groqKey = process.env.GROQ_API_KEY ?? '';
  // Cartesia (Sonic) TTS for optional AI voiceover of the script (returns MP3).
  private static readonly CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';
  private static readonly CARTESIA_VOICES_URL = 'https://api.cartesia.ai/voices?limit=200';
  private static readonly CARTESIA_VERSION = '2026-08-14';
  private static readonly CARTESIA_MODEL = 'sonic-3.6';
  private static readonly DEFAULT_VOICE_ID = CARTESIA_DEFAULT_VOICE_ID;
  // Short phrase used for the pre-generation voice preview (kept brief so it is
  // cheap/fast); each voice is synthesized at most once then cached in-process.
  private static readonly VOICE_SAMPLE_TEXT =
    'Hi, this is a preview of how your Fio ad could sound.';
  private readonly voiceSampleCache = new Map<string, string>(); // voiceId -> base64 mp3
  private readonly cartesiaKey = process.env.CARTESIA_API_KEY ?? '';
  // Curated voice list resolved from Cartesia's live catalog, cached in-process.
  private static readonly VOICES_TTL_MS = 6 * 60 * 60 * 1000;
  private voicesCache: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
  }> | null = null;
  private voicesCacheAt = 0;
  // Lazy pool on the lead-gen billing DB (scraper_db) for prefill, same conn as
  // EntitlementService. Reads only the user's own onboarding company + URL.
  private prefillPool: Pool | null = null;
  // In-memory cache of website analysis (slow scrape) so the script assistant
  // doesn't re-scrape on every message. Keyed by website URL, 15-min TTL.
  private readonly websiteCache = new Map<string, { at: number; summary: string }>();

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

  // The curated voice selection shown in the picker: Cartesia's most natural
  // English voices (our allowlist), resolved to real IDs from Cartesia's live
  // catalog and cached. Falls back to the verified list if the fetch fails or
  // the key isn't set yet, so the picker is never empty.
  async listVoices(): Promise<
    ReadonlyArray<{ id: string; name: string; description: string }>
  > {
    const now = Date.now();
    if (
      this.voicesCache &&
      now - this.voicesCacheAt < FioAdsService.VOICES_TTL_MS
    ) {
      return this.voicesCache;
    }
    const curated = await this.fetchCuratedVoices();
    this.voicesCache = curated;
    this.voicesCacheAt = now;

    return curated;
  }

  private async fetchCuratedVoices(): Promise<
    ReadonlyArray<{ id: string; name: string; description: string }>
  > {
    if (!this.cartesiaKey) {
      return FIO_VOICE_FALLBACK;
    }
    try {
      const res = await fetch(FioAdsService.CARTESIA_VOICES_URL, {
        headers: {
          Authorization: `Bearer ${this.cartesiaKey}`,
          'Cartesia-Version': FioAdsService.CARTESIA_VERSION,
        },
      });

      if (!res.ok) {
        this.logger.warn(`Fio ads: Cartesia /voices returned ${res.status}`);

        return FIO_VOICE_FALLBACK;
      }

      const data = (await res.json()) as unknown;
      const list = (
        Array.isArray(data)
          ? data
          : Array.isArray((data as { data?: unknown })?.data)
            ? (data as { data: unknown[] }).data
            : []
      ) as Array<{ id?: string; name?: string; language?: string }>;

      // Index the English catalog by lowercased name (first match wins).
      const byName = new Map<string, string>();
      for (const v of list) {
        const id = typeof v?.id === 'string' ? v.id : '';
        const name = typeof v?.name === 'string' ? v.name : '';
        const lang = typeof v?.language === 'string' ? v.language : '';
        if (!id || !name) {
          continue;
        }
        if (lang && !lang.toLowerCase().startsWith('en')) {
          continue;
        }
        const key = name.toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, id);
        }
      }

      // Pick our allowlisted voices, in order, using their real catalog IDs.
      const curated: Array<{ id: string; name: string; description: string }> = [];
      for (const rec of CARTESIA_EN_VOICE_ALLOWLIST) {
        const id = byName.get(rec.name.toLowerCase());
        if (id) {
          curated.push({ id, name: rec.name, description: rec.description });
        }
        if (curated.length >= 8) {
          break;
        }
      }

      return curated.length > 0 ? curated : FIO_VOICE_FALLBACK;
    } catch (error) {
      this.logger.warn(
        `Fio ads: Cartesia /voices failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return FIO_VOICE_FALLBACK;
    }
  }

  private async allowedVoiceIds(): Promise<Set<string>> {
    const voices = await this.listVoices();

    return new Set(voices.map((v) => v.id));
  }

  // The user's signup answers (scraper_db) summarized for the script writer.
  private async getOnboardingSummary(email?: string): Promise<string> {
    if (!email) {
      return '';
    }
    const pool = this.getPrefillPool();
    if (!pool) {
      return '';
    }
    try {
      const { rows } = await pool.query(
        `SELECT onboarding_company, onboarding_company_url, onboarding_who,
                onboarding_business_type, onboarding_outreach, onboarding_tools,
                onboarding_messages_per_month, onboarding_deals_per_month
           FROM user_data WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      );
      const r = rows[0];
      if (!r) {
        return '';
      }
      const parts: string[] = [];
      const add = (label: string, v: unknown) => {
        if (typeof v === 'string' && v.trim()) parts.push(`${label}: ${v.trim()}`);
      };
      add('Company', r.onboarding_company);
      add('Website', r.onboarding_company_url);
      add('Business type', r.onboarding_business_type);
      add('Who they serve', r.onboarding_who);
      add('Outreach goals', r.onboarding_outreach);
      add('Tools they use', r.onboarding_tools);
      add('Messages per month', r.onboarding_messages_per_month);
      add('Deals per month', r.onboarding_deals_per_month);

      return parts.join('\n');
    } catch (error) {
      this.logger.warn(
        `Fio ads: onboarding context lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return '';
    }
  }

  // A scrape+analysis of the user's company site (1-3 pages, via the twenty-backend
  // analyze-website path), cached 15 min so the chat doesn't re-scrape each turn.
  private async getWebsiteSummary(website?: string): Promise<string> {
    const url = (website ?? '').trim();
    if (!url) {
      return '';
    }
    const cached = this.websiteCache.get(url);
    if (cached && Date.now() - cached.at < 15 * 60 * 1000) {
      return cached.summary;
    }
    let summary = '';
    try {
      const a = await this.desyncOnboardingService.analyzeWebsite(url);
      if (a?.ok) {
        const parts: string[] = [];
        if (a.company) parts.push(`Company: ${a.company}`);
        if (a.product) parts.push(`Offering: ${a.product}`);
        if (a.who) parts.push(`Audience: ${a.who}`);
        if (a.businessType) parts.push(`Business type: ${a.businessType}`);
        if (Array.isArray(a.outreach) && a.outreach.length) {
          parts.push(`Outreach angles: ${a.outreach.join('; ')}`);
        }
        if (Array.isArray(a.tags) && a.tags.length) {
          parts.push(`Themes: ${a.tags.join(', ')}`);
        }
        summary = parts.join('\n');
      }
    } catch (error) {
      this.logger.warn(
        `Fio ads: website analysis failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    this.websiteCache.set(url, { at: Date.now(), summary });

    return summary;
  }

  private async getScriptContext(
    email?: string,
    website?: string,
  ): Promise<string> {
    const [onboarding, site] = await Promise.all([
      this.getOnboardingSummary(email),
      this.getWebsiteSummary(website),
    ]);
    const blocks: string[] = [];
    if (onboarding) {
      blocks.push(`What the user told us at signup:\n${onboarding}`);
    }
    if (site) {
      blocks.push(`From their website:\n${site}`);
    }

    return blocks.join('\n\n');
  }

  // Agentic helper: a short, multi-turn assistant that drafts/refines the audio
  // ad script. Stateless on the server (the client sends the running history);
  // brand + the user's signup answers + a scrape of their site are injected into
  // the system prompt. Returns the reply. Caller gates on eligibility (spends AI).
  async assist({
    brand,
    messages,
    email,
  }: {
    brand?: { name?: string; website?: string };
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    email?: string;
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
      `avoid hype and anything off-brand for that context. Produce ONLY the spoken ` +
      `audio script. Do NOT write a headline, subtitle, title, tagline, or any ` +
      `other on-screen copy; the user writes those separately, so never suggest ` +
      `them even if asked. When you provide a ready-to-read script, put the spoken ` +
      `words ONLY (no title, no word count, no markdown, no quotation marks, no ` +
      `labels) between a line reading [SCRIPT] and a line reading [/SCRIPT], so it ` +
      `can be lifted straight into the transcript. Keep it within the time limit. ` +
      `Any brief commentary goes OUTSIDE the [SCRIPT] markers. Never use em dashes ` +
      `or en dashes anywhere in your output; use commas, periods, or parentheses ` +
      `instead.`;

    // Ground the writer in the user's real signup answers + a scrape of their
    // site, so a "recommend a script" request is specific, not generic.
    const context = await this.getScriptContext(email, brand?.website);
    const systemWithContext = context
      ? `${system}\n\nUse this real context about the user and their business ` +
        `to make the ad specific and accurate; do not contradict or invent ` +
        `beyond it:\n${context}`
      : system;

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
        system: systemWithContext,
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
      .trim()
      // Backstop the no-em-dash rule even if the model slips one in.
      .replace(/\s*[—–]\s*/g, ', ');

    return { reply: reply || 'Sorry, I could not generate a response.' };
  }

  // Optional auto-transcription of the ad audio via Groq-hosted Whisper. Returns
  // the transcript text; the client only uses it when the transcript is blank.
  async transcribe({
    audio,
  }: {
    audio?: { filename?: string; contentType?: string; dataBase64?: string };
  }): Promise<{ text: string }> {
    if (!this.groqKey) {
      throw new Error('Transcription is not configured (GROQ_API_KEY).');
    }
    if (!audio?.dataBase64) {
      throw new BadRequestException('No audio to transcribe.');
    }

    const buffer = Buffer.from(audio.dataBase64, 'base64');
    if (buffer.length > FIO_AD_LIMITS.audioMaxBytes) {
      throw new BadRequestException('Audio is too large to transcribe.');
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], {
        type: audio.contentType || 'audio/webm',
      }),
      audio.filename || 'audio.webm',
    );
    form.append('model', FioAdsService.TRANSCRIBE_MODEL);
    form.append('response_format', 'json');
    form.append('language', 'en');

    const res = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.groqKey}` },
        body: form,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Transcription error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { text?: string };

    return { text: (data.text ?? '').trim() };
  }

  // Optional AI voiceover of the script via Cartesia (Sonic) TTS. Returns an MP3
  // the client drops in as the ad audio. Caller gates on eligibility (spends our
  // Cartesia credits).
  async generateVoiceover({
    text,
    voiceId,
  }: {
    text?: string;
    voiceId?: string;
  }): Promise<{ audio: { filename: string; contentType: string; dataBase64: string } }> {
    if (!this.cartesiaKey) {
      throw new Error('AI voiceover is not configured (CARTESIA_API_KEY).');
    }
    const script = (text ?? '').trim();
    if (!script) {
      throw new BadRequestException('No script to voice.');
    }
    if (script.length > 2500) {
      throw new BadRequestException('Script is too long for a 20-30s ad.');
    }

    // Only allow a voice from our curated picker list; otherwise fall back to the
    // default (prevents arbitrary voice ids being driven through our key).
    const requested = (voiceId ?? '').trim();
    const allowed = await this.allowedVoiceIds();
    const voice =
      requested && allowed.has(requested)
        ? requested
        : process.env.CARTESIA_VOICE_ID || FioAdsService.DEFAULT_VOICE_ID;

    const dataBase64 = await this.synthesizeMp3(voice, script);

    return {
      audio: { filename: 'voiceover.mp3', contentType: 'audio/mpeg', dataBase64 },
    };
  }

  // Low-level Cartesia (Sonic) TTS -> base64 MP3. Shared by the full voiceover
  // and the short voice preview. POST /tts/bytes returns the MP3 bytes directly.
  // Throws on a non-2xx with the status + body snippet. (If Cartesia ever rejects
  // the voice shape, switch `voice` to a bare `{ id: voice }`.)
  private async synthesizeMp3(voice: string, text: string): Promise<string> {
    const res = await fetch(FioAdsService.CARTESIA_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cartesiaKey}`,
        'Cartesia-Version': FioAdsService.CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: FioAdsService.CARTESIA_MODEL,
        transcript: text,
        voice: { mode: 'id', id: voice },
        language: 'en',
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Voiceover error ${res.status}: ${errText.slice(0, 200)}`);
    }

    return Buffer.from(await res.arrayBuffer()).toString('base64');
  }

  // A short, cached sample of one of our picker voices so the user can hear it
  // before generating a full voiceover. Picker voices only; synthesized at most
  // once per voice (cached in-process) to keep previews ~free. Caller gates.
  async getVoiceSample({
    voiceId,
  }: {
    voiceId?: string;
  }): Promise<{ audio: { filename: string; contentType: string; dataBase64: string } }> {
    if (!this.cartesiaKey) {
      throw new Error('AI voiceover is not configured (CARTESIA_API_KEY).');
    }
    const voice = (voiceId ?? '').trim();
    const allowed = await this.allowedVoiceIds();
    if (!voice || !allowed.has(voice)) {
      throw new BadRequestException('Unknown voice.');
    }
    let dataBase64 = this.voiceSampleCache.get(voice);
    if (!dataBase64) {
      dataBase64 = await this.synthesizeMp3(voice, FioAdsService.VOICE_SAMPLE_TEXT);
      this.voiceSampleCache.set(voice, dataBase64);
    }

    return {
      audio: { filename: 'voice-sample.mp3', contentType: 'audio/mpeg', dataBase64 },
    };
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
    const alreadyLaunched = workspaceId
      ? await this.hasLaunched(workspaceId)
      : false;

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

  // One ad per WORKSPACE (keyed by workspaceId), so any admin on a paid
  // workspace consumes the workspace's single slot. (Paid multi-ad is a future
  // feature.)
  private async hasLaunched(workspaceId: string): Promise<boolean> {
    const rows = await this.keyValuePairService.get({
      userId: null,
      workspaceId,
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
      throw new BadRequestException(
        'This workspace has already submitted a Fio ad.',
      );
    }
    if (!workspaceId) {
      throw new BadRequestException('No workspace in session');
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
      userId: null,
      workspaceId,
      applicationId: null,
      key: FIO_AD_SUBMISSION_KV_KEY,
      type: KeyValuePairType.USER_VARIABLE,
      value: {
        submittedAt,
        submittedByEmail: email,
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
    // MP3 for uploads; the in-browser recorder produces webm/mp4/ogg (no native
    // MP3 in browsers). All accepted; delivery-to-Fio MP3 conversion is a later step.
    this.validateUpload(
      'audio',
      p.audio,
      ['audio/mpeg', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'],
      FIO_AD_LIMITS.audioMaxBytes,
    );
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
