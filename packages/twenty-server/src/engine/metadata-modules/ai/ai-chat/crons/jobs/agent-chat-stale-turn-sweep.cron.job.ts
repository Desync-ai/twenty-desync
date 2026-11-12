import { Injectable, Logger } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { AGENT_CHAT_STALE_TURN_SWEEP_CRON_PATTERN } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-stale-turn-sweep.constant';
import { AgentChatTurnFailureService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-turn-failure.service';

// Catches the turns no stream job could fail itself (worker crash, job never
// picked up): without it they stay a user message with no reply forever.
@Injectable()
@Processor(MessageQueue.cronQueue)
export class AgentChatStaleTurnSweepCronJob {
  private readonly logger = new Logger(AgentChatStaleTurnSweepCronJob.name);

  constructor(
    private readonly agentChatTurnFailureService: AgentChatTurnFailureService,
  ) {}

  @Process(AgentChatStaleTurnSweepCronJob.name)
  @SentryCronMonitor(
    AgentChatStaleTurnSweepCronJob.name,
    AGENT_CHAT_STALE_TURN_SWEEP_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const failedTurnCount =
      await this.agentChatTurnFailureService.sweepStaleTurns();

    if (failedTurnCount > 0) {
      this.logger.warn(
        `Marked ${failedTurnCount} AI chat turn(s) with no reply as failed`,
      );
    }
  }
}
