// Desync: the Clerk `azp` claim is the browser origin the session token was
// minted on. The prod Clerk instance is shared by every Desync product, so the
// CRM must only accept tokens minted on its own front: the front host itself or
// one workspace subdomain of it (e.g. https://acme.crm.desync.ai). The SDK's
// `authorizedParties` is an exact-match list and cannot express workspace
// subdomains, hence this hand check. Fail closed: a missing or malformed claim
// is rejected.
const WORKSPACE_SUBDOMAIN_LABEL = /^[a-z0-9-]+$/;

export const parseClerkAuthorizedParty = (azp: unknown): URL | null => {
  if (typeof azp !== 'string') {
    return null;
  }

  let party: URL;

  try {
    party = new URL(azp);
  } catch {
    return null;
  }

  // A bare origin only: no path, query, credentials or trailing slash.
  if (party.origin !== azp) {
    return null;
  }

  return party;
};

export const isClerkPartyOnFrontDomain = (party: URL, frontUrl: URL) => {
  if (party.protocol !== frontUrl.protocol || party.port !== frontUrl.port) {
    return false;
  }

  if (party.hostname === frontUrl.hostname) {
    return true;
  }

  const suffix = `.${frontUrl.hostname}`;

  if (!party.hostname.endsWith(suffix)) {
    return false;
  }

  const subdomain = party.hostname.slice(0, -suffix.length);

  return WORKSPACE_SUBDOMAIN_LABEL.test(subdomain);
};
