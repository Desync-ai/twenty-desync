import { type FunnelEventName } from '@/desync-analytics/types/FunnelEventName';
import { type FunnelEventProperties } from '@/desync-analytics/types/FunnelEventProperties';

type PostHogCaptureClient = {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
};

const getPostHogClient = (): PostHogCaptureClient | undefined => {
  const posthog = (
    window as unknown as { posthog?: Partial<PostHogCaptureClient> }
  ).posthog;

  return typeof posthog?.capture === 'function'
    ? (posthog as PostHogCaptureClient)
    : undefined;
};

// Sends a typed funnel event through the PostHog client initialised in
// index.html. No-op when PostHog did not init (localhost, non-Desync host,
// blocked script). Only primitive property values are forwarded, as a last guard
// against an object carrying personal data slipping in. Analytics must never
// break the product, so any client error is swallowed.
export const captureFunnelEvent = <TEventName extends FunnelEventName>(
  eventName: TEventName,
  ...[properties]: FunnelEventProperties[TEventName] extends Record<
    string,
    never
  >
    ? []
    : [FunnelEventProperties[TEventName]]
): void => {
  const posthog = getPostHogClient();

  if (posthog === undefined) {
    return;
  }

  const safeProperties = Object.fromEntries(
    Object.entries(properties ?? {}).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value),
    ),
  );

  try {
    posthog.capture(eventName, safeProperties);
  } catch {
    // Ignore: analytics is best-effort.
  }
};
