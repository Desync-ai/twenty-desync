import { returnToPathState } from '@/auth/states/returnToPathState';
import { useReadDefaultDomainFromConfiguration } from '@/domain-manager/hooks/useReadDefaultDomainFromConfiguration';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { isNonEmptyString } from '@sniptt/guards';
import { useStore } from 'jotai';

export const useRedirectToDefaultDomain = () => {
  const { defaultDomain } = useReadDefaultDomainFromConfiguration();
  const store = useStore();

  const { redirect } = useRedirect();
  const redirectToDefaultDomain = (options?: {
    pathname?: string;
    searchParams?: Record<string, string>;
  }) => {
    const url = new URL(window.location.href);
    if (url.hostname !== defaultDomain) {
      // Intentionally do NOT clear lastAuthenticateWorkspaceDomain here. Wiping
      // it on every funnel-to-central is what left the apex with no "last
      // workspace" hint, forcing a full Clerk re-exchange on every return. The
      // central -> last-workspace cookie redirect that this clear used to
      // loop-guard now only runs on the apex, and logout still clears the hint,
      // so there is nothing left to loop against.
      const returnToPath = store.get(returnToPathState.atom);
      if (
        isNonEmptyString(returnToPath) &&
        !url.searchParams.has('returnToPath')
      ) {
        url.searchParams.set('returnToPath', returnToPath);
      }

      if (isNonEmptyString(options?.pathname)) {
        url.pathname = options.pathname;
      }

      Object.entries(options?.searchParams ?? {}).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      url.hostname = defaultDomain;
      redirect(url.toString());
    }
  };

  return {
    redirectToDefaultDomain,
  };
};
