import { PENDING_EMAIL_SYNC_STORAGE_KEY } from '@/desync-analytics/constants/PendingEmailSyncStorageKey';
import { consumeEmailSyncPendingConnection } from '@/desync-analytics/utils/consumeEmailSyncPendingConnection';
import { markEmailSyncConnectionStarted } from '@/desync-analytics/utils/markEmailSyncConnectionStarted';

describe('consumeEmailSyncPendingConnection', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useRealTimers();
  });

  it('returns the provider once and clears the marker', () => {
    markEmailSyncConnectionStarted('microsoft');

    expect(consumeEmailSyncPendingConnection()).toBe('microsoft');
    expect(consumeEmailSyncPendingConnection()).toBeUndefined();
  });

  it('returns undefined when nothing is pending', () => {
    expect(consumeEmailSyncPendingConnection()).toBeUndefined();
  });

  it('ignores stale markers', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T10:00:00Z'));
    markEmailSyncConnectionStarted('google');
    jest.setSystemTime(new Date('2026-10-20T11:00:00Z'));

    expect(consumeEmailSyncPendingConnection()).toBeUndefined();
    expect(localStorage.getItem(PENDING_EMAIL_SYNC_STORAGE_KEY)).toBeNull();
  });

  it('ignores malformed markers', () => {
    localStorage.setItem(PENDING_EMAIL_SYNC_STORAGE_KEY, '{not json');

    expect(consumeEmailSyncPendingConnection()).toBeUndefined();
  });
});
