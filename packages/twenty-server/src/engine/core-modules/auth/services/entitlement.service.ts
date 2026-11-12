import { Injectable, Logger } from '@nestjs/common';

import { Pool } from 'pg';

/**
 * Reads entitlement from the lead-gen billing DB (scraper_db_dev on dev,
 * scraper_db on prod) via ENTITLEMENT_DATABASE_URL. Billing stays on the lead-gen
 * platform; Twenty only READS whether a user may have a workspace.
 *
 * A user is entitled iff they are a Desync admin (@desync.ai) OR have a
 * non-revoked subscription row that is an Admin plan, or a
 * Starter/Crusader/Pro/Referral/Free plan inside its current billing period (so
 * a revoked/cancelled plan is NOT entitled). 'Free' is the standing $1/month
 * tier non-subscribers are lazily granted (see DesyncOnboardingResolver.
 * myEntitlement -> ensureFreeGrant) so they can browse the CRM; it deliberately
 * relaxes the old "never admit a free/trial user" cost control, which assumed
 * ~$19 per ACTIVE seat.
 *
 * Fails CLOSED: if the billing DB is unconfigured or unreachable, isEntitled
 * returns false — we would rather block a sign-up than mint a billable seat we
 * cannot verify.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);
  private pool: Pool | null = null;

  private getPool(): Pool | null {
    const connectionString = process.env.ENTITLEMENT_DATABASE_URL;

    if (!connectionString) {
      return null;
    }

    if (!this.pool) {
      this.pool = new Pool({
        connectionString,
        max: 3,
        // Neon requires TLS; its cert chain isn't always in the image trust store.
        ssl: connectionString.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined,
      });
    }

    return this.pool;
  }

  async isEntitled(email: string, clerkId?: string): Promise<boolean> {
    // Desync team / admins are always allowed (internal use). Trusting the
    // suffix relies on the stored email being Clerk's verified primary email:
    // Clerk sign-in syncs it and in-app email changes are refused while Clerk
    // is on (UserService.updateUserEmail).
    const normalizedEmail = email.toLowerCase();

    // ...except plus-aliased addresses (e.g. jackson+1@desync.ai): those are
    // treated as normal users so they can serve as real customer test accounts.
    if (
      normalizedEmail.endsWith('@desync.ai') &&
      !normalizedEmail.slice(0, normalizedEmail.lastIndexOf('@')).includes('+')
    ) {
      return true;
    }

    // Enterprise self-host (no paywall): an env-configured allowlist of customer
    // email domains is entitled without any billing subscription. Empty/unset =>
    // no effect, so the hosted multi-tenant CRM keeps its billing-gated behavior.
    const enterpriseAllowedDomains = (
      process.env.ENTERPRISE_ALLOWED_EMAIL_DOMAINS ?? ''
    )
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain.length > 0);

    if (enterpriseAllowedDomains.length > 0) {
      const emailDomain = normalizedEmail.slice(
        normalizedEmail.lastIndexOf('@') + 1,
      );

      if (enterpriseAllowedDomains.includes(emailDomain)) {
        return true;
      }
    }

    const pool = this.getPool();

    if (!pool) {
      this.logger.error(
        'ENTITLEMENT_DATABASE_URL is not set — refusing workspace creation (fail closed).',
      );

      return false;
    }

    try {
      const { rows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM user_data u
           JOIN subscription_usage su ON su.user_id = u.id
           WHERE (lower(u.email) = lower($1) OR ($2 <> '' AND u.clerk_id = $2))
             AND COALESCE(u.is_active, true) = true
             AND su.revoked = false
             AND (
               su.plan_level = 'Admin'
               OR (
                 su.plan_level IN ('Starter', 'Crusader', 'Pro', 'Referral', 'Free')
                 AND su.period_start <= EXTRACT(EPOCH FROM now())
                 AND su.period_end >= EXTRACT(EPOCH FROM now())
               )
             )
         ) AS entitled`,
        [email, clerkId ?? ''],
      );

      return rows[0]?.entitled === true;
    } catch (error) {
      this.logger.error(
        `Entitlement check failed for ${email} (fail closed): ${
          (error as Error)?.message
        }`,
      );

      return false;
    }
  }
}
