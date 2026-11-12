import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { buildAgentChatTurnError } from 'src/engine/metadata-modules/ai/ai-chat/utils/build-agent-chat-turn-error.util';
import { EmptyAgentChatResponseError } from 'src/engine/metadata-modules/ai/ai-chat/utils/empty-agent-chat-response.error';

describe('buildAgentChatTurnError', () => {
  it('hides internal error messages behind a generic reason', () => {
    expect(
      buildAgentChatTurnError(new Error("Didn't expect to get here.")),
    ).toEqual({
      code: 'STREAM_EXECUTION_FAILED',
      message:
        'Something went wrong while generating a response. Please try again.',
    });
  });

  it('uses the user-friendly message of an AiException', () => {
    const turnError = buildAgentChatTurnError(
      new AiException(
        'internal detail',
        AiExceptionCode.CONTEXT_WINDOW_EXCEEDED,
      ),
    );

    expect(turnError.code).toBe(AiExceptionCode.CONTEXT_WINDOW_EXCEEDED);
    expect(turnError.message).not.toBe('internal detail');
    expect(turnError.message.length).toBeGreaterThan(0);
  });

  it('reports an empty response', () => {
    expect(buildAgentChatTurnError(new EmptyAgentChatResponseError())).toEqual({
      code: 'EMPTY_RESPONSE',
      message: 'The assistant returned an empty response. Please try again.',
    });
  });
});
