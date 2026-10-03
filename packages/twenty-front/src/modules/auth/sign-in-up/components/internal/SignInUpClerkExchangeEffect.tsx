import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useRedeemClerkToken } from '@/auth/hooks/useRedeemClerkToken';
import { clerkExchangeFailedState } from '@/auth/states/clerkExchangeFailedState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { subscribeRequiredUrlState } from '@/auth/states/subscribeRequiredUrlState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

// Bridges a Clerk session into a Twenty session: once Clerk reports a signed-in
// user and no Twenty session cookie is active yet, it exchanges the Clerk JWT
// for Twenty's own session (set server-side as an httpOnly cookie). Mounted
// inside ClerkAuthProvider so it runs on whichever route the unauthenticated
// gate lands on (e.g. /welcome) and self-heals an expired Twenty cookie while
// the Clerk session is still valid.
//
// It also owns the clerkExchangeFailedState flag the sign-in surface reads: a
// fresh attempt clears it, and any terminal failure sets it, so the surface can
// fall back from its "Signing you in…" spinner to a retry instead of spinning
// forever (isSignedIn stays true and isLogged stays false after a failure).
//
// Loop guard: the exchange re-activates a Twenty session, but a late-arriving
// UNAUTHENTICATED response (a straggler request stamped during the cleared
// session window, or a booting server) can tear that fresh session right back
// down, flipping isLogged to false again. Without a brake, this effect would
// immediately re-exchange and redirect to /verify, producing an infinite
// "Verifying your login token" ↔ app bounce that only a hard refresh escapes
// (a refresh cancels the in-flight stragglers). So we (1) never exchange while a
// loginToken is already being verified, (2) pace attempts with a cooldown so
// stragglers from the previous attempt drain before we try again, and (3) cap
// attempts within a window — past the cap we surface the failure (retry UI)
// instead of bouncing. A successful exchange clears the ledger.
const MAX_ATTEMPTS = 4;
const ATTEMPT_WINDOW_MS = 60_000;
const COOLDOWN_MS = 4_000;
const ATTEMPTS_STORAGE_KEY = 'clerkExchangeAttempts';

// localStorage-backed so the ledger survives the full-page reload that the
// /verify redirect performs (in-memory state would reset every bounce and never
// trip the cap). Same-origin only, which is exactly the loop's scope. All
// access is wrapped: storage can be unavailable (private mode, blocked).
const readAttempts = (): number[] => {
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    const parsed = isDefined(raw) ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = Date.now();
    return parsed.filter(
      (t): t is number => typeof t === 'number' && now - t < ATTEMPT_WINDOW_MS,
    );
  } catch {
    return [];
  }
};

const writeAttempts = (attempts: number[]): void => {
  try {
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    // ignore: pacing degrades to in-flight latch only, still no frantic loop
  }
};

const clearAttempts = (): void => {
  try {
    window.localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const SignInUpClerkExchangeEffect = () => {
  const { redeemClerkToken } = useRedeemClerkToken();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const isLogged = useIsLogged();
  const setClerkExchangeFailed = useSetAtomState(clerkExchangeFailedState);
  // Stand down while a sign-out is pending: right after logout, Clerk's
  // isSignedIn can stay true for a beat while the Twenty session is already
  // cleared. Without this guard the effect re-exchanges and bounces the
  // sign-in / 2FA screen repeatedly until Clerk finally propagates the signout.
  const isPendingServerSignOut = useAtomStateValue(isPendingServerSignOutState);
  // Terminal "not subscribed" state: the exchange resolved to a subscribeUrl and
  // the surface is showing the subscribe interstitial. Stand down so we don't
  // re-exchange (which would just re-resolve to the same subscribeUrl in a loop).
  const subscribeRequiredUrl = useAtomStateValue(subscribeRequiredUrlState);
  // A concurrency latch, not render state: prevents a second exchange from
  // firing while the first is still in flight.
  // oxlint-disable-next-line twenty/no-state-useref
  const isExchangingRef = useRef(false);
  // Bumped by the cooldown timer to re-run the effect once the pause elapses.
  const [cooldownTick, setCooldownTick] = useState(0);

  // A live Twenty session means the bridge succeeded (or was never needed):
  // reset the attempt ledger so the next genuine expiry starts from a clean
  // slate rather than inheriting a near-tripped cap.
  useEffect(() => {
    if (isLogged) {
      clearAttempts();
    }
  }, [isLogged]);

  useEffect(() => {
    if (
      isLoaded !== true ||
      isSignedIn !== true ||
      isLogged ||
      isPendingServerSignOut ||
      isDefined(subscribeRequiredUrl) ||
      isExchangingRef.current
    ) {
      return;
    }

    // The /verify page owns the loginToken swap (VerifyLoginTokenEffect). Firing
    // a competing exchange here would redirect away mid-verify and restart the
    // loop, so stand down whenever a loginToken is present in the URL.
    if (isDefined(new URLSearchParams(window.location.search).get('loginToken'))) {
      return;
    }

    const attempts = readAttempts();

    // Past the cap within the window: stop bouncing and let the sign-in surface
    // show its retry fallback instead of an endless redirect loop.
    if (attempts.length >= MAX_ATTEMPTS) {
      setClerkExchangeFailed(true);
      return;
    }

    // Pace attempts: wait out the cooldown since the last one so stragglers from
    // the previous exchange drain before we re-activate (the same effect a hard
    // refresh has). Re-arm via a timer rather than exchanging immediately.
    const lastAttempt = attempts.at(-1);
    if (isDefined(lastAttempt)) {
      const sinceLast = Date.now() - lastAttempt;
      if (sinceLast < COOLDOWN_MS) {
        const timer = setTimeout(
          () => setCooldownTick((tick) => tick + 1),
          COOLDOWN_MS - sinceLast,
        );
        return () => clearTimeout(timer);
      }
    }

    isExchangingRef.current = true;
    writeAttempts([...attempts, Date.now()]);
    // Clear any prior failure so the surface shows the spinner, not the retry
    // fallback, while this fresh attempt is in flight.
    setClerkExchangeFailed(false);

    void (async () => {
      try {
        const clerkToken = await getToken();

        if (!isDefined(clerkToken)) {
          // No token means we cannot exchange: surface the failure so the UI
          // falls back to retry rather than spinning forever.
          setClerkExchangeFailed(true);
          return;
        }

        const succeeded = await redeemClerkToken(clerkToken);

        if (!succeeded) {
          setClerkExchangeFailed(true);
        }
      } catch {
        setClerkExchangeFailed(true);
      } finally {
        isExchangingRef.current = false;
      }
    })();
  }, [
    isLoaded,
    isSignedIn,
    isLogged,
    isPendingServerSignOut,
    subscribeRequiredUrl,
    getToken,
    redeemClerkToken,
    setClerkExchangeFailed,
    cooldownTick,
  ]);

  return <></>;
};
