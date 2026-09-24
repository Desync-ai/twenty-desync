import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { GET_AUTH_TOKENS_FROM_CLERK_TOKEN } from '@/auth/graphql/mutations/getAuthTokensFromClerkToken';
import { useAuth } from '@/auth/hooks/useAuth';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useOrigin } from '@/domain-manager/hooks/useOrigin';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/primitives/feedback';

export const useRedeemClerkToken = () => {
  const { enqueueToast } = useToast();
  const { origin } = useOrigin();
  const { getAuthTokensFromLoginToken } = useAuth();
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
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
      // Keep PageChangeEffect from consuming returnToPath / bouncing to the
      // sign-in page while the session is being established (the cookie is set
      // on the target workspace's /verify).
      setIsAppEffectRedirectEnabled(false);

      try {
        const { data } = await getAuthTokensFromClerkToken({
          variables: { clerkToken, origin },
        });

        const result = data?.getAuthTokensFromClerkToken;

        if (!isDefined(result)) {
          throw new Error('No getAuthTokensFromClerkToken result');
        }

        // Not entitled: the server hands back a URL to sign up + subscribe on the
        // lead-gen platform (instead of tokens). Send the user there.
        if (isDefined(result.subscribeUrl)) {
          window.location.href = result.subscribeUrl;

          return true;
        }

        // The exchange returns a login token for the workspace it resolved from
        // the sign-in origin (see ClerkAuthService). The session cookie is
        // host-only, so in multi-workspace mode we redirect the browser to that
        // workspace's own subdomain /verify, which sets the cookie there. In
        // single-workspace mode we can consume the login token in place.
        if (!isMultiWorkspaceEnabled) {
          await getAuthTokensFromLoginToken(result.loginToken);

          return true;
        }

        await redirectToWorkspaceDomain(
          result.workspaceUrl,
          AppPath.Verify,
          { loginToken: result.loginToken },
          '_self',
        );

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
      getAuthTokensFromLoginToken,
      redirectToWorkspaceDomain,
      isMultiWorkspaceEnabled,
      setIsAppEffectRedirectEnabled,
      enqueueToast,
    ],
  );

  return { redeemClerkToken };
};
