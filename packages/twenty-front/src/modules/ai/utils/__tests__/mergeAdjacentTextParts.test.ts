import { mergeAdjacentTextParts } from '@/ai/utils/mergeAdjacentTextParts';
import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

const webSearchToolPart = {
  type: 'tool-web_search',
  toolCallId: 'tool-1',
  input: { query: 'catholic schools' },
  output: { result: { ok: true } },
  state: 'output-available',
};

const sourceUrlPart = {
  type: 'source-url',
  sourceId: 'source-1',
  url: 'https://example.com/schools',
  title: 'Schools',
};

describe('mergeAdjacentTextParts', () => {
  it('should join a sentence split around a citation', () => {
    const messageParts = [
      { type: 'text', text: 'The docs say ' },
      { type: 'text', text: 'widgets are read-only by default' },
      { type: 'text', text: '.' },
    ] as ExtendedUIMessagePart[];

    expect(mergeAdjacentTextParts(messageParts)).toEqual([
      { type: 'text', text: 'The docs say widgets are read-only by default.' },
    ]);
  });

  it('should join a table row split around a citation', () => {
    const messageParts = [
      { type: 'text', text: '| School | City |\n|---|---|\n| ' },
      { type: 'text', text: 'St. Mary Academy' },
      { type: 'text', text: ' | Springfield |\n' },
    ] as ExtendedUIMessagePart[];

    expect(mergeAdjacentTextParts(messageParts)).toEqual([
      {
        type: 'text',
        text: '| School | City |\n|---|---|\n| St. Mary Academy | Springfield |\n',
      },
    ]);
  });

  it('should keep source parts and merge the text around them', () => {
    const messageParts = [
      { type: 'text', text: 'Founded in ' },
      sourceUrlPart,
      { type: 'text', text: '1902' },
      { type: 'text', text: '.' },
    ] as ExtendedUIMessagePart[];

    expect(mergeAdjacentTextParts(messageParts)).toEqual([
      { type: 'text', text: 'Founded in 1902.' },
      sourceUrlPart,
    ]);
  });

  it('should not merge text across tool, reasoning or step boundaries', () => {
    const messageParts = [
      { type: 'text', text: 'Let me search.' },
      webSearchToolPart,
      { type: 'text', text: 'Found it.' },
      { type: 'step-start' },
      { type: 'text', text: 'Next step.' },
      { type: 'reasoning', text: 'Thinking', state: 'done' },
      { type: 'text', text: 'Done.' },
    ] as ExtendedUIMessagePart[];

    expect(mergeAdjacentTextParts(messageParts)).toEqual(messageParts);
  });

  it('should keep the merged part streaming while any of its fragments is streaming', () => {
    const messageParts = [
      { type: 'text', text: 'Partial ', state: 'done' },
      { type: 'text', text: 'answer', state: 'streaming' },
    ] as ExtendedUIMessagePart[];

    expect(mergeAdjacentTextParts(messageParts)).toEqual([
      { type: 'text', text: 'Partial answer', state: 'streaming' },
    ]);
  });

  it('should not mutate the input parts', () => {
    const firstTextPart = { type: 'text' as const, text: 'Hello ' };
    const messageParts = [
      firstTextPart,
      { type: 'text', text: 'world' },
    ] as ExtendedUIMessagePart[];

    mergeAdjacentTextParts(messageParts);

    expect(firstTextPart.text).toBe('Hello ');
  });
});
