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
import { type ClerkExchangeResult } from 'src/engine/core-modules/auth/dto/clerk-exchange-result.dto';
import { EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { LoginTokenService } from 'src/engine/core-modules/auth/token/services/login-token.service';
import { type PartialUserWithPicture } from 'src/engine/core-modules/auth/types/signInUp.type';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

type ClerkIdentity = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl?: string;
};

/**
 * Signals a Clerk user with no active paid/referral/admin entitlement. The token
 * exchange catches this and returns a subscribeUrl (not an auth error) so the
 * frontend can send them to sign up + subscribe on the lead-gen platform.
 */
class NotEntitledError extends Error {}

/**
 * Token-exchange bridge for Clerk: the frontend authenticates with Clerk and
 * posts the resulting Clerk session JWT here. We verify it server-side (JWKS
 * fetched by @clerk/backend using the secret key), find-or-create the matching
 * Twenty user (linked by `user.clerkId`, email as fallback), resolve WHICH
 * workspace the sign-in belongs to from its origin subdomain, and hand back a
 * short-lived login token + that workspace's URL.
 *
 * We deliberately do NOT mint/return a session token pair here: the Twenty
 * session cookie is host-only and cannot be shared across sibling subdomains, so
 * a pair minted on the root domain would be useless on `acme.<domain>`. The
 * caller (resolver) returns the login token to the frontend, which redirects the
 * browser to the resolved workspace's `/verify` — exactly like Twenty's native
 * multi-workspace login — so the cookie is set on the correct host.
 */
