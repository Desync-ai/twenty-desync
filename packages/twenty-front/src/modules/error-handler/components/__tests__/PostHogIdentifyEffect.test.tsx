import { act, render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';

import { currentUserState } from '@/auth/states/currentUserState';
import { PostHogIdentifyEffect } from '@/error-handler/components/PostHogIdentifyEffect';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

const mockIdentify = jest.fn();
const mockRegister = jest.fn();

const renderEffect = () =>
  render(
    <JotaiProvider store={jotaiStore}>
      <PostHogIdentifyEffect />
    </JotaiProvider>,
  );

describe('PostHogIdentifyEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    Object.assign(window, {
      posthog: { identify: mockIdentify },
      __phRegister: mockRegister,
    });
  });

  afterEach(() => {
    delete (window as { posthog?: unknown }).posthog;
    delete (window as { __phRegister?: unknown }).__phRegister;
  });

  it('should not identify before the current user is loaded', () => {
    renderEffect();

    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('should identify with the user id once the current user is loaded', () => {
    renderEffect();

    act(() => {
      jotaiStore.set(currentUserState.atom, {
        id: 'user-id',
        email: 'ada@acme.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      } as never);
    });

    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith('user-id', {
      email: 'ada@acme.com',
      name: 'Ada Lovelace',
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('should do nothing when PostHog is not initialized', () => {
    delete (window as { posthog?: unknown }).posthog;
    jotaiStore.set(currentUserState.atom, { id: 'user-id' } as never);

    expect(() => renderEffect()).not.toThrow();
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
