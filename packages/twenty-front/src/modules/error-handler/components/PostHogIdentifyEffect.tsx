import { useEffect } from 'react';

import { currentUserState } from '@/auth/states/currentUserState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';

// Attribute PostHog events to the signed-in user. The index.html snippet only
// autocaptures anonymously (person_profiles: 'identified_only'), so without this
// events have no person. No-op when PostHog didn't init (non-Twenty host / blocked).
// The matching posthog.reset() on sign-out lives in useLogout.
export const PostHogIdentifyEffect = () => {
  const currentUser = useAtomStateValue(currentUserState);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ph = (window as any).posthog;
    if (
      !ph ||
      typeof ph.identify !== 'function' ||
      !isDefined(currentUser?.id)
    ) {
      return;
    }
    const name = `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim();
    ph.identify(currentUser.id, {
      ...(currentUser.email ? { email: currentUser.email } : {}),
      ...(name ? { name } : {}),
    });
    // reset() (on sign-out) clears registered super-properties; re-apply them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__phRegister?.();
  }, [
    currentUser?.id,
    currentUser?.email,
    currentUser?.firstName,
    currentUser?.lastName,
  ]);

  return null;
};
