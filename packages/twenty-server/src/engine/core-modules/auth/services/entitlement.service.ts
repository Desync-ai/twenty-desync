import { Injectable, Logger } from '@nestjs/common';

import { Pool } from 'pg';

/**
 * Reads entitlement from the lead-gen billing DB (scraper_db_dev on dev,
 * scraper_db on prod) via ENTITLEMENT_DATABASE_URL. Billing stays on the lead-gen
 * platform; Twenty only READS whether a user may have a workspace.
 *
 * This is the cost control: Twenty bills ~$19 per ACTIVE seat, so we must never
 * provision a workspace for a free/trial user. A user is entitled iff they are a
 * Desync admin (@desync.ai) OR have a non-revoked subscription row that is an
 * Admin plan, or a Starter/Crusader/Referral plan inside its current billing
 * period (so an expired referral or a revoked/cancelled plan is NOT entitled).
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
    // Desync team / admins are always allowed (internal use).
    if (email.toLowerCase().endsWith('@desync.ai')) {
      return true;
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
                 su.plan_level IN ('Starter', 'Crusader', 'Referral')
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
