import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

import { isEmptyAgentChatResponse } from 'src/engine/metadata-modules/ai/ai-chat/utils/is-empty-agent-chat-response.util';

describe('isEmptyAgentChatResponse', () => {
  it('treats step markers, reasoning and blank text as empty', () => {
    expect(
      isEmptyAgentChatResponse([
        { type: 'step-start' },
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: '  ' },
      ] as ExtendedUIMessagePart[]),
    ).toBe(true);
  });

  it('counts text as a reply', () => {
    expect(
      isEmptyAgentChatResponse([
        { type: 'text', text: 'Hello' },
      ] as ExtendedUIMessagePart[]),
    ).toBe(false);
  });

  it('counts a tool call as a reply', () => {
    expect(
      isEmptyAgentChatResponse([
        {
          type: 'tool-find_companies',
          toolCallId: 'tool-call-id',
          state: 'output-available',
          input: {},
          output: {},
        },
      ] as ExtendedUIMessagePart[]),
    ).toBe(false);
  });
});
