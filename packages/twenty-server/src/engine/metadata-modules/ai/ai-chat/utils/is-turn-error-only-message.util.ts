import { isNonEmptyArray } from 'twenty-shared/utils';

import { type AgentMessagePartEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-message-part.entity';

export const isTurnErrorOnlyMessage = (message: {
  parts?: Pick<AgentMessagePartEntity, 'type'>[] | null;
}): boolean =>
  isNonEmptyArray(message.parts) &&
  message.parts.every((part) => part.type === 'data-turn-error');
