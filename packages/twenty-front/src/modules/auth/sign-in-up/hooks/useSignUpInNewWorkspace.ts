import { useAuth } from '@/auth/hooks/useAuth';
import { pendingWorkspaceLandingState } from '@/auth/states/pendingWorkspaceLandingState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { gql } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { AppPath } from 'twenty-shared/types';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/primitives/feedback';
import {
  SignUpInNewWorkspaceDocument,
  UploadNewWorkspaceLogoDocument,
} from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';

// Desync: has this user completed the signup questionnaire? Mirrors the query in
// useAuth. A new user hasn't → we defer the subdomain redirect so the
// questionnaire runs while the workspace activates in the background.
const DESYNC_ONBOARDING_STATUS_QUERY = gql`
  query DesyncOnboardingStatus {
    desyncOnboardingStatus
  }
`;

export const useSignUpInNewWorkspace = () => {
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();
  const { getAuthTokensFromLoginToken } = useAuth();
  const apolloClient = useApolloClient();
  const setPendingWorkspaceLanding = useSetAtomState(
    pendingWorkspaceLandingState,
  );
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const { enqueueToast } = useToast();
  const { t } = useLingui();

  const [signUpInNewWorkspaceMutation] = useMutation(
    SignUpInNewWorkspaceDocument,
  );
  const [uploadNewWorkspaceLogoMutation] = useMutation(
    UploadNewWorkspaceLogoDocument,
  );

  const createWorkspace = async ({
    displayName,
    subdomain,
    logo,
  }: {
    displayName?: string;
    subdomain?: string;
    logo?: File;
  } = {}): Promise<boolean> => {
    try {
      const { data } = await signUpInNewWorkspaceMutation({
        variables: { input: { displayName, subdomain } },
      });
      assertIsDefinedOrThrow(data?.signUpInNewWorkspace);

      const workspaceId = data.signUpInNewWorkspace.workspace.id;

      if (isDefined(logo)) {
        try {
          await uploadNewWorkspaceLogoMutation({
            variables: { workspaceId, file: logo },
          });
        } catch (logoUploadError) {
          if (CombinedGraphQLErrors.is(logoUploadError)) {
            enqueueToast(getToastOptionsFromError({ error: logoUploadError }));
          } else {
            enqueueToast({
              variant: 'error',
              children:
                logoUploadError instanceof Error
                  ? logoUploadError.message
                  : t`Workspace logo upload failed`,
            });
          }
        }
      }

      const loginToken = data.signUpInNewWorkspace.loginToken.token;

      if (!isMultiWorkspaceEnabled) {
        await getAuthTokensFromLoginToken(loginToken);
        return true;
      }

      const workspaceUrl = getWorkspaceUrl(
        data.signUpInNewWorkspace.workspace.workspaceUrls,
      );

      // Desync: if the user still owes the signup questionnaire (a brand-new
      // user), DON'T redirect yet. The server has already kicked activation in
      // the background; we stash the landing (subdomain URL + loginToken) and let
      // the caller show the questionnaire, whose onCompleted redirects here once
      // they're done — by which point the workspace is usually already ACTIVE, so
      // the ~activation time is hidden behind the questionnaire. Fail toward
      // deferring (show the questionnaire) so a status-check blip never skips the
      // step that grants the free Referral entitlement.
      let onboardingDone = false;

      try {
        const { data: statusData } = await apolloClient.query({
          query: DESYNC_ONBOARDING_STATUS_QUERY,
          fetchPolicy: 'network-only',
        });

        onboardingDone = statusData?.desyncOnboardingStatus === true;
      } catch {
        onboardingDone = false;
      }

      if (!onboardingDone) {
        setPendingWorkspaceLanding({ workspaceUrl, loginToken });

        return true;
      }

      await redirectToWorkspaceDomain(
        workspaceUrl,
        AppPath.Verify,
        { loginToken },
        '_self',
      );

      return true;
    } catch (error) {
      if (CombinedGraphQLErrors.is(error)) {
        enqueueToast(getToastOptionsFromError({ error }));
      } else {
        enqueueToast({
          variant: 'error',
          children:
            error instanceof Error
              ? error.message
              : t`Workspace creation failed`,
        });
      }

      return false;
    }
  };

  return {
    createWorkspace,
  };
};
