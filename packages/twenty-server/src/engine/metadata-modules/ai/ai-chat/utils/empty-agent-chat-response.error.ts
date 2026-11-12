import { AGENT_CHAT_TURN_ERROR_MESSAGES } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-turn-error-messages.constant';

export class EmptyAgentChatResponseError extends Error {
  constructor() {
    super(AGENT_CHAT_TURN_ERROR_MESSAGES.emptyResponse);
    this.name = 'EmptyAgentChatResponseError';
  }
}
