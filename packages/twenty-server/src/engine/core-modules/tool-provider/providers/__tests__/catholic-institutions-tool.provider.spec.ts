import { type EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import { type CatholicInstitutionsService } from 'src/engine/core-modules/catholic-institutions/catholic-institutions.service';
import { type FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { CatholicInstitutionsToolProvider } from 'src/engine/core-modules/tool-provider/providers/catholic-institutions-tool.provider';

describe('CatholicInstitutionsToolProvider.isAvailable', () => {
  const makeProvider = (opts: {
    configured: boolean;
    flagEnabled: boolean;
    entitled?: boolean;
  }) => {
    const catholicInstitutionsService = {
      isConfigured: jest.fn().mockReturnValue(opts.configured),
    } as unknown as CatholicInstitutionsService;
    const featureFlagService = {
      isFeatureEnabled: jest.fn().mockResolvedValue(opts.flagEnabled),
    } as unknown as FeatureFlagService;
    const isEntitled = jest.fn().mockResolvedValue(opts.entitled ?? true);
    const entitlementService = {
      isEntitled,
    } as unknown as EntitlementService;

    const provider = new CatholicInstitutionsToolProvider(
      catholicInstitutionsService,
      featureFlagService,
      entitlementService,
    );

    return { provider, isEntitled };
  };

  const userContext = (email = 'jane@acme.com'): ToolProviderContext =>
    ({
      workspaceId: 'ws-1',
      roleId: 'role-1',
      rolePermissionConfig: {},
      authContext: {
        type: 'user',
        workspace: {},
        user: { email, clerkId: null },
      },
    }) as unknown as ToolProviderContext;

  it('is unavailable when the DB is not configured', async () => {
    const { provider } = makeProvider({ configured: false, flagEnabled: true });

    await expect(provider.isAvailable(userContext())).resolves.toBe(false);
  });

  it('is unavailable when the workspace flag is off', async () => {
    const { provider } = makeProvider({ configured: true, flagEnabled: false });

    await expect(provider.isAvailable(userContext())).resolves.toBe(false);
  });

  it('is unavailable for a non-entitled user even with the flag on', async () => {
    const { provider, isEntitled } = makeProvider({
      configured: true,
      flagEnabled: true,
      entitled: false,
    });

    await expect(provider.isAvailable(userContext())).resolves.toBe(false);
    expect(isEntitled).toHaveBeenCalledWith('jane@acme.com', '');
  });

  it('is available when configured, flag on, and user entitled', async () => {
    const { provider } = makeProvider({
      configured: true,
      flagEnabled: true,
      entitled: true,
    });

    await expect(provider.isAvailable(userContext())).resolves.toBe(true);
  });

  it('skips the entitlement check for non-user (api key) contexts', async () => {
    const { provider, isEntitled } = makeProvider({
      configured: true,
      flagEnabled: true,
    });

    const apiKeyContext = {
      workspaceId: 'ws-1',
      roleId: 'role-1',
      rolePermissionConfig: {},
      authContext: { type: 'apiKey', workspace: {} },
    } as unknown as ToolProviderContext;

    await expect(provider.isAvailable(apiKeyContext)).resolves.toBe(true);
    expect(isEntitled).not.toHaveBeenCalled();
  });
});
