// Matches the stream claim TTL: a turn this old with no reply and no live
// stream will not get one.
export const AGENT_CHAT_STALE_TURN_THRESHOLD_MINUTES = 10;

// Bounds the scan; older silent turns predate the sweeper.
export const AGENT_CHAT_STALE_TURN_LOOKBACK_HOURS = 24;

export const AGENT_CHAT_STALE_TURN_SWEEP_BATCH_SIZE = 200;

export const AGENT_CHAT_STALE_TURN_SWEEP_CRON_PATTERN = '*/5 * * * *';
