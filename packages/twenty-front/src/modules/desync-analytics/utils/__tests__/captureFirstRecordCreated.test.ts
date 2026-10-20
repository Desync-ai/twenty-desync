import { captureFirstRecordCreated } from '@/desync-analytics/utils/captureFirstRecordCreated';

type WindowWithPostHog = Window & { posthog?: { capture?: jest.Mock } };

describe('captureFirstRecordCreated', () => {
  const windowWithPostHog = window as WindowWithPostHog;
  let capture: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    capture = jest.fn();
    windowWithPostHog.posthog = { capture };
  });

  afterEach(() => {
    delete windowWithPostHog.posthog;
  });

  it('fires once per workspace', () => {
    captureFirstRecordCreated({
      workspaceId: 'workspace-a',
      objectNameSingular: 'person',
      source: 'manual',
    });
    captureFirstRecordCreated({
      workspaceId: 'workspace-a',
      objectNameSingular: 'company',
      source: 'csv_import',
    });
    captureFirstRecordCreated({
      workspaceId: 'workspace-b',
      objectNameSingular: 'company',
      source: 'csv_import',
    });

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, 'first_record_created', {
      source: 'manual',
      object: 'person',
    });
    expect(capture).toHaveBeenNthCalledWith(2, 'first_record_created', {
      source: 'csv_import',
      object: 'company',
    });
  });

  it('buckets custom object names as other', () => {
    captureFirstRecordCreated({
      workspaceId: 'workspace-a',
      objectNameSingular: 'customThing',
      source: 'manual',
    });

    expect(capture).toHaveBeenCalledWith('first_record_created', {
      source: 'manual',
      object: 'other',
    });
  });

  it('does nothing without a workspace', () => {
    captureFirstRecordCreated({
      workspaceId: undefined,
      objectNameSingular: 'person',
      source: 'manual',
    });

    expect(capture).not.toHaveBeenCalled();
  });
});
