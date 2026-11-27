import { render, screen } from '@testing-library/react';

import { ThemeProvider } from '../ThemeProvider';
import { useTheme } from '../useTheme';

const AnimationDurations = () => {
  const theme = useTheme();

  return (
    <>
      <span data-testid="fast">{typeof theme.animation.duration.fast}</span>
      <span data-testid="fast-value">{theme.animation.duration.fast}</span>
    </>
  );
};

describe('ThemeProvider', () => {
  it('gives numeric animation durations before the theme stylesheet has loaded', () => {
    // jsdom loads no theme CSS, so no --t-* variable resolves: the state the
    // app is in while its stylesheet is still on the way or failed to preload.
    render(
      <ThemeProvider colorScheme="light">
        <AnimationDurations />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('fast')).toHaveTextContent('number');
    expect(screen.getByTestId('fast-value')).toHaveTextContent('0.15');
  });

  it('keeps an unresolved colour as its live var() reference', () => {
    const Colour = () => {
      const theme = useTheme();

      return (
        <span data-testid="colour">{String(theme.font.color.primary)}</span>
      );
    };

    render(
      <ThemeProvider colorScheme="dark">
        <Colour />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('colour').textContent).toMatch(/^var\(--t-/);
  });
});
