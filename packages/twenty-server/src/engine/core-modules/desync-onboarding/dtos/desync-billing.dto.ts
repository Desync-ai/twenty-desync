import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

// Desync: GraphQL result types for the entitlement paywall + paid checkout.

@ObjectType()
export class DesyncEntitlementStatus {
  @Field(() => Boolean)
  entitled: boolean;
}

@ObjectType()
export class DesyncCheckoutSession {
  @Field(() => String)
  clientSecret: string;

  @Field(() => String)
  setupIntentId: string;
}

@ObjectType()
export class DesyncSubscriptionResult {
  @Field(() => String)
  subscriptionId: string;

  @Field(() => String)
  status: string;
}

@ObjectType()
export class DesyncBillingPlan {
  @Field(() => String)
  key: string;

  @Field(() => String)
  name: string;

  @Field(() => String)
  priceIdMonthly: string;

  @Field(() => String)
  priceIdAnnual: string;

  @Field(() => Int)
  monthlyPriceUsd: number;

  @Field(() => Int)
  recordQuota: number;
}

@ObjectType()
export class DesyncBillingPlans {
  @Field(() => [DesyncBillingPlan])
  plans: DesyncBillingPlan[];

  @Field(() => String)
  publishableKey: string;
}

// The in-CRM "Plan & Billing" page: the user's current plan + the live Stripe
// cancel state, so the UI can show plan/usage/renewal and which actions apply.
@ObjectType()
export class DesyncSubscriptionStatus {
  @Field(() => Boolean)
  hasSubscription: boolean;

  @Field(() => String, { nullable: true })
  planLevel: string | null;

  // plan_level is a paid plan (Starter/Crusader/Pro/Enterprise) vs a free tier
  // (Trial/Referral) or the internal Admin bypass.
  @Field(() => Boolean)
  isPaidPlan: boolean;

  // The row currently entitles the user (now within its period, or Admin).
  @Field(() => Boolean)
  current: boolean;

  @Field(() => String, { nullable: true })
  cadence: string | null;

  // Epoch seconds (Float — a year-out annual end would overflow GraphQL Int).
  @Field(() => Float, { nullable: true })
  periodEnd: number | null;

  @Field(() => Int, { nullable: true })
  quota: number | null;

  @Field(() => Int, { nullable: true })
  used: number | null;

  // AI $ budget this period, in cents: spent vs the plan's allowance. A 0/null
  // quota means AI is off for this plan (Trial/Referral).
  @Field(() => Int, { nullable: true })
  aiCostCents: number | null;

  @Field(() => Int, { nullable: true })
  aiCostQuotaCents: number | null;

  // The user has a live Stripe subscription (vs a free Referral with none).
  @Field(() => Boolean)
  stripeActive: boolean;

  // Set to cancel at period end (show "Resume" instead of "Cancel").
  @Field(() => Boolean)
  cancelAtPeriodEnd: boolean;

  // Internal Desync account (@desync.ai) — entitled via bypass; show no billing.
  @Field(() => Boolean)
  isInternal: boolean;
}

// Result of a subscription action (cancel / resume / change plan).
@ObjectType()
export class DesyncActionResult {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;
}

// --- Multi-seat (buying seats for teammates) --------------------------------

@ObjectType()
export class DesyncSeatPaymentMethod {
  @Field(() => Boolean)
  hasCard: boolean;

  @Field(() => String, { nullable: true })
  brand: string | null;

  @Field(() => String, { nullable: true })
  last4: string | null;
}

@ObjectType()
export class DesyncSeat {
  @Field(() => String)
  subscriptionId: string;

  @Field(() => String, { nullable: true })
  beneficiaryEmail: string | null;

  @Field(() => String, { nullable: true })
  role: string | null;

  @Field(() => String)
  status: string;

  @Field(() => String, { nullable: true })
  planName: string | null;

  @Field(() => Boolean)
  cancelAtPeriodEnd: boolean;

  @Field(() => Float, { nullable: true })
  periodEnd: number | null;
}

// Result of a seat purchase: status is "active" on success, else an error state.
@ObjectType()
export class DesyncSeatResult {
  @Field(() => String)
  status: string;

  @Field(() => String, { nullable: true })
  subscriptionId: string | null;

  @Field(() => String)
  message: string;
}

// A workspace member's current plan level + cadence (for the admin's member list
// and to gate seat upgrades to plans above their current one).
@ObjectType()
export class DesyncMemberPlan {
  @Field(() => String)
  email: string;

  @Field(() => String, { nullable: true })
  planLevel: string | null;

  @Field(() => String, { nullable: true })
  cadence: string | null;
}

// Onboarding website-analysis prefill: the structured profile Claude extracts
// from the user's site to pre-fill the questionnaire. `ok` is false when the
// scrape/analysis couldn't produce anything (bad URL, unreachable, no key, etc.)
// — the UI then just shows a blank form. Never blocks onboarding.
@ObjectType()
export class DesyncWebsiteAnalysis {
  @Field(() => Boolean)
  ok: boolean;

  @Field(() => String)
  company: string;

  @Field(() => String)
  product: string;

  @Field(() => String)
  who: string;

  @Field(() => String)
  businessType: string;

  @Field(() => [String])
  outreach: string[];

  @Field(() => [String])
  tags: string[];
}
