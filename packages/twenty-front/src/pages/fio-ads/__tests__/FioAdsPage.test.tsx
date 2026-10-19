import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { SettingsPath } from 'twenty-shared/types';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { calendarBookingPageIdState } from '@/client-config/states/calendarBookingPageIdState';
import { DESYNC_BOOK_CALL_MODAL_ID } from '@/navigation/constants/DesyncBookCallModalId';
import { DESYNC_BUG_REPORT_MODAL_ID } from '@/navigation/constants/DesyncBugReportModalId';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { messages } from '~/locales/generated/en';
import { FioAdsPage } from '~/pages/fio-ads/FioAdsPage';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const mockNavigateSettings = jest.fn();
const mockOpenModal = jest.fn();

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal, closeModal: jest.fn() }),
}));

jest.mock('twenty-ui/primitives/feedback', () => ({
  useToast: () => ({ enqueueToast: jest.fn() }),
}));

const mockFetch = (status: Record<string, unknown>) => {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const path = String(url);
    const body = path.endsWith('/status')
      ? status
      : path.endsWith('/prefill')
        ? { brandName: 'Example Brand', website: 'https://example.com' }
        : {};

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as Response);
  }) as jest.Mock;
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <JotaiProvider store={jotaiStore}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </JotaiProvider>
  </MemoryRouter>
);

const ELIGIBLE_STATUS = {
  eligible: true,
  reason: 'ok',
  alreadyLaunched: false,
  allowMultiple: false,
};

describe('FioAdsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
  });

  it('should offer an upgrade when the plan is not paid', async () => {
    mockFetch({ eligible: false, reason: 'not_paid', alreadyLaunched: false });

    render(<FioAdsPage />, { wrapper: Wrapper });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Upgrade plan' }),
    );

    expect(mockNavigateSettings).toHaveBeenCalledWith(SettingsPath.PlanBilling);
  });

  it.each(['referral', 'not_admin'])(
    'should offer to contact the team when the reason is %s',
    async (reason) => {
      jotaiStore.set(calendarBookingPageIdState.atom, 'team/desync/talk');
      mockFetch({ eligible: false, reason, alreadyLaunched: false });

      render(<FioAdsPage />, { wrapper: Wrapper });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Contact the Desync team' }),
      );

      expect(mockOpenModal).toHaveBeenCalledWith(DESYNC_BOOK_CALL_MODAL_ID);
    },
  );

  it('should fall back to the feedback modal without a booking page', async () => {
    mockFetch({ eligible: false, reason: 'referral', alreadyLaunched: false });

    render(<FioAdsPage />, { wrapper: Wrapper });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Contact the Desync team' }),
    );

    expect(mockOpenModal).toHaveBeenCalledWith(DESYNC_BUG_REPORT_MODAL_ID);
  });

  it('should not offer an action once the ad was submitted', async () => {
    mockFetch({ ...ELIGIBLE_STATUS, alreadyLaunched: true });

    render(<FioAdsPage />, { wrapper: Wrapper });

    expect(
      await screen.findByText(/already submitted its Fio ad/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should navigate back to a completed step from its header only', async () => {
    jotaiStore.set(currentUserState.atom, {
      email: 'person@example.com',
    } as never);
    jotaiStore.set(currentWorkspaceMemberState.atom, {
      name: { firstName: 'Test', lastName: 'Person' },
    } as never);
    mockFetch(ELIGIBLE_STATUS);

    render(<FioAdsPage />, { wrapper: Wrapper });

    expect(await screen.findByText('About your brand')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '2. Creative' }),
    ).not.toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: 'Next' });
    await screen.findByDisplayValue('Example Brand');
    await userEvent.click(nextButton);

    expect(await screen.findByText('Copy & links')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '1. Brand' }));

    expect(await screen.findByText('About your brand')).toBeInTheDocument();
  });

  it('should open the file picker when clicking anywhere on an upload field', async () => {
    jotaiStore.set(currentUserState.atom, {
      email: 'person@example.com',
    } as never);
    jotaiStore.set(currentWorkspaceMemberState.atom, {
      name: { firstName: 'Test', lastName: 'Person' },
    } as never);
    mockFetch(ELIGIBLE_STATUS);

    const { container } = render(<FioAdsPage />, { wrapper: Wrapper });

    await screen.findByDisplayValue('Example Brand');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Copy & links');

    const logoInput =
      container.querySelector<HTMLInputElement>('#fio-logo-input');
    const pickerOpened = jest.fn();
    logoInput?.addEventListener('click', pickerOpened);

    await userEvent.click(
      screen.getByText('At least 500x500, up to 1MB. JPG or transparent PNG.'),
    );

    expect(pickerOpened).toHaveBeenCalled();
  });
});
