import { type TextUIPart } from 'ai';
import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

const isSourcePart = (part: ExtendedUIMessagePart) =>
  part.type === 'source-url' || part.type === 'source-document';

// Web search answers arrive with every cited span as its own text part, often
// mid-sentence or mid-table-row. Rendering each part as a separate markdown
// block breaks the layout, so adjacent text parts are joined back together.
// Source parts render nothing and are kept, so they don't break adjacency.
export const mergeAdjacentTextParts = (
  parts: ExtendedUIMessagePart[],
): ExtendedUIMessagePart[] => {
  const mergedParts: ExtendedUIMessagePart[] = [];
  let openTextPartIndex: number | null = null;

  for (const part of parts) {
    if (part.type === 'text') {
      if (openTextPartIndex === null) {
        openTextPartIndex = mergedParts.length;
        mergedParts.push(part);
        continue;
      }

      const openTextPart = mergedParts[openTextPartIndex] as TextUIPart;

      mergedParts[openTextPartIndex] = {
        ...openTextPart,
        text: openTextPart.text + part.text,
        state:
          openTextPart.state === 'streaming' || part.state === 'streaming'
            ? 'streaming'
            : (part.state ?? openTextPart.state),
      };
      continue;
    }

    if (!isSourcePart(part)) {
      openTextPartIndex = null;
    }

    mergedParts.push(part);
  }

  return mergedParts;
};