@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly userService: UserService,
    private readonly signInUpService: SignInUpService,
    private readonly entitlementService: EntitlementService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly loginTokenService: LoginTokenService,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly workspaceInvitationService: WorkspaceInvitationService,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  async getAuthTokensFromClerkToken(
    clerkToken: string,
    origin: string,
  ): Promise<ClerkExchangeResult> {
    const identity = await this.verifyClerkTokenAndFetchUser(clerkToken);

    let workspace: WorkspaceEntity;

    try {
      workspace = await this.resolveWorkspaceForClerkIdentity(identity, origin);
    } catch (error) {
      // Not a paying/referral/admin user -> don't error; hand the frontend a URL
      // to go sign up + subscribe on the lead-gen platform.
      if (error instanceof NotEntitledError) {
        return { subscribeUrl: this.getSubscribeUrl() };
      }

      throw error;
    }

    // Mint a short-lived login token for the resolved workspace. The frontend
    // redirects to that workspace's subdomain `/verify?loginToken=…`, which sets
    // the host-only session cookie on the correct host (see the class doc).
    const loginToken = await this.loginTokenService.generateLoginToken(
      identity.email,
      workspace.id,
      AuthProviderEnum.Clerk,
    );

    const { subdomainUrl, customUrl } =
      this.workspaceDomainsService.getWorkspaceUrls(
        this.workspaceDomainsService.getSubdomainAndCustomDomainFromWorkspaceFallbackOnDefaultSubdomain(
          workspace,
        ),
      );

    return {
      loginToken: loginToken.token,
      workspaceUrl: customUrl ?? subdomainUrl,
    };
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

  /**
   * Resolve which workspace a Clerk sign-in belongs to, from the origin it was
   * initiated on — the heart of multi-workspace support.
   *
   * A) On a workspace subdomain (e.g. acme.twenty-dev.desync.ai): the user MUST
   *    already be a member. We NEVER auto-join, so visiting a tenant's URL can
   *    never grant access to that tenant.
   * B) On the root/default domain (no workspace in the origin): send an existing
   *    user to their own workspace, and let a brand-new user self-serve a fresh
   *    workspace (subdomain auto-generated by signUpOnNewWorkspace).
   */
  private async resolveWorkspaceForClerkIdentity(
    identity: ClerkIdentity,
    origin: string,
  ): Promise<WorkspaceEntity> {
    const existingUser = await this.findExistingUser(identity);

    const originWorkspace =
      await this.workspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace(
        origin,
      );

    // A) Signing in on a specific workspace's subdomain.
    if (isDefined(originWorkspace)) {
      const isMember =
        isDefined(existingUser) &&
        isDefined(
          await this.userWorkspaceService.checkUserWorkspaceExists(
            existingUser.id,
            originWorkspace.id,
          ),
        );

      if (isMember) {
        return originWorkspace;
      }

      // Not a member yet -> honor a pending invitation to THIS workspace (that's
      // how a teammate joins). No invitation means no access — we never auto-join
      // someone just because they visited a tenant's URL.
      const invitation =
        await this.workspaceInvitationService.getOneWorkspaceInvitation(
          originWorkspace.id,
          identity.email,
        );

      if (!isDefined(invitation)) {
        throw new AuthException(
          'You are not a member of this workspace.',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        );
      }

      // One workspace per user: cannot accept an invite into a SECOND workspace.
      if (
        isDefined(existingUser) &&
        isDefined(await this.getFirstWorkspaceForUser(existingUser.id))
      ) {
        throw new AuthException(
          'You already belong to a workspace and cannot join another.',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        );
      }

      // Entitlement still applies — a real teammate passes via their owner-paid
      // multi-seat subscription row; nobody gets a free billable seat.
      await this.assertEntitledOrThrow(identity);

      // Accept: create the Twenty user if new, add them to the workspace with the
      // invited role, then consume the invitation.
      await this.signInUpService.signInUpOnExistingWorkspace({
        workspace: originWorkspace,
        roleId: invitation.context?.roleId ?? null,
        userData: isDefined(existingUser)
          ? { type: 'existingUser', existingUser }
          : {
              type: 'newUserWithPicture',
              newUserWithPicture: await this.buildNewUserPayload(identity),
            },
      });

      await this.workspaceInvitationService.invalidateWorkspaceInvitation(
        originWorkspace.id,
        identity.email,
      );

      return originWorkspace;
    }

    // B) Signing in on the root/default domain (origin resolves to no workspace).
    if (isDefined(existingUser)) {
      const usersWorkspace = await this.getFirstWorkspaceForUser(
        existingUser.id,
      );

      if (isDefined(usersWorkspace)) {
        return usersWorkspace;
      }

      // Existing Twenty user with no workspace -> self-serve a new one.
      // Entitlement gate: only provision a (billable) workspace for an active
      // paid/referral/admin user.
      await this.assertEntitledOrThrow(identity);

      const { workspace } = await this.signInUpService.signUpOnNewWorkspace(
        { type: 'existingUser', existingUser },
        { displayName: this.computeWorkspaceDisplayName(identity) },
      );

      return workspace;
    }

    // Brand-new user on the root domain -> self-serve create their workspace,
    // but ONLY if entitled (Twenty bills ~$19 per active seat; no free/trial seats).
    await this.assertEntitledOrThrow(identity);

    const newUserWithPicture = await this.buildNewUserPayload(identity);

    const { workspace } = await this.signInUpService.signUpOnNewWorkspace(
      {
        type: 'newUserWithPicture',
        newUserWithPicture,
      },
      { displayName: this.computeWorkspaceDisplayName(identity) },
    );

    return workspace;
  }

  /**
   * Cost gate: refuse to provision a (billable) workspace unless the lead-gen
   * billing system says this user is entitled (active paid / referral / admin).
   * See EntitlementService — fails closed.
   */
  private async assertEntitledOrThrow(identity: ClerkIdentity): Promise<void> {
    const entitled = await this.entitlementService.isEntitled(
      identity.email,
      identity.clerkUserId,
    );

    if (!entitled) {
      this.logger.warn(
        `No active entitlement for ${identity.email}: redirecting to subscribe.`,
      );

      throw new NotEntitledError();
    }
  }

  private getSubscribeUrl(): string {
    return process.env.SUBSCRIBE_URL ?? 'https://app.desync.ai/subscribe';
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
