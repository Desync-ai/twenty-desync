import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  DesyncCheckoutForm,
  type DesyncPlan,
} from '@/desync-onboarding/components/DesyncCheckoutForm';

const mockCreateSubscription = jest.fn();
const mockActivateSubscription = jest.fn();
const mockApolloQuery = jest.fn();
const mockConfirmCardSetup = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockApolloQuery }),
  useMutation: (mutation: { definitions: { name?: { value: string } }[] }) =>
    mutation.definitions[0]?.name?.value === 'CreateDesyncSubscription'
      ? [mockCreateSubscription]
      : [mockActivateSubscription],
}));

jest.mock('@stripe/react-stripe-js', () => ({
  CardElement: () => null,
  useElements: () => ({ getElement: () => ({}) }),
  useStripe: () => ({ confirmCardSetup: mockConfirmCardSetup }),
}));

jest.mock('twenty-ui/primitives/feedback', () => ({
  ...jest.requireActual('twenty-ui/primitives/feedback'),
  useToast: () => ({ enqueueToast: jest.fn() }),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  ...jest.requireActual('twenty-ui/theme-constants'),
  useTheme: () => ({ name: 'light' }),
}));

const PLANS: DesyncPlan[] = [
  {
    key: 'starter',
    name: 'Starter',
    priceIdMonthly: 'price_starter_monthly',
    priceIdAnnual: 'price_starter_annual',
    monthlyPriceUsd: 75,
    recordQuota: 300,
  },
  {
    key: 'crusader',
    name: 'Crusader',
    priceIdMonthly: 'price_crusader_monthly',
    priceIdAnnual: 'price_crusader_annual',
    monthlyPriceUsd: 150,
    recordQuota: 900,
  },
];

type WindowWithPostHog = Window & { posthog?: { capture: jest.Mock } };

const windowWithPostHog = window as WindowWithPostHog;

const getCapturedEvents = () =>
  windowWithPostHog.posthog?.capture.mock.calls.map(
    ([eventName, properties]) => [eventName, properties],
  );

describe('DesyncCheckoutForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    windowWithPostHog.posthog = { capture: jest.fn() };
    mockCreateSubscription.mockResolvedValue({
      data: {
        createDesyncSubscription: {
          clientSecret: 'seti_secret',
          setupIntentId: 'seti_1',
        },
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete windowWithPostHog.posthog;
  });

  it('should track the plan choice and a declined card by Stripe code only', async () => {
    mockConfirmCardSetup.mockResolvedValue({
      error: {
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card has insufficient funds.',
      },
    });
    const user = userEvent.setup();

    render(<DesyncCheckoutForm plans={PLANS} surface="paywall" />);

    await user.click(screen.getByRole('button', { name: /Crusader/ }));
    await user.click(screen.getByRole('button', { name: 'Annual (save 10%)' }));
    await user.click(
      screen.getByRole('button', { name: 'Subscribe to Crusader' }),
    );

    const checkoutProperties = {
      plan: 'crusader',
      cadence: 'annual',
      surface: 'paywall',
    };

    expect(getCapturedEvents()).toEqual([
      [
        'plan_selected',
        { plan: 'crusader', cadence: 'monthly', surface: 'paywall' },
      ],
      ['plan_selected', checkoutProperties],
      ['checkout_submitted', checkoutProperties],
      [
        'checkout_failed',
        {
          ...checkoutProperties,
          step: 'card_confirm',
          reason_code: 'insufficient_funds',
        },
      ],
    ]);
  });

  it('should track activation once entitlement lands', async () => {
    jest.useFakeTimers();
    mockConfirmCardSetup.mockResolvedValue({});
    mockActivateSubscription.mockResolvedValue({});
    mockApolloQuery.mockResolvedValue({
      data: { myEntitlement: { entitled: true } },
    });
    const onComplete = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <DesyncCheckoutForm
        plans={PLANS}
        surface="settings"
        onComplete={onComplete}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Subscribe to Starter' }),
    );
    await jest.advanceTimersByTimeAsync(3000);

    expect(onComplete).toHaveBeenCalled();
    expect(getCapturedEvents()).toEqual([
      [
        'checkout_submitted',
        { plan: 'starter', cadence: 'monthly', surface: 'settings' },
      ],
      [
        'subscription_activated',
        { plan: 'starter', cadence: 'monthly', surface: 'settings' },
      ],
    ]);
  });
});
