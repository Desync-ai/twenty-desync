import {
  dismissConnectEmailNudge,
  isConnectEmailNudgeDismissed,
} from '@/desync-onboarding/utils/connectEmailNudgeDismissed';

describe('connectEmailNudgeDismissed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is not dismissed by default for a workspace', () => {
    expect(isConnectEmailNudgeDismissed('workspace-a')).toBe(false);
  });

  it('remembers the dismissal per workspace', () => {
    dismissConnectEmailNudge('workspace-a');

    expect(isConnectEmailNudgeDismissed('workspace-a')).toBe(true);
    expect(isConnectEmailNudgeDismissed('workspace-b')).toBe(false);
  });

  it('treats a missing workspace as dismissed', () => {
    expect(isConnectEmailNudgeDismissed(undefined)).toBe(true);
  });

  it('treats blocked storage as dismissed', () => {
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });

    expect(isConnectEmailNudgeDismissed('workspace-a')).toBe(true);

    getItemSpy.mockRestore();
  });
});
