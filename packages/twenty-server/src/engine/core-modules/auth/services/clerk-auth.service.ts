import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createClerkClient, verifyToken } from '@clerk/backend';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type AuthTokens } from 'src/engine/core-modules/auth/dto/auth-tokens.dto';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { type PartialUserWithPicture } from 'src/engine/core-modules/auth/types/signInUp.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

type ClerkIdentity = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl?: string;
};

/**
 * Token-exchange bridge for Clerk: the frontend authenticates with Clerk and
 * posts the resulting Clerk session JWT here. We verify it server-side (JWKS
 * fetched by @clerk/backend using the secret key), find-or-create the matching
 * Twenty user (linked by `user.clerkId`, email as fallback), guarantee the user
 * is a member of a workspace (their own if they have one, otherwise the
 * instance workspace, otherwise a freshly created one), and hand back Twenty's
 * OWN access + refresh tokens. The caller (resolver) then issues the httpOnly
 * session cookie from the returned pair.
 */
@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly userService: UserService,
    private readonly signInUpService: SignInUpService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly authService: AuthService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  async getAuthTokensFromClerkToken(
    clerkToken: string,
    _origin: string,
  ): Promise<AuthTokens> {
    const identity = await this.verifyClerkTokenAndFetchUser(clerkToken);

    const { user, workspace } =
      await this.findOrProvisionUserAndWorkspace(identity);

    // Mint Twenty's own workspace-bound access + refresh token pair. The user is
    // guaranteed to be a member of `workspace` at this point.
    return await this.authService.verify(
      user.email,
      workspace.id,
      AuthProviderEnum.Clerk,
    );
  }

  private getSecretKeyOrThrow(): string {
    const secretKey = this.twentyConfigService.get('CLERK_SECRET_KEY');

    if (!isNonEmptyString(secretKey)) {
      throw new AuthException(
        'Clerk authentication is not configured',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    }

    return secretKey;
  }

  private async verifyClerkTokenAndFetchUser(
    clerkToken: string,
  ): Promise<ClerkIdentity> {
    const secretKey = this.getSecretKeyOrThrow();

    let clerkUserId: string;

    try {
      // @clerk/backend fetches and caches Clerk's JWKS using the secret key and
      // verifies signature + expiry. `authorizedParties` can be added here to
      // pin the accepted origin(s) once the deployment's front URL is known.
      const claims = await verifyToken(clerkToken, { secretKey });

      clerkUserId = claims.sub;
    } catch (error) {
      this.logger.warn(`Clerk token verification failed: ${error?.message}`);

      throw new AuthException(
        'Invalid Clerk token',
        AuthExceptionCode.UNAUTHENTICATED,
      );
    }

    if (!isNonEmptyString(clerkUserId)) {
      throw new AuthException(
        'Clerk token is missing a subject',
        AuthExceptionCode.UNAUTHENTICATED,
      );
    }

    const clerkClient = createClerkClient({ secretKey });

    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    const primaryEmail =
      clerkUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!isNonEmptyString(primaryEmail)) {
      throw new AuthException(
        'Clerk user has no email address',
        AuthExceptionCode.INVALID_INPUT,
      );
    }

    return {
      clerkUserId,
      email: primaryEmail.toLowerCase(),
      firstName: clerkUser.firstName ?? '',
      lastName: clerkUser.lastName ?? '',
      imageUrl: isNonEmptyString(clerkUser.imageUrl)
        ? clerkUser.imageUrl
        : undefined,
    };
  }

  private async findOrProvisionUserAndWorkspace(
    identity: ClerkIdentity,
  ): Promise<{ user: UserEntity; workspace: WorkspaceEntity }> {
    const existingUser = await this.findExistingUser(identity);

    if (isDefined(existingUser)) {
      // 1) The user already belongs to a workspace -> use it.
      const usersWorkspace = await this.getFirstWorkspaceForUser(
        existingUser.id,
      );

      if (isDefined(usersWorkspace)) {
        return { user: existingUser, workspace: usersWorkspace };
      }

      // 2) Existing Twenty user with NO workspace (e.g. a Clerk account that
      //    predates this instance). Put them into the instance workspace if one
      //    exists, otherwise create one for them.
      const instanceWorkspace = await this.getAnyWorkspace();

      if (isDefined(instanceWorkspace)) {
        await this.userWorkspaceService.addUserToWorkspaceIfUserNotInWorkspace(
          existingUser,
          instanceWorkspace,
        );

        return { user: existingUser, workspace: instanceWorkspace };
      }

      return await this.signInUpService.signUpOnNewWorkspace(
        { type: 'existingUser', existingUser },
        { displayName: this.computeWorkspaceDisplayName(identity) },
      );
    }

    // 3) Brand-new user. Create them into the instance workspace if one exists,
    //    otherwise create their own workspace alongside the user.
    const newUserWithPicture = await this.buildNewUserPayload(identity);

    const instanceWorkspace = await this.getAnyWorkspace();

    if (isDefined(instanceWorkspace)) {
      return await this.signInUpService.signInUp({
        workspace: instanceWorkspace,
        userData: {
          type: 'newUserWithPicture',
          newUserWithPicture,
        },
        authParams: { provider: AuthProviderEnum.Clerk },
      });
    }

    return await this.signInUpService.signUpOnNewWorkspace(
      {
        type: 'newUserWithPicture',
        newUserWithPicture,
      },
      { displayName: this.computeWorkspaceDisplayName(identity) },
    );
  }

  private async getFirstWorkspaceForUser(
    userId: string,
  ): Promise<WorkspaceEntity | undefined> {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { userId },
      relations: { workspace: true },
    });

    return userWorkspace?.workspace ?? undefined;
  }

  private async getAnyWorkspace(): Promise<WorkspaceEntity | undefined> {
    const [workspace] = await this.workspaceRepository.find({ take: 1 });

    return workspace ?? undefined;
  }

  private async findExistingUser(
    identity: ClerkIdentity,
  ): Promise<UserEntity | null> {
    const userByClerkId = await this.userService.findUserByClerkId(
      identity.clerkUserId,
    );

    if (isDefined(userByClerkId)) {
      return userByClerkId;
    }

    const userByEmail = await this.userService.findUserByEmail(identity.email);

    if (isDefined(userByEmail)) {
      // Link the Clerk identity to the pre-existing (e.g. password/SSO) account.
      return await this.userService.linkClerkIdToUser(
        userByEmail.id,
        identity.clerkUserId,
      );
    }

    return null;
  }

  private async buildNewUserPayload(
    identity: ClerkIdentity,
  ): Promise<PartialUserWithPicture> {
    const partialUser =
      await this.signInUpService.computePartialUserFromUserPayload(
        {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          picture: identity.imageUrl,
          isEmailAlreadyVerified: true,
        },
        { provider: AuthProviderEnum.Clerk },
      );

    // Persist the Clerk link on the freshly created user (saveNewUser spreads
    // this payload straight into userRepository.create).
    partialUser.clerkId = identity.clerkUserId;

    return partialUser;
  }

  private computeWorkspaceDisplayName(identity: ClerkIdentity): string {
    if (isNonEmptyString(identity.firstName)) {
      return `${identity.firstName}'s Workspace`;
    }

    const [emailLocalPart] = identity.email.split('@');

    return `${emailLocalPart}'s Workspace`;
  }
}
