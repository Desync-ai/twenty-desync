import { isNonEmptyString } from '@sniptt/guards';
import { isToolUIPart } from 'ai';
import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

// Tool calls count as a reply: they may have changed data, and retrying the
// turn would run them again.
export const isEmptyAgentChatResponse = (
  parts: ExtendedUIMessagePart[],
): boolean =>
  !parts.some(
    (part) =>
      (part.type === 'text' && isNonEmptyString(part.text.trim())) ||
      isToolUIPart(part),
  );
