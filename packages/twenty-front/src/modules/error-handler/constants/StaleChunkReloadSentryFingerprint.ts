// One Sentry issue for every chunk a tab lost to a deploy and reloaded past,
// instead of one per chunk file name (each deploy renames them).
export const STALE_CHUNK_RELOAD_SENTRY_FINGERPRINT = 'vite-stale-chunk-reload';
