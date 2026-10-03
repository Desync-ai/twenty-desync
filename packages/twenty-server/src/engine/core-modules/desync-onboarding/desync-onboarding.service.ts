import { Injectable, Logger } from '@nestjs/common';

/**
 * Desync: proxy the signup questionnaire to the private Twenty backend, which
 * writes it to the shared lead-gen `user_data.onboarding_*` (the columns the
 * matcher reads) and grants the free Trial. Mirrors DesyncAiBudgetService:
 * config-driven via process.env (NOT config-variables.ts).
 *   - TWENTY_BACKEND_URL: base URL of the private backend. Unset => no-op:
 *     getStatus() reports "completed" so the questionnaire gate never blocks
 *     when the backend isn't wired (e.g. OSS deploys).
 *   - TWENTY_BACKEND_SERVICE_TOKEN: shared server-to-server secret.
 *
 * The STATUS check fails OPEN (treat as completed) so a backend blip can't lock
 * users out of their workspace; SAVE fails CLOSED (throws) so the frontend can
 * surface the error and the user retries rather than silently skipping it.
 */
@Injectable()
export class DesyncOnboardingService {
  private readonly logger = new Logger(DesyncOnboardingService.name);
  private readonly timeoutMs = 5000;

  private get baseUrl(): string | undefined {
    const url = process.env.TWENTY_BACKEND_URL;

    return url && url.trim() !== '' ? url.replace(/\/+$/, '') : undefined;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': process.env.TWENTY_BACKEND_SERVICE_TOKEN ?? '',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Has this user finished the questionnaire? Fails OPEN (true) when the backend
   * is unset or errors, so the gate never bricks the app.
   */
  async isCompleted(email: string): Promise<boolean> {
    if (!this.baseUrl) {
      return true;
    }

    try {
      const response = await this.post('/onboarding-status', { email });

      if (!response.ok) {
        this.logger.warn(
          `onboarding-status returned ${response.status} for ${email} — treating as completed (fail open)`,
        );

        return true;
      }

      const data = (await response.json()) as { onboarding_completed?: boolean };

      return data.onboarding_completed === true;
    } catch (error) {
      this.logger.error(
        `onboarding-status failed for ${email} (fail open): ${
          (error as Error)?.message
        }`,
      );

      return true;
    }
  }

  /**
   * Persist the questionnaire answers. Fails CLOSED: throws on any non-OK so the
   * frontend keeps the gate up and the user retries.
   */
  async save(
    email: string,
    answers: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.baseUrl) {
      // No backend wired: nothing to persist, but don't pretend it saved.
      this.logger.warn('saveDesyncOnboarding called but TWENTY_BACKEND_URL unset');

      return false;
    }

    const response = await this.post('/save-onboarding', { email, answers });

    if (!response.ok) {
      throw new Error(`save-onboarding returned ${response.status}`);
    }

    const data = (await response.json()) as { success?: boolean };

    return data.success === true;
  }

  // --- Paid checkout (proxied to twenty-backend's Stripe endpoints) -----------

