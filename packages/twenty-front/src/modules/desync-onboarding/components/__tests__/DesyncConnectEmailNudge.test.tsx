import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { isMicrosoftMessagingEnabledState } from '@/client-config/states/isMicrosoftMessagingEnabledState';
import { DesyncConnectEmailNudge } from '@/desync-onboarding/components/DesyncConnectEmailNudge';
import { isConnectEmailNudgeDismissed } from '@/desync-onboarding/utils/connectEmailNudgeDismissed';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

import { messages } from '~/locales/generated/en';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';

const triggerApisOAuthMock = jest.fn();

jest.mock('@/settings/accounts/hooks/useMyConnectedAccounts', () => ({
  useMyConnectedAccounts: jest.fn(),
}));

jest.mock('@/settings/accounts/hooks/useTriggerApiOAuth', () => ({
  useTriggerApisOAuth: () => ({ triggerApisOAuth: triggerApisOAuthMock }),
}));

const useMyConnectedAccountsMock = jest.mocked(useMyConnectedAccounts);

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const Wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(
    JotaiProvider,
    { store: jotaiStore },
    createElement(
      I18nProvider,
      { i18n },
      createElement(
        MemoryRouter,
        { initialEntries: ['/get-started'] },
        children,
      ),
    ),
  );

const mockAccounts = (accounts: { id: string }[], loading = false) =>
  useMyConnectedAccountsMock.mockReturnValue({
    accounts,
    loading,
  } as unknown as ReturnType<typeof useMyConnectedAccounts>);

describe('DesyncConnectEmailNudge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    triggerApisOAuthMock.mockReset();
    resetJotaiStore();
    jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
    jotaiStore.set(isGoogleMessagingEnabledState.atom, true);
    mockAccounts([]);
  });

  it('offers Gmail when no email account is connected', async () => {
    render(<DesyncConnectEmailNudge placement="get-started" />, {
      wrapper: Wrapper,
    });

    expect(
      screen.getByText('Connect Gmail to fill your CRM'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    );

    expect(triggerApisOAuthMock).toHaveBeenCalledWith(
      ConnectedAccountProvider.GOOGLE,
      expect.objectContaining({ redirectLocation: '/get-started' }),
    );
  });

  it('offers Outlook when only Microsoft is enabled', () => {
    jotaiStore.set(isGoogleMessagingEnabledState.atom, false);
    jotaiStore.set(isMicrosoftMessagingEnabledState.atom, true);

    render(<DesyncConnectEmailNudge placement="empty-people" />, {
      wrapper: Wrapper,
    });

    expect(
      screen.getByText('Connect Outlook to fill your CRM'),
    ).toBeInTheDocument();
  });

  it('renders nothing when an email account is already connected', () => {
    mockAccounts([{ id: 'account-1' }]);

    render(<DesyncConnectEmailNudge placement="get-started" />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText(/to fill your CRM/)).not.toBeInTheDocument();
  });

  it('renders nothing while accounts are loading', () => {
    mockAccounts([], true);

    render(<DesyncConnectEmailNudge placement="get-started" />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText(/to fill your CRM/)).not.toBeInTheDocument();
  });

  it('renders nothing when no email provider is enabled', () => {
    jotaiStore.set(isGoogleMessagingEnabledState.atom, false);

    render(<DesyncConnectEmailNudge placement="get-started" />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText(/to fill your CRM/)).not.toBeInTheDocument();
  });

  it('stays hidden after the user closes it', async () => {
    const { unmount } = render(
      <DesyncConnectEmailNudge placement="get-started" />,
      { wrapper: Wrapper },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText(/to fill your CRM/)).not.toBeInTheDocument();
    expect(isConnectEmailNudgeDismissed(mockCurrentWorkspace.id)).toBe(true);

    unmount();
    render(<DesyncConnectEmailNudge placement="get-started" />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText(/to fill your CRM/)).not.toBeInTheDocument();
  });
});
