import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { EmailVerificationService } from 'src/engine/core-modules/email-verification/services/email-verification.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceMemberTranspiler } from 'src/engine/core-modules/user/services/workspace-member-transpiler.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountOwnershipTransferService } from 'src/engine/metadata-modules/connected-account/services/connected-account-ownership-transfer.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

describe('UserService email updates', () => {
  let userService: UserService;
  let config: Record<string, unknown>;

  const storedUser = {
    id: 'user-id',
    email: 'member@example.com',
  } as UserEntity;

  const userRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const emailVerificationService = { sendVerificationEmail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    config = {};

    userRepository.findOne.mockImplementation(
      async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id === storedUser.id ? { ...storedUser } : null,
    );
    userRepository.save.mockImplementation(async (user: UserEntity) => user);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepository },
        { provide: ConnectedAccountOwnershipTransferService, useValue: {} },
        {
          provide: WorkspaceDomainsService,
          useValue: {
            getSubdomainAndCustomDomainFromWorkspaceFallbackOnDefaultSubdomain:
              jest.fn(),
          },
        },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationService,
        },
        { provide: WorkspaceService, useValue: {} },
        { provide: WorkspaceOrmManager, useValue: {} },
        { provide: UserRoleService, useValue: {} },
        {
          provide: UserWorkspaceService,
          useValue: { countUserWorkspaces: jest.fn().mockResolvedValue(1) },
        },
        {
          provide: getQueueToken(MessageQueue.workspaceQueue),
          useValue: { add: jest.fn() },
        },
        {
          provide: CoreEntityCacheService,
          useValue: { invalidate: jest.fn() },
        },
        { provide: WorkspaceMemberTranspiler, useValue: {} },
        {
          provide: TwentyConfigService,
          useValue: { get: jest.fn((key: string) => config[key]) },
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
  });

  const updateUserEmail = () =>
    userService.updateUserEmail({
      user: storedUser as AuthContextUser,
      workspace: { id: 'workspace-id' } as WorkspaceEntity,
      newEmail: 'someone-else@example.com',
    });

  describe('when Clerk handles sign-in', () => {
    beforeEach(() => {
      config.CLERK_SECRET_KEY = 'clerk-secret-key';
    });

    it('should refuse an in-app email change without verification', async () => {
      config.IS_EMAIL_VERIFICATION_REQUIRED = false;

      await expect(updateUserEmail()).rejects.toThrow(
        'Email is managed by Clerk',
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should refuse an in-app email change with verification', async () => {
      config.IS_EMAIL_VERIFICATION_REQUIRED = true;

      await expect(updateUserEmail()).rejects.toThrow(
        'Email is managed by Clerk',
      );
      expect(
        emailVerificationService.sendVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('should refuse to apply an email change from a verification token', async () => {
      await expect(
        userService.updateEmailFromVerificationToken(
          storedUser.id,
          'someone-else@example.com',
        ),
      ).rejects.toThrow('Email is managed by Clerk');
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should sync the email Clerk verified', async () => {
      const updatedUser = await userService.syncEmailFromClerk(
        storedUser.id,
        'verified@example.com',
      );

      expect(updatedUser.email).toBe('verified@example.com');
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'verified@example.com' }),
      );
    });
  });

  describe('when Clerk is not configured', () => {
    it('should keep applying an email change when verification is off', async () => {
      config.IS_EMAIL_VERIFICATION_REQUIRED = false;

      await updateUserEmail();

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'someone-else@example.com' }),
      );
    });
  });
});
