import { isNonEmptyString } from '@sniptt/guards';
import { clsx } from 'clsx';
import { createContext, useLayoutEffect, useRef, useState } from 'react';

import { THEME_DARK } from '@ui/theme/constants/ThemeDark';
import { THEME_LIGHT } from '@ui/theme/constants/ThemeLight';
import { isDefined } from '@ui/utilities/utils/isDefined';

import { ThemeScopeContext } from './ThemeScopeContext';
import { themeCssVariables } from './themeCssVariables';
import { type ThemeType } from './themeTypes';

export type ThemeContextType = {
  theme: ThemeType;
  colorScheme: 'light' | 'dark';
};

export type ThemeOverrides = Record<string, string | number>;

const resolveTokenValue = (
  cssVariableReference: string,
  computedValue: string,
  staticValue: unknown,
): string | number => {
  if (!isNonEmptyString(computedValue)) {
    // Before the theme stylesheet has loaded no variable resolves. A colour can
    // stay a live var() reference, but a number (an animation duration, the
    // spacing multiplicator) feeds JS math and framer-motion, where the string
    // becomes NaN and Element.animate throws "duration must be non-negative".
    return typeof staticValue === 'number' ? staticValue : cssVariableReference;
  }

  const numericValue = Number(computedValue);

  return Number.isNaN(numericValue) ? computedValue : numericValue;
};

const computeThemeFromCss = (
  sourceElement?: HTMLElement,
  colorScheme: 'light' | 'dark' = 'light',
): ThemeType => {
  if (
    typeof document === 'undefined' ||
    typeof getComputedStyle !== 'function'
  ) {
    return themeCssVariables as unknown as ThemeType;
  }

  const computedStyle = getComputedStyle(
    sourceElement ?? document.documentElement,
  );

  const resolve = (
    obj: Record<string, unknown>,
    staticTheme: Record<string, unknown> | undefined,
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const staticValue = staticTheme?.[key];

      if (typeof value === 'string' && value.startsWith('var(')) {
        const varName = value.slice(4, -1);

        result[key] = resolveTokenValue(
          value,
          computedStyle.getPropertyValue(varName).trim(),
          staticValue,
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = resolve(
          value as Record<string, unknown>,
          typeof staticValue === 'object' && staticValue !== null
            ? (staticValue as Record<string, unknown>)
            : undefined,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  return resolve(
    themeCssVariables as unknown as Record<string, unknown>,
    (colorScheme === 'dark' ? THEME_DARK : THEME_LIGHT) as unknown as Record<
      string,
      unknown
    >,
  ) as unknown as ThemeType;
};

const applyColorSchemeClass = (colorScheme: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root?.classList) return;
  root.classList.toggle('dark', colorScheme === 'dark');
  root.classList.toggle('light', colorScheme === 'light');
};

export const ThemeContext = createContext<ThemeContextType>({
  theme: themeCssVariables as unknown as ThemeType,
  colorScheme: 'light',
});

export const ThemeProvider = ({
  children,
  colorScheme,
  applyToRoot = true,
  overrides,
  className,
  scale,
}: {
  children: React.ReactNode;
  colorScheme: 'light' | 'dark';
  applyToRoot?: boolean;
  overrides?: ThemeOverrides;
  className?: string;
  scale?: number;
}) => {
  const isScoped = isDefined(overrides) || !applyToRoot;

  const wrapperRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<ThemeType>(() => {
    if (applyToRoot) {
      applyColorSchemeClass(colorScheme);
    }
    return computeThemeFromCss(undefined, colorScheme);
  });
  const [scopeContainer, setScopeContainer] = useState<HTMLElement | null>(
    null,
  );

  const overridesKey = isDefined(overrides) ? JSON.stringify(overrides) : '';

  useLayoutEffect(() => {
    if (applyToRoot) {
      applyColorSchemeClass(colorScheme);
    }

    setTheme(
      computeThemeFromCss(
        isScoped ? (wrapperRef.current ?? undefined) : undefined,
        colorScheme,
      ),
    );
    setScopeContainer(isScoped ? wrapperRef.current : null);
  }, [colorScheme, applyToRoot, isScoped, overridesKey]);

  // The interface scale preference is consumed by the root zoom rule in the
  // app stylesheet through --t-scale-user, which only reads from the html
  // element, so scoped providers ignore the prop instead of writing a value
  // nothing consumes. Computed styles stay unzoomed, so no theme recompute is
  // needed when the value changes. The cleanup is only registered from the
  // branch that set the property, so a provider mounted without a scale can
  // never clear a value another provider owns.
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || isScoped || !isDefined(scale)) {
      return;
    }

    const scaleTarget = document.documentElement;

    scaleTarget.style.setProperty('--t-scale-user', String(scale));

    return () => {
      scaleTarget.style.removeProperty('--t-scale-user');
    };
  }, [scale, isScoped]);

  const contextValue = { theme, colorScheme };

  if (!isScoped) {
    return (
      <ThemeContext.Provider value={contextValue}>
        {children}
      </ThemeContext.Provider>
    );
  }

  const overridesStyle = (overrides ?? {}) as React.CSSProperties;

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeScopeContext.Provider value={scopeContainer}>
        <div
          ref={wrapperRef}
          className={clsx(applyToRoot ? undefined : colorScheme, className)}
          style={{ display: 'contents', ...overridesStyle }}
        >
          {children}
        </div>
      </ThemeScopeContext.Provider>
    </ThemeContext.Provider>
  );
};
