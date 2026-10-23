import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ClerkAuthService } from 'src/engine/core-modules/auth/services/clerk-auth.service';
import { EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { LoginTokenService } from 'src/engine/core-modules/auth/token/services/login-token.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('ClerkAuthService account resolution', () => {
  let clerkAuthService: ClerkAuthService;

  const identity = {
    clerkUserId: 'clerk-user-a',
    email: 'verified@example.com',
    firstName: 'First',
    lastName: 'Last',
  };

  const userService = {
    findUserByClerkId: jest.fn(),
    findUserByEmail: jest.fn(),
    linkClerkIdToUser: jest.fn(),
    syncEmailFromClerk: jest.fn(),
  };

  const buildUser = (overrides: Partial<UserEntity>) =>
    ({
      id: 'user-a',
      clerkId: null,
      isEmailVerified: true,
      ...overrides,
    }) as UserEntity;

  const findExistingUser = () => clerkAuthService['findExistingUser'](identity);

  const twentyConfigService = { get: jest.fn() };

  const workspaceRepository = { exists: jest.fn() };

  const assertAuthorizedParty = (azp: unknown) =>
    clerkAuthService['assertAuthorizedParty'](azp);

  beforeEach(async () => {
    jest.clearAllMocks();

    twentyConfigService.get.mockImplementation((key: string) =>
      key === 'FRONTEND_URL' ? 'https://crm.example.com' : undefined,
    );
    workspaceRepository.exists.mockResolvedValue(false);

    userService.findUserByClerkId.mockResolvedValue(null);
    userService.findUserByEmail.mockResolvedValue(null);
    userService.linkClerkIdToUser.mockImplementation(
      async (userId: string, clerkId: string) =>
        buildUser({ id: userId, clerkId }),
    );
    userService.syncEmailFromClerk.mockImplementation(
      async (userId: string, email: string) =>
        buildUser({ id: userId, clerkId: identity.clerkUserId, email }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkAuthService,
        { provide: TwentyConfigService, useValue: twentyConfigService },
        { provide: UserService, useValue: userService },
        { provide: SignInUpService, useValue: {} },
        { provide: EntitlementService, useValue: {} },
        { provide: UserWorkspaceService, useValue: {} },
        { provide: LoginTokenService, useValue: {} },
        { provide: WorkspaceDomainsService, useValue: {} },
        { provide: WorkspaceInvitationService, useValue: {} },
        { provide: getRepositoryToken(UserWorkspaceEntity), useValue: {} },
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: workspaceRepository,
        },
      ],
    }).compile();

    clerkAuthService = module.get<ClerkAuthService>(ClerkAuthService);
  });

  describe('user already linked to the Clerk identity', () => {
    it('should replace a stored email that differs from the Clerk verified email', async () => {
      userService.findUserByClerkId.mockResolvedValue(
        buildUser({
          clerkId: identity.clerkUserId,
          email: 'changed-in-app@example.org',
        }),
      );

      const user = await findExistingUser();

      expect(userService.syncEmailFromClerk).toHaveBeenCalledWith(
        'user-a',
        identity.email,
      );
      expect(user?.email).toBe(identity.email);
    });

    it('should leave a matching email untouched', async () => {
      userService.findUserByClerkId.mockResolvedValue(
        buildUser({ clerkId: identity.clerkUserId, email: identity.email }),
      );

      await findExistingUser();

      expect(userService.syncEmailFromClerk).not.toHaveBeenCalled();
    });

    it('should refuse when another user holds the Clerk verified email', async () => {
      userService.findUserByClerkId.mockResolvedValue(
        buildUser({
          clerkId: identity.clerkUserId,
          email: 'changed-in-app@example.org',
        }),
      );
      userService.findUserByEmail.mockResolvedValue(
        buildUser({ id: 'user-b', email: identity.email }),
      );

      await expect(findExistingUser()).rejects.toThrow(
        'This email is linked to another account.',
      );
      expect(userService.syncEmailFromClerk).not.toHaveBeenCalled();
    });
  });

  describe('user found by email only', () => {
    it('should link a user that has no Clerk identity yet', async () => {
      userService.findUserByEmail.mockResolvedValue(
        buildUser({ email: identity.email }),
      );

      const user = await findExistingUser();

      expect(userService.linkClerkIdToUser).toHaveBeenCalledWith(
        'user-a',
        identity.clerkUserId,
      );
      expect(user?.clerkId).toBe(identity.clerkUserId);
    });

    it('should refuse a user already linked to another Clerk identity', async () => {
      userService.findUserByEmail.mockResolvedValue(
        buildUser({ clerkId: 'clerk-user-b', email: identity.email }),
      );

      await expect(findExistingUser()).rejects.toThrow(
        'This email is linked to another account.',
      );
      expect(userService.linkClerkIdToUser).not.toHaveBeenCalled();
    });

    it.each([
      ['an unverified email', { isEmailVerified: false }],
      ['a native password', { passwordHash: 'hash' }],
    ])(
      'should refuse to link a user with %s',
      async (_label, overrides: Partial<UserEntity>) => {
        userService.findUserByEmail.mockResolvedValue(
          buildUser({ email: identity.email, ...overrides }),
        );

        await expect(findExistingUser()).rejects.toThrow(
          'This email is linked to another account.',
        );
        expect(userService.linkClerkIdToUser).not.toHaveBeenCalled();
      },
    );
  });

  describe('authorized party (azp) check', () => {
    it.each(['https://crm.example.com', 'https://acme.crm.example.com'])(
      'should accept a token minted on %s',
      async (azp) => {
        await expect(assertAuthorizedParty(azp)).resolves.toBeUndefined();
        expect(workspaceRepository.exists).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      'https://other-product.example.com',
      'https://evilcrm.example.com',
    ])('should reject a token minted on %p', async (azp) => {
      await expect(assertAuthorizedParty(azp)).rejects.toThrow(
        'Invalid Clerk token',
      );
    });

    it('should accept an enabled workspace custom domain', async () => {
      workspaceRepository.exists.mockResolvedValue(true);

      await expect(
        assertAuthorizedParty('https://crm.customer.org'),
      ).resolves.toBeUndefined();
      expect(workspaceRepository.exists).toHaveBeenCalledWith({
        where: {
          customDomain: 'crm.customer.org',
          isCustomDomainEnabled: true,
        },
      });
    });
  });
});
