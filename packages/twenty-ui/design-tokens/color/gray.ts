import { token } from '../token';

// Desync brand recolor: the neutral ramp is repainted onto the Desync parchment
// axis. Keys stay gray1..gray12 (backgrounds, borders and font colors all derive
// from these), only values change. The light end is warm parchment/limestone/rule
// for surfaces (gray1 = parchment #F7F4EE, gray5 ≈ limestone, gray7 = rule); the
// dark end cools to Desync slate/ink for text (gray12 = slate #283238). The dark
// theme keeps upstream's values, as shipped. Lightness order mirrors the original
// gray ramp.
// The transparent overlays stay pure black/white alpha (hue-neutral on any ground).
export const GRAY_COLOR_TOKENS = {
  scale: {
    gray1: token({
      light: '#F7F4EE',
      dark: 'color(display-p3 0.09 0.09 0.09)',
    }),
    gray2: token({
      light: '#F3EFE7',
      dark: 'color(display-p3 0.106 0.106 0.106)',
    }),
    gray3: token({
      light: '#F1ECE3',
      dark: 'color(display-p3 0.098 0.098 0.098)',
    }),
    gray4: token({
      light: '#ECE7DC',
      dark: 'color(display-p3 0.114 0.114 0.114)',
    }),
    gray5: token({
      light: '#E7E1D4',
      dark: 'color(display-p3 0.133 0.133 0.133)',
    }),
    gray6: token({
      light: '#D7CFBC',
      dark: 'color(display-p3 0.282 0.282 0.282)',
    }),
    gray7: token({
      light: '#CCC4B2',
      dark: 'color(display-p3 0.298 0.298 0.298)',
    }),
    gray8: token({ light: '#ADA491', dark: 'color(display-p3 0.4 0.4 0.4)' }),
    gray9: token({
      light: '#8B948E',
      dark: 'color(display-p3 0.506 0.506 0.506)',
    }),
    gray10: token({
      light: '#6E7A7E',
      dark: 'color(display-p3 0.482 0.482 0.482)',
    }),
    gray11: token({
      light: '#55636B',
      dark: 'color(display-p3 0.702 0.702 0.702)',
    }),
    gray12: token({
      light: '#283238',
      dark: 'color(display-p3 0.922 0.922 0.922)',
    }),
  },
  transparent: {
    gray1: token({
      light: 'color(display-p3 0 0 0 / 0.02)',
      dark: 'color(display-p3 1 1 1 / 0.031)',
    }),
    gray2: token({
      light: 'color(display-p3 0 0 0 / 0.039)',
      dark: 'color(display-p3 1 1 1 / 0.059)',
    }),
    gray3: token({
      light: 'color(display-p3 0 0 0 / 0.047)',
      dark: 'color(display-p3 1 1 1 / 0.047)',
    }),
    gray4: token({
      light: 'color(display-p3 0 0 0 / 0.071)',
      dark: 'color(display-p3 1 1 1 / 0.071)',
    }),
    gray5: token({
      light: 'color(display-p3 0 0 0 / 0.078)',
      dark: 'color(display-p3 1 1 1 / 0.102)',
    }),
    gray6: token({
      light: 'color(display-p3 0 0 0 / 0.114)',
      dark: 'color(display-p3 1 1 1 / 0.114)',
    }),
    gray7: token({
      light: 'color(display-p3 0 0 0 / 0.161)',
      dark: 'color(display-p3 1 1 1 / 0.141)',
    }),
    gray8: token({
      light: 'color(display-p3 0 0 0 / 0.22)',
      dark: 'color(display-p3 1 1 1 / 0.22)',
    }),
    gray9: token({
      light: 'color(display-p3 0 0 0 / 0.361)',
      dark: 'color(display-p3 1 1 1 / 0.427)',
    }),
    gray10: token({
      light: 'color(display-p3 0 0 0 / 0.478)',
      dark: 'color(display-p3 1 1 1 / 0.478)',
    }),
    gray11: token({
      light: 'color(display-p3 0 0 0 / 0.722)',
      dark: 'color(display-p3 1 1 1 / 0.565)',
    }),
    gray12: token({
      light: 'color(display-p3 0 0 0 / 0.91)',
      dark: 'color(display-p3 1 1 1 / 0.91)',
    }),
  },
};
