import { token } from '../token';

// Desync brand recolor: the "blue" accent ramp is repainted in Desync cathedral
// teal. Keys stay blue1..blue12 (accent.ts / mainColors.ts reference them), only
// values change. Step 9 is the brand anchor (#0E3D41); light steps 1-7 are teal
// tints for selection/hover/border. The dark theme keeps upstream's values, as
// shipped. Lightness order mirrors the original blue ramp so contrast is kept.
export const BLUE_COLOR_TOKENS = {
  scale: {
    blue1: token({
      light: '#F4FAF8',
      dark: 'color(display-p3 0.068 0.074 0.118)',
    }),
    blue2: token({
      light: '#EDF6F3',
      dark: 'color(display-p3 0.081 0.089 0.144)',
    }),
    blue3: token({
      light: '#DFEEEA',
      dark: 'color(display-p3 0.105 0.141 0.275)',
    }),
    blue4: token({
      light: '#CDE4DF',
      dark: 'color(display-p3 0.129 0.18 0.369)',
    }),
    blue5: token({
      light: '#B6D8D1',
      dark: 'color(display-p3 0.163 0.22 0.439)',
    }),
    blue6: token({
      light: '#9AC7BF',
      dark: 'color(display-p3 0.203 0.262 0.5)',
    }),
    blue7: token({
      light: '#77AEA6',
      dark: 'color(display-p3 0.245 0.309 0.575)',
    }),
    blue8: token({
      light: '#4E938A',
      dark: 'color(display-p3 0.285 0.362 0.674)',
    }),
    blue9: token({
      light: '#0E3D41',
      dark: 'color(display-p3 0.276 0.384 0.837)',
    }),
    blue10: token({
      light: '#0C373B',
      dark: 'color(display-p3 0.354 0.445 0.866)',
    }),
    blue11: token({ light: '#0B2F33', dark: 'color(display-p3 0.63 0.69 1)' }),
    blue12: token({
      light: '#082528',
      dark: 'color(display-p3 0.848 0.881 0.99)',
    }),
  },
  transparent: {
    blue1: token({ light: '#0E3D4102', dark: '#1133ff0f' }),
    blue2: token({ light: '#0E3D4108', dark: '#3354fa17' }),
    blue3: token({ light: '#0E3D4112', dark: '#2f62ff3c' }),
    blue4: token({ light: '#0E3D411e', dark: '#3566ff57' }),
    blue5: token({ light: '#0E3D412d', dark: '#4171fd6b' }),
    blue6: token({ light: '#0E3D413e', dark: '#5178fd7c' }),
    blue7: token({ light: '#0E3D4154', dark: '#5a7fff90' }),
    blue8: token({ light: '#0E3D4172', dark: '#5b81feac' }),
    blue9: token({ light: '#0E3D41c1', dark: '#4671ffdb' }),
    blue10: token({ light: '#0E3D41cc', dark: '#5c7efee3' }),
    blue11: token({ light: '#0E3D41c5', dark: '#9eb1ff' }),
    blue12: token({ light: '#0E3D41e0', dark: '#d6e1ff' }),
  },
};
