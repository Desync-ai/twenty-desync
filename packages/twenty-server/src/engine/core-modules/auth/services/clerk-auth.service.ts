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
import { MAX_WORKSPACES_PER_USER } from 'src/engine/core-modules/auth/constants/max-workspaces-per-user.constant';
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
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

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
 * Desync: where a Clerk sign-in should land. Either straight into a resolved
 * workspace, or "stay on central" (new / no-workspace users finish signup on
 * app.* first — questionnaire → workspace choice), or "subscribe" (not entitled;
 * now only reachable on the subdomain invite-accept path).
 */
export type ClerkExchangeOutcome =
  | { kind: 'workspace'; loginToken: string; workspaceUrl: string }
  | { kind: 'central'; userId: string }
  | { kind: 'subscribe'; subscribeUrl: string };

type ClerkResolution =
  | { kind: 'workspace'; workspace: WorkspaceEntity }
  | { kind: 'central'; userId: string };

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
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
  ) {}

  async getAuthTokensFromClerkToken(
    clerkToken: string,
    origin: string,
  ): Promise<ClerkExchangeOutcome> {
    const identity = await this.verifyClerkTokenAndFetchUser(clerkToken);

    let resolution: ClerkResolution;

    try {
      resolution = await this.resolveClerkSignIn(identity, origin);
    } catch (error) {
      // Not a paying/referral/admin user -> don't error; hand the frontend a URL
      // to go sign up + subscribe on the lead-gen platform. (Now only the
      // subdomain invite-accept path can throw this.)
      if (error instanceof NotEntitledError) {
        return { kind: 'subscribe', subscribeUrl: this.getSubscribeUrl() };
      }

      throw error;
    }

    // Desync: new users (and existing users without a workspace) stay on the
    // central domain to finish signup — the resolver issues a workspace-agnostic
    // session there and the frontend runs the questionnaire → workspace-choice
    // step machine. No workspace is created or resolved here.
    if (resolution.kind === 'central') {
      return { kind: 'central', userId: resolution.userId };
    }

    // Straight into a resolved workspace (existing member / existing user's own
    // workspace / subdomain invite-accept). Mint a short-lived login token; the
    // frontend redirects to that workspace's `/verify?loginToken=…`, which sets
    // the host-only session cookie on the correct host (see the class doc).
    const loginToken = await this.loginTokenService.generateLoginToken(
      identity.email,
      resolution.workspace.id,
      AuthProviderEnum.Clerk,
    );

    const { subdomainUrl, customUrl } =
      this.workspaceDomainsService.getWorkspaceUrls(
        this.workspaceDomainsService.getSubdomainAndCustomDomainFromWorkspaceFallbackOnDefaultSubdomain(
          resolution.workspace,
        ),
      );

    return {
      kind: 'workspace',
      loginToken: loginToken.token,
      workspaceUrl: customUrl ?? subdomainUrl,
    };
  }

  /**
   * Desync: accept a pending workspace invitation for an ALREADY-authenticated
   * user (one who finished signup on the central domain and holds a
   * workspace-agnostic session on app.*). This runs the SAME branch-A accept as
   * resolveClerkSignIn, but SERVER-SIDE from the central domain — so it does NOT
   * depend on the Clerk session reaching the workspace subdomain (which is
   * unreliable cross-subdomain on dev, and fragile for prod). Returns a login
   * token + the workspace URL; the frontend sends the browser to that workspace's
   * `/verify`, which sets the host-only session cookie on the correct host.
   */
  async acceptInvitationForAuthenticatedUser(
    { userId, email }: { userId: string; email: string },
    personalInviteToken: string,
  ): Promise<{ loginToken: string; workspaceUrl: string }> {
    // Resolve + validate the pending PERSONAL (email) invitation by its token.
    // The frontend availableWorkspaces entry carries personalInviteToken — NOT the
    // workspace inviteHash (currentUser.availableWorkspaces never exposes inviteHash,
    // so keying off it made the invite look like a member row and broke the accept).
    const invitationValidation =
      await this.workspaceInvitationService.validatePersonalInvitation({
        workspacePersonalInviteToken: personalInviteToken,
        email,
      });

    if (
      !invitationValidation?.isValid ||
      !isDefined(invitationValidation.workspace)
    ) {
      throw new AuthException(
        'You do not have a valid pending invitation.',
        AuthExceptionCode.FORBIDDEN_EXCEPTION,
      );
    }

    const workspace = invitationValidation.workspace;

    const alreadyMember = isDefined(
      await this.userWorkspaceService.checkUserWorkspaceExists(
        userId,
        workspace.id,
      ),
    );

    if (!alreadyMember) {
      const invitation =
        await this.workspaceInvitationService.getOneWorkspaceInvitation(
          workspace.id,
          email,
        );

      if (!isDefined(invitation)) {
        throw new AuthException(
          'You do not have a pending invitation to this workspace.',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        );
      }

      // A user may belong to at most MAX_WORKSPACES_PER_USER workspaces.
      if ((await this.countUserWorkspaces(userId)) >= MAX_WORKSPACES_PER_USER) {
        throw new AuthException(
          `You already belong to ${MAX_WORKSPACES_PER_USER} workspaces and cannot join another.`,
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        );
      }

      const existingUser = await this.userService.findUserByIdOrThrow(userId);

      // Entitlement still applies (the questionnaire's Referral grant satisfies it).
      const entitled = await this.entitlementService.isEntitled(
        email,
        existingUser.clerkId ?? '',
      );

      if (!entitled) {
        throw new AuthException(
          'You are not entitled to join a workspace. Please subscribe.',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        );
      }

      await this.signInUpService.signInUpOnExistingWorkspace({
        workspace,
        roleId: invitation.context?.roleId ?? null,
        userData: { type: 'existingUser', existingUser },
      });

      await this.workspaceInvitationService.invalidateWorkspaceInvitation(
        workspace.id,
        email,
      );
    }

    const loginToken = await this.loginTokenService.generateLoginToken(
      email,
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

    const primaryEmailAddress =
      clerkUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId,
      ) ?? clerkUser.emailAddresses[0];

    const primaryEmail = primaryEmailAddress?.emailAddress;

    if (!isNonEmptyString(primaryEmail)) {
      throw new AuthException(
        'Clerk user has no email address',
        AuthExceptionCode.INVALID_INPUT,
      );
    }

    // Desync: account-linking keys off this email (an existing Twenty user with the
    // same address gets linked to this Clerk identity), so only ever trust a
    // VERIFIED email — never an unverified/attacker-controlled one. Defence-in-depth
    // even though the live Clerk instance already requires verification at signup.
    if (primaryEmailAddress?.verification?.status !== 'verified') {
      throw new AuthException(
        'Clerk email address is not verified',
        AuthExceptionCode.UNAUTHENTICATED,
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
   * Resolve where a Clerk sign-in should land, from the origin it was initiated on.
   *
   * A) On a workspace subdomain (e.g. acme.twenty-dev.desync.ai): the user MUST
   *    already be a member, or hold a pending invite to THIS workspace. We NEVER
   *    auto-join. -> { kind:'workspace' }.
   * B) On the root/default domain (no workspace in the origin):
   *    - existing user WITH a workspace -> straight into it ({ kind:'workspace' }).
   *    - Desync: NEW user, or existing user with NO workspace -> { kind:'central' }:
   *      do NOT auto-create a workspace and do NOT gate on entitlement here. They
   *      finish signup on the central domain (questionnaire grants the Referral
   *      plan → entitled), then choose/create a workspace. Entitlement is enforced
   *      at workspace CREATION (signUpInNewWorkspace), not at this exchange.
   */
  private async resolveClerkSignIn(
    identity: ClerkIdentity,
    origin: string,
  ): Promise<ClerkResolution> {
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
        return { kind: 'workspace', workspace: originWorkspace };
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

      // A user may belong to at most MAX_WORKSPACES_PER_USER workspaces.
      if (
        isDefined(existingUser) &&
        (await this.countUserWorkspaces(existingUser.id)) >=
          MAX_WORKSPACES_PER_USER
      ) {
        throw new AuthException(
          `You already belong to ${MAX_WORKSPACES_PER_USER} workspaces and cannot join another.`,
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

      return { kind: 'workspace', workspace: originWorkspace };
    }

    // B) Signing in on the root/default domain (origin resolves to no workspace).
    if (isDefined(existingUser)) {
      const usersWorkspace = await this.getFirstWorkspaceForUser(
        existingUser.id,
      );

      if (isDefined(usersWorkspace)) {
        return { kind: 'workspace', workspace: usersWorkspace };
      }

      // Desync: existing Twenty user with no workspace -> stay on central and
      // finish signup there (questionnaire → choose/create). No auto-create and
      // no entitlement gate here; entitlement is enforced at workspace creation.
      return { kind: 'central', userId: existingUser.id };
    }

    // Desync: brand-new user on the root domain -> create the Twenty user WITHOUT
    // a workspace and keep them on central to finish signup. The questionnaire
    // grants the Referral plan (→ entitled), after which they can create a
    // workspace (entitlement checked there). We do NOT auto-create or gate here.
    const newUser = await this.signInUpService.signUpWithoutWorkspace(
      {
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        picture: identity.imageUrl,
        isEmailAlreadyVerified: true,
      },
      { provider: AuthProviderEnum.Clerk },
    );

    // signUpWithoutWorkspace computes the user without the Clerk link; persist it
    // so future sign-ins resolve by clerkId (not just the email fallback).
    await this.userService.linkClerkIdToUser(newUser.id, identity.clerkUserId);

    return { kind: 'central', userId: newUser.id };
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

  // Desync: how many workspaces a user already belongs to — gates how many more
  // they may join (see MAX_WORKSPACES_PER_USER).
  private async countUserWorkspaces(userId: string): Promise<number> {
    return this.userWorkspaceRepository.count({ where: { userId } });
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
}
