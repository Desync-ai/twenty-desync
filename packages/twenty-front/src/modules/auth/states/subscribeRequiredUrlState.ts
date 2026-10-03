import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Set when the Clerk token exchange resolves to "not subscribed": the server
// returns a subscribeUrl instead of session tokens. The sign-in surface then
// shows a soft interstitial (a Subscribe button that opens the lead-gen
// subscribe page in a new tab) instead of hard-redirecting the user out of the
// CRM. Not persisted — a reload re-runs the exchange and re-checks entitlement.
export const subscribeRequiredUrlState = createAtomState<string | null>({
  key: 'subscribeRequiredUrlState',
  defaultValue: null,
});
