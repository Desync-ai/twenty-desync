import { isTurnErrorOnlyMessage } from 'src/engine/metadata-modules/ai/ai-chat/utils/is-turn-error-only-message.util';

describe('isTurnErrorOnlyMessage', () => {
  it('matches a message made only of turn error parts', () => {
    expect(
      isTurnErrorOnlyMessage({ parts: [{ type: 'data-turn-error' }] }),
    ).toBe(true);
  });

  it('does not match a reply with content or an empty message', () => {
    expect(
      isTurnErrorOnlyMessage({
        parts: [{ type: 'text' }, { type: 'data-turn-error' }],
      }),
    ).toBe(false);
    expect(isTurnErrorOnlyMessage({ parts: [] })).toBe(false);
    expect(isTurnErrorOnlyMessage({ parts: null })).toBe(false);
  });
});
