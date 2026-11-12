import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { UserSessionRevokedReason } from 'src/engine/core-modules/user-session/types/user-session-revoked-reason.type';
import { type UserSessionEntity } from 'src/engine/core-modules/user-session/user-session.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { UserSessionService } from './user-session.service';

describe('UserSessionService.issueSessionForTokenPair', () => {
  const userSessionRepository = {
    create: jest.fn((input) => input),
    save: jest.fn(),
  };
  const jwtWrapperService = {
    decode: jest.fn().mockReturnValue({
      type: JwtTokenTypeEnum.ACCESS,
      userId: 'user-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      authProvider: AuthProviderEnum.Password,
    }),
  };
  const twentyConfigService = {
    get: jest.fn().mockReturnValue('30d'),
  };
  const userSessionCookieService = {
    attachSessionTokenToResponse: jest.fn(),
    clearSessionCookie: jest.fn(),
    extractSessionTokenFromRequest: jest.fn(),
  };
  const service = new UserSessionService(
    userSessionRepository as never,
    {} as never,
    {} as never,
    twentyConfigService as never,
    jwtWrapperService as never,
    {} as never,
    userSessionCookieService as never,
  );
  const tokenPair = {
    accessOrWorkspaceAgnosticToken: {
      token: 'access-token',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    refreshToken: {
      token: 'refresh-token',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the presented session when replacement creation fails', async () => {
    const creationError = new Error('session insert failed');

    userSessionCookieService.extractSessionTokenFromRequest.mockReturnValue(
      'presented-session-token',
    );
    userSessionRepository.save.mockRejectedValue(creationError);

    const revokeSessionByToken = jest.spyOn(service, 'revokeSessionByToken');

    await expect(
      service.issueSessionForTokenPair({
        tokenPair,
        request: { headers: {}, ip: '127.0.0.1', res: {} } as never,
        origin: 'sign_in',
      }),
    ).rejects.toBe(creationError);

    expect(revokeSessionByToken).not.toHaveBeenCalled();
    expect(
      userSessionCookieService.attachSessionTokenToResponse,
    ).not.toHaveBeenCalled();
    expect(userSessionCookieService.clearSessionCookie).not.toHaveBeenCalled();
  });

  it('fails when the required response is unavailable', async () => {
    await expect(
      service.issueSessionForTokenPair({
        tokenPair,
        request: { headers: {} } as never,
        origin: 'sign_in',
      }),
    ).rejects.toThrow('Cannot issue a user session without an HTTP response');

    expect(userSessionRepository.save).not.toHaveBeenCalled();
  });
});

describe('UserSessionService.resolveSession', () => {
  const NOW = new Date('2026-06-01T12:00:00.000Z');

  const userSessionRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const cacheStorageService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const twentyConfigService = {
    get: jest.fn().mockReturnValue('30d'),
  };
  const service = new UserSessionService(
    userSessionRepository as never,
    {} as never,
    cacheStorageService as never,
    twentyConfigService as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const buildSession = (
    overrides: Partial<UserSessionEntity> = {},
  ): UserSessionEntity =>
    ({
      id: 'session-id',
      tokenHash: 'token-hash',
      userId: 'user-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      authProvider: AuthProviderEnum.Password,
      isImpersonating: false,
      impersonatorUserWorkspaceId: null,
      impersonatedUserWorkspaceId: null,
      createdAt: new Date('2026-06-01T11:00:00.000Z'),
      lastActiveAt: new Date('2026-06-01T11:59:50.000Z'),
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      revokedAt: null,
      revokedReason: null,
      ...overrides,
    }) as UserSessionEntity;

  const supersededSecondsAgo = (seconds: number) =>
    buildSession({
      revokedAt: new Date(NOW.getTime() - seconds * 1000),
      revokedReason: UserSessionRevokedReason.Superseded,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    cacheStorageService.get.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps authenticating a session superseded moments ago so in-flight requests survive a sign-in', async () => {
    userSessionRepository.findOneBy.mockResolvedValue(supersededSecondsAgo(10));

    const { payload } = await service.resolveSession('sess_presented', {
      allowSupersededGracePeriod: true,
    });

    expect(payload).toMatchObject({
      type: JwtTokenTypeEnum.ACCESS,
      userId: 'user-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });
    // Caching it would let it outlive the grace period.
    expect(cacheStorageService.set).not.toHaveBeenCalled();
    expect(userSessionRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a superseded session when the caller does not opt into the grace period', async () => {
    userSessionRepository.findOneBy.mockResolvedValue(supersededSecondsAgo(10));

    await expect(service.resolveSession('sess_presented')).rejects.toThrow(
      'Session is invalid or has expired.',
    );
  });

  it('rejects a superseded session once the grace period is over', async () => {
    userSessionRepository.findOneBy.mockResolvedValue(
      supersededSecondsAgo(120),
    );

    await expect(
      service.resolveSession('sess_presented', {
        allowSupersededGracePeriod: true,
      }),
    ).rejects.toThrow('Session is invalid or has expired.');
  });

  it.each([
    UserSessionRevokedReason.UserSignOut,
    UserSessionRevokedReason.UserRevoked,
    UserSessionRevokedReason.PasswordChanged,
    UserSessionRevokedReason.ImpersonationEnded,
  ])('rejects a session revoked moments ago for %s', async (revokedReason) => {
    userSessionRepository.findOneBy.mockResolvedValue(
      buildSession({
        revokedAt: new Date(NOW.getTime() - 1000),
        revokedReason,
      }),
    );

    await expect(
      service.resolveSession('sess_presented', {
        allowSupersededGracePeriod: true,
      }),
    ).rejects.toThrow('Session is invalid or has expired.');
  });

  it('rejects a superseded session that has also expired', async () => {
    userSessionRepository.findOneBy.mockResolvedValue(
      buildSession({
        revokedAt: new Date(NOW.getTime() - 1000),
        revokedReason: UserSessionRevokedReason.Superseded,
        expiresAt: new Date(NOW.getTime() - 500),
      }),
    );

    await expect(
      service.resolveSession('sess_presented', {
        allowSupersededGracePeriod: true,
      }),
    ).rejects.toThrow('Session is invalid or has expired.');
  });
});
