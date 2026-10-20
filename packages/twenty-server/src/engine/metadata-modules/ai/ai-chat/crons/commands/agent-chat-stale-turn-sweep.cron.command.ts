import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { AGENT_CHAT_STALE_TURN_SWEEP_CRON_PATTERN } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-stale-turn-sweep.constant';
import { AgentChatStaleTurnSweepCronJob } from 'src/engine/metadata-modules/ai/ai-chat/crons/jobs/agent-chat-stale-turn-sweep.cron.job';

@Command({
  name: 'cron:ai-chat:stale-turn-sweep',
  description:
    'Starts a cron job that marks AI chat turns left without a reply as failed',
})
export class AgentChatStaleTurnSweepCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: AgentChatStaleTurnSweepCronJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: AGENT_CHAT_STALE_TURN_SWEEP_CRON_PATTERN,
        },
      },
    });
  }
}
