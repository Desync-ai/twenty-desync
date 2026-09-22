import { GRAY_SCALE_TOKENS } from './grayScale';
import { token } from './token';
export const ILLUSTRATION_ICON_TOKENS = {
  color: {
    blue: token({
      light: '#4E938A',
      dark: '#7EC3BC',
    }),
    gray: token({
      light: 'color(display-p3 0.6 0.6 0.6)',
      dark: 'color(display-p3 0.4 0.4 0.4)',
    }),
  },
  fill: {
    blue: token({
      light: '#B6D8D1',
      dark: '#CDE7E3',
    }),
    gray: GRAY_SCALE_TOKENS.gray5,
  },
};