  private async get(path: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'X-Service-Token': process.env.TWENTY_BACKEND_SERVICE_TOKEN ?? '',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private assertBackend(): void {
    if (!this.baseUrl) {
      throw new Error('Billing backend is not configured (TWENTY_BACKEND_URL unset)');
    }
  }

  /** The paywall catalog (plans + price IDs) + Stripe publishable key. */
  async getBillingPlans(): Promise<{
    plans: Array<{
      key: string;
      name: string;
      priceIdMonthly: string;
      priceIdAnnual: string;
      monthlyPriceUsd: number;
      recordQuota: number;
    }>;
    publishableKey: string;
  }> {
    this.assertBackend();

    const response = await this.get('/billing-plans');

    if (!response.ok) {
      throw new Error(`billing-plans returned ${response.status}`);
    }

    return (await response.json()) as {
      plans: Array<{
        key: string;
        name: string;
        priceIdMonthly: string;
        priceIdAnnual: string;
        monthlyPriceUsd: number;
        recordQuota: number;
      }>;
      publishableKey: string;
    };
  }

  /** Mint a SetupIntent for the user's card entry. */
  async createSubscription(
    email: string,
    priceId: string,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    this.assertBackend();

    const response = await this.post('/create-subscription', {
      email,
      price_id: priceId,
    });

    if (!response.ok) {
      throw new Error(`create-subscription returned ${response.status}`);
    }

    const data = (await response.json()) as {
      clientSecret?: string;
      setupIntentId?: string;
    };

    if (!data.clientSecret || !data.setupIntentId) {
      throw new Error('create-subscription returned no client secret');
    }

    return { clientSecret: data.clientSecret, setupIntentId: data.setupIntentId };
  }

  /** Create the Stripe subscription after the card is confirmed. */
  async activateSubscription(
    email: string,
    setupIntentId: string,
    priceId: string,
  ): Promise<{ subscriptionId: string; status: string }> {
    this.assertBackend();

    const response = await this.post('/activate-subscription', {
      email,
      setup_intent_id: setupIntentId,
      price_id: priceId,
    });

    if (!response.ok) {
      throw new Error(`activate-subscription returned ${response.status}`);
    }

    const data = (await response.json()) as {
      subscriptionId?: string;
      status?: string;
    };

    return {
      subscriptionId: data.subscriptionId ?? '',
      status: data.status ?? '',
    };
  }

  // --- Self-service plan management (the in-CRM Plan & Billing page) ----------

  /**
   * The user's current plan + live Stripe cancel state. Fails SOFT: on any error
   * returns a "no subscription" shape so the (already-entitled) page still
   * renders — this read drives display, not access.
   */
  async getSubscription(email: string): Promise<{
    hasSubscription: boolean;
    planLevel: string | null;
    isPaidPlan: boolean;
    current: boolean;
    cadence: string | null;
    periodEnd: number | null;
    quota: number | null;
    used: number | null;
    stripeActive: boolean;
    cancelAtPeriodEnd: boolean;
  }> {
    const fallback = {
      hasSubscription: false,
      planLevel: null,
      isPaidPlan: false,
      current: false,
      cadence: null,
      periodEnd: null,
      quota: null,
      used: null,
      stripeActive: false,
      cancelAtPeriodEnd: false,
    };

    if (!this.baseUrl) {
      return fallback;
    }

    try {
      const response = await this.post('/my-subscription', { email });

      if (!response.ok) {
        this.logger.warn(`my-subscription returned ${response.status} for ${email}`);

        return fallback;
      }

      const d = (await response.json()) as Record<string, unknown>;

      return {
        hasSubscription: d.has_subscription === true,
        planLevel: (d.plan_level as string) ?? null,
        isPaidPlan: d.is_paid_plan === true,
        current: d.current === true,
        cadence: (d.cadence as string) ?? null,
        periodEnd: (d.period_end as number) ?? null,
        quota: (d.quota as number) ?? null,
        used: (d.used as number) ?? null,
        stripeActive: d.stripe_active === true,
        cancelAtPeriodEnd: d.cancel_at_period_end === true,
      };
    } catch (error) {
      this.logger.error(
        `my-subscription failed for ${email} (soft): ${(error as Error)?.message}`,
      );

      return fallback;
    }
  }

  /** Run a {success, message} subscription action against the backend. Any failure
   * is surfaced as {success:false} with a user-facing message (not thrown) so the
   * page can show it inline. */
  private async action(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.baseUrl) {
      return { success: false, message: 'Billing is not configured.' };
    }

    try {
      const response = await this.post(path, body);
      const d = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        return {
          success: false,
          message: d.error ?? d.message ?? 'Something went wrong. Please try again.',
        };
      }

      return {
        success: d.success === true,
        message: d.message ?? (d.success === true ? 'Done.' : 'Unable to complete that action.'),
      };
    } catch (error) {
      this.logger.error(`${path} failed: ${(error as Error)?.message}`);

      return { success: false, message: 'Could not reach billing. Please try again.' };
    }
  }

  cancelSubscription(email: string) {
    return this.action('/cancel-subscription', { email });
  }

  resumeSubscription(email: string) {
    return this.action('/resume-subscription', { email });
  }

  changePlan(email: string, priceId: string) {
    return this.action('/change-plan', { email, price_id: priceId });
  }

  /** Mint a SetupIntent for entering a NEW card (change payment method). */
  async createSetupIntent(
    email: string,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    this.assertBackend();

    const response = await this.post('/create-setup-intent', { email });

    if (!response.ok) {
      throw new Error(`create-setup-intent returned ${response.status}`);
    }

    const data = (await response.json()) as {
      clientSecret?: string;
      setupIntentId?: string;
    };

    if (!data.clientSecret || !data.setupIntentId) {
      throw new Error('create-setup-intent returned no client secret');
    }

    return { clientSecret: data.clientSecret, setupIntentId: data.setupIntentId };
  }

  /** After the new card is confirmed, make it the default payment method. */
  setDefaultCard(email: string, setupIntentId: string) {
    return this.action('/set-default-card', {
      email,
      setup_intent_id: setupIntentId,
    });
  }

  // --- Multi-seat (buying seats for teammates) -------------------------------

  async seatPaymentMethod(
    email: string,
  ): Promise<{ hasCard: boolean; brand: string | null; last4: string | null }> {
    if (!this.baseUrl) {
      return { hasCard: false, brand: null, last4: null };
    }
    try {
      const response = await this.post('/seats/payment-method', { email });
      if (!response.ok) {
        return { hasCard: false, brand: null, last4: null };
      }
      const d = (await response.json()) as Record<string, unknown>;
      return {
        hasCard: d.hasCard === true,
        brand: (d.brand as string) ?? null,
        last4: (d.last4 as string) ?? null,
      };
    } catch {
      return { hasCard: false, brand: null, last4: null };
    }
  }

  /** Mint a SetupIntent for the owner to add a card for a seat. */
  async createSeatSetupIntent(
    email: string,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    this.assertBackend();
    const response = await this.post('/seats/setup-intent', { email });
    if (!response.ok) {
      throw new Error(`seats/setup-intent returned ${response.status}`);
    }
    const data = (await response.json()) as {
      clientSecret?: string;
      setupIntentId?: string;
    };
    if (!data.clientSecret || !data.setupIntentId) {
      throw new Error('seats/setup-intent returned no client secret');
    }
    return { clientSecret: data.clientSecret, setupIntentId: data.setupIntentId };
  }

  /** Buy a per-seat subscription for a teammate (charged to the owner's card). */
  async buySeat(
    email: string,
    priceId: string,
    beneficiaryEmail: string,
    workspaceId: string,
    role: string | null,
    setupIntentId: string | null,
  ): Promise<{ status: string; subscriptionId: string | null; message: string }> {
    this.assertBackend();
    const response = await this.post('/seats/activate', {
      email,
      price_id: priceId,
      beneficiary_email: beneficiaryEmail,
      workspace_id: workspaceId,
      role: role ?? undefined,
      setup_intent_id: setupIntentId ?? undefined,
    });
    const d = (await response.json().catch(() => ({}))) as {
      status?: string;
      subscriptionId?: string;
      error?: string;
    };
    if (!response.ok) {
      return {
        status: d.status ?? 'error',
        subscriptionId: null,
        message: d.error ?? 'Could not complete the seat purchase.',
      };
    }
    return {
      status: d.status ?? 'active',
      subscriptionId: d.subscriptionId ?? null,
      message: '',
    };
  }

  async listSeats(email: string): Promise<
    Array<{
      subscriptionId: string;
      beneficiaryEmail: string | null;
      role: string | null;
      status: string;
      planName: string | null;
      cancelAtPeriodEnd: boolean;
      periodEnd: number | null;
    }>
  > {
    if (!this.baseUrl) {
      return [];
    }
    try {
      const response = await this.post('/my-seats', { email });
      if (!response.ok) {
        return [];
      }
      const d = (await response.json()) as { seats?: Array<Record<string, unknown>> };
      return (d.seats ?? []).map((s) => ({
        subscriptionId: (s.subscriptionId as string) ?? '',
        beneficiaryEmail: (s.beneficiaryEmail as string) ?? null,
        role: (s.role as string) ?? null,
        status: (s.status as string) ?? '',
        planName: (s.planName as string) ?? null,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
        periodEnd: (s.currentPeriodEnd as number) ?? null,
      }));
    } catch {
      return [];
    }
  }

  cancelSeat(email: string, subscriptionId: string) {
    return this.action('/cancel-seat', { email, subscription_id: subscriptionId });
  }

  /** Upgrade a seat the admin pays for to a higher plan (e.g. Pro monthly -> annual). */
  changeSeatPlan(email: string, beneficiaryEmail: string, priceId: string) {
    return this.action('/change-seat-plan', {
      email,
      beneficiary_email: beneficiaryEmail,
      price_id: priceId,
    });
  }

  /** Current plan level + cadence per email (member list + seat upgrade gating). */
  async memberPlans(
    emails: string[],
  ): Promise<Array<{ email: string; planLevel: string | null; cadence: string | null }>> {
    if (!this.baseUrl || emails.length === 0) {
      return [];
    }
    try {
      const response = await this.post('/members-plans', { emails });
      if (!response.ok) {
        return [];
      }
      const d = (await response.json()) as {
        members?: Array<{ email: string; planLevel?: string; cadence?: string }>;
      };
      return (d.members ?? []).map((m) => ({
        email: m.email,
        planLevel: m.planLevel ?? null,
        cadence: m.cadence ?? null,
      }));
    } catch {
      return [];
    }
  }
}
