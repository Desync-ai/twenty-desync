import { ToolCategory } from 'twenty-shared/ai';

import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { buildToolCatalogSection } from 'src/engine/core-modules/tool-provider/utils/build-tool-catalog-section.util';

const buildToolEntry = (category: ToolCategory): ToolIndexEntry => ({
  name: `tool_${category.toLowerCase()}`,
  label: category,
  description: '',
  category,
  executionRef: { kind: 'static', toolId: `tool_${category.toLowerCase()}` },
});

describe('buildToolCatalogSection', () => {
  // A category without a label used to throw while building the system
  // prompt, which failed every chat turn of users who had such tools.
  it.each(Object.values(ToolCategory))(
    'renders a catalog section for %s tools',
    (category) => {
      const section = buildToolCatalogSection([buildToolEntry(category)], []);

      expect(section).toContain(`tool_${category.toLowerCase()}`);
    },
  );
});
