import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { useMarkSessionActive } from '@/auth/hooks/useMarkSessionActive';
import { useOrigin } from '@/domain-manager/hooks/useOrigin';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/primitives/feedback';
import { GET_AUTH_TOKENS_FROM_CLERK_TOKEN } from '@/auth/graphql/mutations/getAuthTokensFromClerkToken';

export const useRedeemClerkToken = () => {
  const { enqueueToast } = useToast();
  const { origin } = useOrigin();
  const markSessionActive = useMarkSessionActive();
  const { loadCurrentUser } = useLoadCurrentUser();
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );
  const [getAuthTokensFromClerkToken] = useMutation(
    GET_AUTH_TOKENS_FROM_CLERK_TOKEN,
  );

  // Returns whether the exchange succeeded so the caller (the exchange effect)
  // can drive the sign-in surface out of its loading state on failure rather
  // than leaving it spinning.
  const redeemClerkToken = useCallback(
    async (clerkToken: string): Promise<boolean> => {
      // Keeps PageChangeEffect from consuming returnToPath while the server
      // swaps the session cookie, and from bouncing back to the sign-in page in
      // the window between markSessionActive and loadCurrentUser hydrating the
      // current workspace (the gate treats a missing workspace as logged out).
      setIsAppEffectRedirectEnabled(false);

      try {
        const { data } = await getAuthTokensFromClerkToken({
          variables: { clerkToken, origin },
        });

        if (!isDefined(data?.getAuthTokensFromClerkToken)) {
          throw new Error('No getAuthTokensFromClerkToken result');
        }

        markSessionActive();
        await loadCurrentUser();

        return true;
      } catch (error: unknown) {
        enqueueToast(getToastOptionsFromError({ error }));

        return false;
      } finally {
        setIsAppEffectRedirectEnabled(true);
      }
    },
    [
      getAuthTokensFromClerkToken,
      origin,
      markSessionActive,
      loadCurrentUser,
      setIsAppEffectRedirectEnabled,
      enqueueToast,
    ],
  );

  return { redeemClerkToken };
};
