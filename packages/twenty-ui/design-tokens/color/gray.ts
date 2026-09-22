import { token } from '../token';

// Desync brand recolor: the neutral ramp is repainted onto the Desync parchment
// axis. Keys stay gray1..gray12 (backgrounds, borders and font colors all derive
// from these), only values change. The light end is warm parchment/limestone/rule
// for surfaces (gray1 = parchment #F7F4EE, gray5 ≈ limestone, gray7 = rule); the
// dark end cools to Desync slate/ink for text (gray12 = slate #283238). Dark theme
// uses the "templar dark" surfaces (gray1 = #0E1A17, gray5 = #172420, gray6 = rule
// #2C3A35) lifting to ink #E9F0EB. Lightness order mirrors the original gray ramp.
// The transparent overlays stay pure black/white alpha (hue-neutral on any ground).
export const GRAY_COLOR_TOKENS = {
  scale: {
    gray1: token({ light: '#F7F4EE', dark: '#0E1A17' }),
    gray2: token({ light: '#F3EFE7', dark: '#111E1A' }),
    gray3: token({ light: '#F1ECE3', dark: '#101C19' }),
    gray4: token({ light: '#ECE7DC', dark: '#14211D' }),
    gray5: token({ light: '#E7E1D4', dark: '#172420' }),
    gray6: token({ light: '#D7CFBC', dark: '#2C3A35' }),
    gray7: token({ light: '#CCC4B2', dark: '#34433D' }),
    gray8: token({ light: '#ADA491', dark: '#4A5A53' }),
    gray9: token({ light: '#8B948E', dark: '#6E7A73' }),
    gray10: token({ light: '#6E7A7E', dark: '#7C8A83' }),
    gray11: token({ light: '#55636B', dark: '#C4D0CA' }),
    gray12: token({ light: '#283238', dark: '#E9F0EB' }),
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
