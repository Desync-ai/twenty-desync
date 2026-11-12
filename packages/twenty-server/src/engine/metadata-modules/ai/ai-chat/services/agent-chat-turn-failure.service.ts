import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { IsNull, Repository } from 'typeorm';

import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import {
  AgentMessageEntity,
  AgentMessageRole,
  AgentMessageStatus,
} from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-message.entity';
import { AgentTurnEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-turn.entity';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';
import {
  AGENT_CHAT_STALE_TURN_LOOKBACK_HOURS,
  AGENT_CHAT_STALE_TURN_SWEEP_BATCH_SIZE,
  AGENT_CHAT_STALE_TURN_THRESHOLD_MINUTES,
} from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-stale-turn-sweep.constant';
import { AGENT_CHAT_TURN_ERROR_MESSAGES } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-turn-error-messages.constant';
import { AgentChatThreadEntity } from 'src/engine/metadata-modules/ai/ai-chat/entities/agent-chat-thread.entity';
import { AgentChatEventPublisherService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-event-publisher.service';
import { AgentChatStreamingService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-streaming.service';
import { AgentChatService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat.service';
import { type AgentChatTurnError } from 'src/engine/metadata-modules/ai/ai-chat/types/agent-chat-turn-error.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

type StaleTurn = {
  turnId: string;
  threadId: string;
  workspaceId: string;
  activeStreamId: string | null;
};

@Injectable()
export class AgentChatTurnFailureService {
  private readonly logger = new Logger(AgentChatTurnFailureService.name);

  constructor(
    // The sweep looks for stale turns across all workspaces; every write
    // below goes through the workspace-scoped repositories.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(AgentChatThreadEntity)
    private readonly allWorkspacesThreadRepository: Repository<AgentChatThreadEntity>,
    @InjectWorkspaceScopedRepository(AgentChatThreadEntity)
    private readonly threadRepository: WorkspaceScopedRepository<AgentChatThreadEntity>,
    private readonly agentChatService: AgentChatService,
    private readonly agentChatStreamingService: AgentChatStreamingService,
    private readonly eventPublisherService: AgentChatEventPublisherService,
    private readonly metricsService: MetricsService,
  ) {}

  async sweepStaleTurns(): Promise<number> {
    const staleTurns = await this.findStaleTurns();

    let failedTurnCount = 0;

    for (const staleTurn of staleTurns) {
      try {
        if (await this.failStaleTurn(staleTurn)) {
          failedTurnCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to mark stale turn ${staleTurn.turnId} of thread ${staleTurn.threadId} as failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return failedTurnCount;
  }

  private async findStaleTurns(): Promise<StaleTurn[]> {
    return this.allWorkspacesThreadRepository
      .createQueryBuilder('thread')
      .innerJoin(AgentTurnEntity, 'turn', 'turn."threadId" = thread.id')
      .select('turn.id', 'turnId')
      .addSelect('thread.id', 'threadId')
      .addSelect('thread."workspaceId"', 'workspaceId')
      .addSelect('thread."activeStreamId"', 'activeStreamId')
      .where(
        'turn."createdAt" < NOW() - make_interval(mins => :thresholdMinutes)',
        { thresholdMinutes: AGENT_CHAT_STALE_TURN_THRESHOLD_MINUTES },
      )
      .andWhere(
        'turn."createdAt" > NOW() - make_interval(hours => :lookbackHours)',
        { lookbackHours: AGENT_CHAT_STALE_TURN_LOOKBACK_HOURS },
      )
      .andWhere(
        (queryBuilder) =>
          `EXISTS ${queryBuilder
            .subQuery()
            .select('1')
            .from(AgentMessageEntity, 'user_message')
            .where('user_message."turnId" = turn.id')
            .andWhere('user_message.role = :userRole')
            .andWhere('user_message.status = :sentStatus')
            .getQuery()}`,
      )
      .andWhere(
        (queryBuilder) =>
          `NOT EXISTS ${queryBuilder
            .subQuery()
            .select('1')
            .from(AgentMessageEntity, 'assistant_message')
            .where('assistant_message."turnId" = turn.id')
            .andWhere('assistant_message.role = :assistantRole')
            .getQuery()}`,
      )
      .setParameters({
        userRole: AgentMessageRole.USER,
        sentStatus: AgentMessageStatus.SENT,
        assistantRole: AgentMessageRole.ASSISTANT,
      })
      .orderBy('turn."createdAt"', 'ASC')
      .limit(AGENT_CHAT_STALE_TURN_SWEEP_BATCH_SIZE)
      .getRawMany<StaleTurn>();
  }

  private async failStaleTurn({
    turnId,
    threadId,
    workspaceId,
    activeStreamId,
  }: StaleTurn): Promise<boolean> {
    // A live stream may still answer (long tool runs); a dead one is reaped
    // the same way a page load would reap it.
    const hasActiveStream = isDefined(activeStreamId);

    if (hasActiveStream) {
      const interruptedError =
        await this.agentChatStreamingService.reapDeadStream({
          thread: { id: threadId, activeStreamId },
          workspaceId,
        });

      if (!isDefined(interruptedError)) {
        return false;
      }
    }

    const turnError: AgentChatTurnError = {
      code: AiExceptionCode.STREAM_INTERRUPTED,
      message: AGENT_CHAT_TURN_ERROR_MESSAGES.noReply,
    };

    await this.agentChatService.upsertTurnErrorMessage({
      threadId,
      turnId,
      workspaceId,
      turnError,
    });

    // Retry only works on the thread's latest turn and needs the thread error.
    const latestUserMessage =
      await this.agentChatService.findLatestSentUserMessage({
        threadId,
        workspaceId,
      });

    if (latestUserMessage?.turnId === turnId) {
      await this.threadRepository.update(
        workspaceId,
        { id: threadId, activeStreamId: IsNull(), lastStreamError: IsNull() },
        {
          lastStreamError: {
            ...turnError,
            failedAt: new Date().toISOString(),
          },
        },
      );
    }

    // reapDeadStream already counted the turn it interrupted.
    if (!hasActiveStream) {
      this.metricsService.incrementCounterBy({
        key: MetricsKeys.AiChatTurnFailed,
        amount: 1,
        attributes: { failure_phase: 'no_reply', error_code: turnError.code },
      });
    }

    await this.eventPublisherService
      .publish({ threadId, workspaceId, event: { type: 'queue-updated' } })
      .catch(() => {});

    return true;
  }
}
