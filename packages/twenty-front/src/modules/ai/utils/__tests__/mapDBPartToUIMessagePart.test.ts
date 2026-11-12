import { type AgentMessagePart } from '~/generated-metadata/graphql';

import { mapDBPartToUIMessagePart } from '@/ai/utils/mapDBPartToUIMessagePart';

describe('mapDBPartToUIMessagePart', () => {
  it('preserves OpenAI encrypted reasoning metadata', () => {
    const providerMetadata = {
      openai: {
        itemId: 'rs_123',
        reasoningEncryptedContent: 'encrypted-content',
      },
    };

    expect(
      mapDBPartToUIMessagePart({
        type: 'reasoning',
        reasoningContent: 'reasoning summary',
        state: 'done',
        providerMetadata,
      } as AgentMessagePart),
    ).toEqual({
      type: 'reasoning',
      text: 'reasoning summary',
      state: 'done',
      providerMetadata,
    });
  });

  it('maps a persisted turn error to its code and message', () => {
    expect(
      mapDBPartToUIMessagePart({
        type: 'data-turn-error',
        textContent: 'No response was received. Please try again.',
        state: 'STREAM_INTERRUPTED',
      } as AgentMessagePart),
    ).toEqual({
      type: 'data-turn-error',
      data: {
        code: 'STREAM_INTERRUPTED',
        message: 'No response was received. Please try again.',
      },
    });
  });
});
