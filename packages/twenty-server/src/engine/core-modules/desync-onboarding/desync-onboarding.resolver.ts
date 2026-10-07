import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';

import GraphQLJSON from 'graphql-type-json';
import { In, Repository } from 'typeorm';

import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';

import {
  DesyncActionResult,
  DesyncBillingPlans,
  DesyncCheckoutSession,
  DesyncEntitlementStatus,
  DesyncMemberPlan,
  DesyncSeat,
  DesyncSeatPaymentMethod,
  DesyncSeatResult,
  DesyncSubscriptionResult,
  DesyncSubscriptionStatus,
  DesyncWebsiteAnalysis,
} from './dtos/desync-billing.dto';
import { DesyncOnboardingService } from './desync-onboarding.service';

/**
 * Desync: the signup questionnaire + the entitlement paywall / paid checkout.
 *
 * Questionnaire: the frontend gate blocks the workspace until
 * `desyncOnboardingStatus` is true; the form submits via `saveDesyncOnboarding`.
 *
 * Paywall: the frontend entitlement gate blocks the CRM when `myEntitlement`
 * reports not-entitled (expired Referral / no paid plan) and shows the paywall,
 * which reads `desyncBillingPlans` and pays via `createDesyncSubscription` +
 * `activateDesyncSubscription`. Checkout proxies to the private Twenty backend;
 * subscription_usage is written async by the Stripe webhook, after which
 * `myEntitlement` flips true and the CRM unlocks. The user's workspace is never
 * touched, so paying restores access to the SAME workspace.
 *
 * All resolve the caller from their authenticated (user-level / workspace-agnostic)
 * token.
 */
