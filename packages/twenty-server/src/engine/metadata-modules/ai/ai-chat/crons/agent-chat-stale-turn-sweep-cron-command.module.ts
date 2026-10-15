import { Module } from '@nestjs/common';

import { AgentChatStaleTurnSweepCronCommand } from 'src/engine/metadata-modules/ai/ai-chat/crons/commands/agent-chat-stale-turn-sweep.cron.command';

// Only registers the cron; the job itself runs in AiChatModule, next to the
// services it needs.
@Module({
  providers: [AgentChatStaleTurnSweepCronCommand],
  exports: [AgentChatStaleTurnSweepCronCommand],
})
export class AgentChatStaleTurnSweepCronCommandModule {}
