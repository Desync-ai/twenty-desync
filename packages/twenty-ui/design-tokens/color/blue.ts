import { token } from '../token';

// Desync brand recolor: the "blue" accent ramp is repainted in Desync cathedral
// teal. Keys stay blue1..blue12 (accent.ts / mainColors.ts reference them), only
// values change. Step 9 is the brand anchor (#0E3D41 light / lifted #6FB8B2 dark);
// light steps 1-7 are teal tints for selection/hover/border, the dark end holds
// teal-deep. Lightness order mirrors the original blue ramp so contrast is kept.
export const BLUE_COLOR_TOKENS = {
  scale: {
    blue1: token({ light: '#F4FAF8', dark: '#0F1D1A' }),
    blue2: token({ light: '#EDF6F3', dark: '#122320' }),
    blue3: token({ light: '#DFEEEA', dark: '#143028' }),
    blue4: token({ light: '#CDE4DF', dark: '#173630' }),
    blue5: token({ light: '#B6D8D1', dark: '#1C4139' }),
    blue6: token({ light: '#9AC7BF', dark: '#245049' }),
    blue7: token({ light: '#77AEA6', dark: '#2E635B' }),
    blue8: token({ light: '#4E938A', dark: '#4E837A' }),
    blue9: token({ light: '#0E3D41', dark: '#6FB8B2' }),
    blue10: token({ light: '#0C373B', dark: '#7EC3BC' }),
    blue11: token({ light: '#0B2F33', dark: '#A9D6D0' }),
    blue12: token({ light: '#082528', dark: '#CDE7E3' }),
  },
  transparent: {
    blue1: token({ light: '#0E3D4102', dark: '#6FB8B20f' }),
    blue2: token({ light: '#0E3D4108', dark: '#6FB8B217' }),
    blue3: token({ light: '#0E3D4112', dark: '#6FB8B23c' }),
    blue4: token({ light: '#0E3D411e', dark: '#6FB8B257' }),
    blue5: token({ light: '#0E3D412d', dark: '#6FB8B26b' }),
    blue6: token({ light: '#0E3D413e', dark: '#6FB8B27c' }),
    blue7: token({ light: '#0E3D4154', dark: '#6FB8B290' }),
    blue8: token({ light: '#0E3D4172', dark: '#6FB8B2ac' }),
    blue9: token({ light: '#0E3D41c1', dark: '#6FB8B2db' }),
    blue10: token({ light: '#0E3D41cc', dark: '#6FB8B2e3' }),
    blue11: token({ light: '#0E3D41c5', dark: '#9ED0CB' }),
    blue12: token({ light: '#0E3D41e0', dark: '#CDE7E3' }),
  },
};
