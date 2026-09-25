import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

/**
 * Desync: enforce a per-user AI spend budget on the native copilot via the
 * private Twenty backend, which meters against the shared lead-gen
 * `subscription_usage` row (so the CRM copilot and the lead-gen platform draw
 * from ONE per-user budget).
 *
 * Fork-added, config-driven via process.env (like `EntitlementService` reading
 * ENTITLEMENT_DATABASE_URL — NOT in config-variables.ts):
 *   - TWENTY_BACKEND_URL: base URL of the private backend. Unset => no-op (the
 *     copilot keeps Twenty's native behavior, uncapped).
 *   - TWENTY_BACKEND_SERVICE_TOKEN: shared server-to-server secret.
 *
 * assertAllowed FAILS CLOSED (any error blocks); recordSpend is best-effort and
 * never throws (the message already happened).
 */
@Injectable()
export class DesyncAiBudgetService {
  private readonly logger = new Logger(DesyncAiBudgetService.name);
  private readonly timeoutMs = 5000;

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  private get baseUrl(): string | undefined {
    const url = process.env.TWENTY_BACKEND_URL;

    return url && url.trim() !== '' ? url.replace(/\/+$/, '') : undefined;
  }

  private async resolveIdentity(
    userWorkspaceId: string,
  ): Promise<{ email: string; clerkId: string } | null> {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { id: userWorkspaceId },
      relations: { user: true },
    });

    if (!userWorkspace?.user?.email) {
      return null;
    }

    return {
      email: userWorkspace.user.email,
      clerkId: userWorkspace.user.clerkId ?? '',
    };
  }

  private async post(path: string, body: unknown) {
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
   * Block an AI request when the user has no budget left. No-op when
   * TWENTY_BACKEND_URL is unset. Fails closed: any error throws (blocks).
   */
  async assertAllowed(userWorkspaceId: string): Promise<void> {
    if (!this.baseUrl) {
      return;
    }

    const identity = await this.resolveIdentity(userWorkspaceId);

    if (!identity) {
      // Cannot identify the caller -> fail closed rather than let spend run.
      throw new AiException(
        `AI budget: could not resolve user for userWorkspaceId ${userWorkspaceId}`,
        AiExceptionCode.AI_SPEND_LIMIT_REACHED,
      );
    }

    let allowed = false;

    try {
      const response = await this.post('/ai/check', {
        email: identity.email,
        clerk_id: identity.clerkId,
      });

      if (response.ok) {
        const data = (await response.json()) as { allowed?: boolean };

        allowed = data.allowed === true;
      } else {
        this.logger.warn(
          `AI budget check returned ${response.status} for ${identity.email} — blocking (fail closed)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `AI budget check failed for ${identity.email} (fail closed): ${
          (error as Error)?.message
        }`,
      );
      allowed = false;
    }

    if (!allowed) {
      throw new AiException(
        `AI spend limit reached for ${identity.email}`,
        AiExceptionCode.AI_SPEND_LIMIT_REACHED,
      );
    }
  }

  /**
   * Debit the just-completed turn against the user's shared AI budget.
   * Best-effort — logs and swallows every error (the message already happened).
   */
  async recordSpend(params: {
    userWorkspaceId: string;
    costCents: number;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    if (!this.baseUrl) {
      return;
    }

    try {
      const identity = await this.resolveIdentity(params.userWorkspaceId);

      if (!identity) {
        return;
      }

      const response = await this.post('/ai/record', {
        email: identity.email,
        clerk_id: identity.clerkId,
        cost_cents: Math.max(0, Math.round(params.costCents)),
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
      });

      if (!response.ok) {
        this.logger.warn(
          `AI spend record returned ${response.status} for ${identity.email}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `AI spend record failed (non-fatal): ${(error as Error)?.message}`,
      );
    }
  }
}
