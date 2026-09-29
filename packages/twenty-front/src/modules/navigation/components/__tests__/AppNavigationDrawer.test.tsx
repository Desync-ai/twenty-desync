import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AppNavigationDrawer } from '@/navigation/components/AppNavigationDrawer';
import { useIsSettingsDrawer } from '@/navigation/hooks/useIsSettingsDrawer';
import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

jest.mock('@/navigation/hooks/useIsSettingsDrawer');
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile');

jest.mock('@/navigation/components/MainNavigationDrawerContent', () => ({
  MainNavigationDrawerContent: () => <div>Main content</div>,
}));

jest.mock('@/navigation/components/MainNavigationDrawerModeSwitcher', () => ({
  MainNavigationDrawerModeSwitcher: () => (
    <button type="button">Navigation modes</button>
  ),
}));

jest.mock('@/navigation/components/SettingsNavigationDrawerContent', () => ({
  SettingsNavigationDrawerContent: () => <div>Settings content</div>,
}));

// The real button pulls in i18n, auth and Apollo; none of that is relevant
// here, so it's swapped for a stand-in like the other drawer sections.
jest.mock('@/navigation/components/NavigationDrawerLogoutButton', () => ({
  NavigationDrawerLogoutButton: () => <div>Log out</div>,
}));

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawer',
  () => ({
    NavigationDrawer: ({ children }: { children: ReactNode }) => (
      <aside>{children}</aside>
    ),
  }),
);

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerFixedContent',
  () => ({
    NavigationDrawerFixedContent: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

// The new Ontology item reads its enabled state from jotai and links via
// react-router, so every render here needs both providers.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <MemoryRouter>{children}</MemoryRouter>
  </JotaiProvider>
);

const renderAppNavigationDrawer = () =>
  render(<AppNavigationDrawer />, { wrapper: Wrapper });

describe('AppNavigationDrawer', () => {
  beforeEach(() => {
    jest.mocked(useIsMobile).mockReturnValue(false);
    jest.mocked(useIsSettingsDrawer).mockReturnValue(false);
    resetJotaiStore();
  });

  it('keeps the mode switcher mounted when the drawer content changes', () => {
    const { rerender } = renderAppNavigationDrawer();
    const modeSwitcher = screen.getByRole('button', {
      name: 'Navigation modes',
    });

    expect(screen.getByText('Main content')).toBeInTheDocument();

    jest.mocked(useIsSettingsDrawer).mockReturnValue(true);
    rerender(<AppNavigationDrawer />);

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigation modes' })).toBe(
      modeSwitcher,
    );
  });

  it('leaves mode switching to the navigation bar on mobile', () => {
    jest.mocked(useIsMobile).mockReturnValue(true);
    jest.mocked(useIsSettingsDrawer).mockReturnValue(true);

    renderAppNavigationDrawer();

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Navigation modes' }),
    ).not.toBeInTheDocument();
  });

  it('hides the Ontology item when the console is not configured', () => {
    renderAppNavigationDrawer();

    expect(screen.queryByText('Ontology')).not.toBeInTheDocument();
  });

  it('shows the Ontology item in the main drawer when the console is configured', () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: true,
      consoleUrl: 'https://console.example.com',
    });

    renderAppNavigationDrawer();

    expect(screen.getByText('Ontology')).toBeInTheDocument();
  });

  it('hides the Ontology item in the settings drawer even when the console is configured', () => {
    jest.mocked(useIsSettingsDrawer).mockReturnValue(true);
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: true,
      consoleUrl: 'https://console.example.com',
    });

    renderAppNavigationDrawer();

    expect(screen.queryByText('Ontology')).not.toBeInTheDocument();
  });
});
