import { i18n } from '@lingui/core';

import { AiException } from 'src/engine/metadata-modules/ai/ai.exception';
import { AGENT_CHAT_TURN_ERROR_CODES } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-turn-error-codes.constant';
import { AGENT_CHAT_TURN_ERROR_MESSAGES } from 'src/engine/metadata-modules/ai/ai-chat/constants/agent-chat-turn-error-messages.constant';
import { type AgentChatTurnError } from 'src/engine/metadata-modules/ai/ai-chat/types/agent-chat-turn-error.type';
import { EmptyAgentChatResponseError } from 'src/engine/metadata-modules/ai/ai-chat/utils/empty-agent-chat-response.error';
import { STREAM_EXECUTION_FAILED_CODE } from 'src/engine/metadata-modules/ai/ai-chat/utils/map-error-to-stream-error.util';

const translateUserFriendlyMessage = (error: AiException): string => {
  try {
    return i18n._(error.userFriendlyMessage);
  } catch {
    return error.message;
  }
};

// Provider and internal error messages are not meant for end users (e.g. an
// assertUnreachable message), so only AiException codes keep their own text.
export const buildAgentChatTurnError = (error: unknown): AgentChatTurnError => {
  if (error instanceof EmptyAgentChatResponseError) {
    return {
      code: AGENT_CHAT_TURN_ERROR_CODES.EMPTY_RESPONSE,
      message: AGENT_CHAT_TURN_ERROR_MESSAGES.emptyResponse,
    };
  }

  if (error instanceof AiException) {
    return { code: error.code, message: translateUserFriendlyMessage(error) };
  }

  return {
    code: STREAM_EXECUTION_FAILED_CODE,
    message: AGENT_CHAT_TURN_ERROR_MESSAGES.generic,
  };
};