@Resolver()
@UseGuards(UserAuthGuard, NoPermissionGuard)
export class DesyncOnboardingResolver {
  constructor(
    private readonly desyncOnboardingService: DesyncOnboardingService,
    private readonly entitlementService: EntitlementService,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  @Query(() => Boolean)
  async desyncOnboardingStatus(
    @AuthUser() user: AuthContextUser,
  ): Promise<boolean> {
    return this.desyncOnboardingService.isCompleted(user.email);
  }

  @Mutation(() => Boolean)
  async saveDesyncOnboarding(
    @AuthUser() user: AuthContextUser,
    @Args('answers', { type: () => GraphQLJSON })
    answers: Record<string, unknown>,
  ): Promise<boolean> {
    return this.desyncOnboardingService.save(user.email, answers);
  }

  /**
   * Best-effort: scrape + analyze the user's website to pre-fill the
   * questionnaire. Fails silent (ok=false on any failure) so it never blocks
   * onboarding or workspace creation — purely a convenience prefill.
   */
  @Mutation(() => DesyncWebsiteAnalysis)
  async analyzeWebsite(
    @Args('website') website: string,
  ): Promise<DesyncWebsiteAnalysis> {
    return this.desyncOnboardingService.analyzeWebsite(website);
  }

  // --- Entitlement paywall + paid checkout -----------------------------------

  @Query(() => DesyncEntitlementStatus)
  async myEntitlement(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncEntitlementStatus> {
    // clerkId isn't on the auth-context user; email is enough (isEntitled matches
    // by lower(email) OR clerk_id). Fails CLOSED in EntitlementService.
    const entitled = await this.entitlementService.isEntitled(user.email, '');

    return { entitled };
  }

  @Query(() => DesyncBillingPlans)
  async desyncBillingPlans(): Promise<DesyncBillingPlans> {
    return this.desyncOnboardingService.getBillingPlans();
  }

  @Mutation(() => DesyncCheckoutSession)
  async createDesyncSubscription(
    @AuthUser() user: AuthContextUser,
    @Args('priceId') priceId: string,
  ): Promise<DesyncCheckoutSession> {
    return this.desyncOnboardingService.createSubscription(user.email, priceId);
  }

  @Mutation(() => DesyncSubscriptionResult)
  async activateDesyncSubscription(
    @AuthUser() user: AuthContextUser,
    @Args('setupIntentId') setupIntentId: string,
    @Args('priceId') priceId: string,
  ): Promise<DesyncSubscriptionResult> {
    return this.desyncOnboardingService.activateSubscription(
      user.email,
      setupIntentId,
      priceId,
    );
  }

  // --- Self-service plan management (the in-CRM Plan & Billing page) ----------

  /** The signed-in user's current plan + Stripe cancel state (display). */
  @Query(() => DesyncSubscriptionStatus)
  async mySubscription(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncSubscriptionStatus> {
    const status = await this.desyncOnboardingService.getSubscription(
      user.email,
    );

    // Server-authoritative internal flag (matches EntitlementService's @desync.ai
    // bypass) so the UI can hide billing for internal accounts.
    return {
      ...status,
      isInternal: user.email.toLowerCase().endsWith('@desync.ai'),
    };
  }

  /** Cancel at period end — access continues until paid-through; workspace kept. */
  @Mutation(() => DesyncActionResult)
  async cancelDesyncSubscription(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.cancelSubscription(user.email);
  }

  /** Undo a pending cancellation while still inside the period. */
  @Mutation(() => DesyncActionResult)
  async resumeDesyncSubscription(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.resumeSubscription(user.email);
  }

  /** Move an active subscription to a different plan (prorated, immediate). */
  @Mutation(() => DesyncActionResult)
  async changeDesyncPlan(
    @AuthUser() user: AuthContextUser,
    @Args('priceId') priceId: string,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.changePlan(user.email, priceId);
  }

  /** Mint a SetupIntent so the user can enter a new card (change payment method). */
  @Mutation(() => DesyncCheckoutSession)
  async createDesyncSetupIntent(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncCheckoutSession> {
    return this.desyncOnboardingService.createSetupIntent(user.email);
  }

  /** Set the just-confirmed card as the default payment method. */
  @Mutation(() => DesyncActionResult)
  async setDesyncDefaultCard(
    @AuthUser() user: AuthContextUser,
    @Args('setupIntentId') setupIntentId: string,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.setDefaultCard(user.email, setupIntentId);
  }

  // --- Multi-seat (buying seats for teammates) -------------------------------

  /** Does the owner have a card on file (for one-click seat purchase)? */
  @Query(() => DesyncSeatPaymentMethod)
  async desyncSeatPaymentMethod(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncSeatPaymentMethod> {
    return this.desyncOnboardingService.seatPaymentMethod(user.email);
  }

  /** Mint a SetupIntent so the owner can add a card for a seat. */
  @Mutation(() => DesyncCheckoutSession)
  async createDesyncSeatSetupIntent(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncCheckoutSession> {
    return this.desyncOnboardingService.createSeatSetupIntent(user.email);
  }

  /** Buy a seat for a teammate (per-seat sub on the owner's card). The frontend
   * sends the Twenty workspace invite separately on success. */
  @Mutation(() => DesyncSeatResult)
  async buyDesyncSeat(
    @AuthUser() user: AuthContextUser,
    @Args('priceId') priceId: string,
    @Args('beneficiaryEmail') beneficiaryEmail: string,
    @Args('workspaceId') workspaceId: string,
    @Args('role', { nullable: true }) role?: string,
    @Args('setupIntentId', { nullable: true }) setupIntentId?: string,
  ): Promise<DesyncSeatResult> {
    return this.desyncOnboardingService.buySeat(
      user.email,
      priceId,
      beneficiaryEmail,
      workspaceId,
      role ?? null,
      setupIntentId ?? null,
    );
  }

  /** The seats the owner pays for (teammates). */
  @Query(() => [DesyncSeat])
  async myDesyncSeats(
    @AuthUser() user: AuthContextUser,
  ): Promise<DesyncSeat[]> {
    return this.desyncOnboardingService.listSeats(user.email);
  }

  /** Cancel a seat at period end. */
  @Mutation(() => DesyncActionResult)
  async cancelDesyncSeat(
    @AuthUser() user: AuthContextUser,
    @Args('subscriptionId') subscriptionId: string,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.cancelSeat(user.email, subscriptionId);
  }

  /** Upgrade a seat the admin pays for (e.g. Pro monthly -> Pro annual). */
  @Mutation(() => DesyncActionResult)
  async changeDesyncSeatPlan(
    @AuthUser() user: AuthContextUser,
    @Args('beneficiaryEmail') beneficiaryEmail: string,
    @Args('priceId') priceId: string,
  ): Promise<DesyncActionResult> {
    return this.desyncOnboardingService.changeSeatPlan(
      user.email,
      beneficiaryEmail,
      priceId,
    );
  }

  /** Current plan level per email (admin's member list). SECURITY: scoped to the
   * caller's OWN workspace co-members, so it can't be used as a cross-tenant oracle
   * to probe arbitrary emails' plan tiers / account existence. The caller's
   * identity comes from the authenticated session (@AuthUser), never client input. */
  @Query(() => [DesyncMemberPlan])
  async desyncMemberPlans(
    @AuthUser() user: AuthContextUser,
    @Args({ name: 'emails', type: () => [String] }) emails: string[],
  ): Promise<DesyncMemberPlan[]> {
    const requested = (emails ?? [])
      .map((e) => (e ?? '').trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (requested.length === 0) {
      return [];
    }

    // The workspaces the caller belongs to.
    const myMemberships = await this.userWorkspaceRepository.find({
      where: { userId: user.id },
    });
    const workspaceIds = [...new Set(myMemberships.map((m) => m.workspaceId))];
    if (workspaceIds.length === 0) {
      return [];
    }

    // Everyone who shares one of those workspaces with the caller.
    const coMembers = await this.userWorkspaceRepository.find({
      where: { workspaceId: In(workspaceIds) },
      relations: { user: true },
    });
    const allowed = new Set<string>([user.email.toLowerCase()]);
    for (const m of coMembers) {
      const coEmail = m.user?.email?.toLowerCase();
      if (coEmail) {
        allowed.add(coEmail);
      }
    }

    // Only ever ask the backend about emails the caller is entitled to see.
    const scoped = requested.filter((e) => allowed.has(e));
    if (scoped.length === 0) {
      return [];
    }
    return this.desyncOnboardingService.memberPlans(scoped);
  }
}
