import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render } from '@testing-library/react';
import { type ReactNode } from 'react';

import { type BLOCK_SCHEMA } from '@/blocknote-editor/blocks/Schema';
import { BlockEditor } from '@/blocknote-editor/components/BlockEditor';

const getItemsByTriggerCharacter: Record<string, unknown[]> = {};

jest.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('@blocknote/react', () => ({
  SuggestionMenuController: ({
    triggerCharacter,
    getItems,
  }: {
    triggerCharacter: string;
    getItems: unknown;
  }) => {
    getItemsByTriggerCharacter[triggerCharacter] = [
      ...(getItemsByTriggerCharacter[triggerCharacter] ?? []),
      getItems,
    ];
    return null;
  },
}));

jest.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: jest.fn(),
  SuggestionMenu: {},
}));

jest.mock('@/blocknote-editor/components/CustomSideMenu', () => ({
  CustomSideMenu: () => null,
}));

jest.mock('@/blocknote-editor/components/CustomMentionMenu', () => ({
  CustomMentionMenu: () => null,
}));

jest.mock('@/blocknote-editor/components/CustomSlashMenu', () => ({
  CustomSlashMenu: () => null,
}));

jest.mock('@/blocknote-editor/utils/getSlashMenu', () => ({
  getSlashMenu: jest.fn(),
}));

const mockGetMentionItems = jest.fn();

jest.mock('@/mention/hooks/useMentionMenu', () => ({
  useMentionMenu: () => mockGetMentionItems,
}));

describe('BlockEditor', () => {
  // BlockNote reloads suggestion items whenever getItems changes identity; a
  // new function per render fed a render loop (React #185) in the note editor.
  it('should pass the same getItems to the suggestion menus across re-renders', () => {
    const editor = {} as typeof BLOCK_SCHEMA.BlockNoteEditor;

    const renderEditor = (readonly: boolean) => (
      <I18nProvider i18n={i18n}>
        <BlockEditor editor={editor} readonly={readonly} />
      </I18nProvider>
    );

    const { rerender } = render(renderEditor(false));
    rerender(renderEditor(true));
    rerender(renderEditor(false));

    for (const triggerCharacter of ['/', '@']) {
      const getItemsPerRender = getItemsByTriggerCharacter[triggerCharacter];

      expect(getItemsPerRender.length).toBeGreaterThanOrEqual(3);
      expect(new Set(getItemsPerRender).size).toBe(1);
    }
  });
});
