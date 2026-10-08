import { gql } from '@apollo/client';

// Desync: entitlement paywall + paid checkout. These hit the core-module
// resolvers (served at /metadata — the default Apollo client), which proxy to the
// private Twenty backend's Stripe endpoints.

export const MY_ENTITLEMENT_QUERY = gql`
  query MyEntitlement {
    myEntitlement {
      entitled
    }
  }
`;

export const DESYNC_BILLING_PLANS_QUERY = gql`
  query DesyncBillingPlans {
    desyncBillingPlans {
      publishableKey
      plans {
        key
        name
        priceIdMonthly
        priceIdAnnual
        monthlyPriceUsd
        recordQuota
      }
    }
  }
`;

export const CREATE_DESYNC_SUBSCRIPTION = gql`
  mutation CreateDesyncSubscription($priceId: String!) {
    createDesyncSubscription(priceId: $priceId) {
      clientSecret
      setupIntentId
    }
  }
`;

export const ACTIVATE_DESYNC_SUBSCRIPTION = gql`
  mutation ActivateDesyncSubscription($setupIntentId: String!, $priceId: String!) {
    activateDesyncSubscription(setupIntentId: $setupIntentId, priceId: $priceId) {
      subscriptionId
      status
    }
  }
`;

// --- Self-service plan management (the in-CRM Plan & Billing settings page) ---

export const MY_SUBSCRIPTION_QUERY = gql`
  query MySubscription {
    mySubscription {
      hasSubscription
      planLevel
      isPaidPlan
      current
      cadence
      periodEnd
      quota
      used
      aiCostCents
      aiCostQuotaCents
      stripeActive
      cancelAtPeriodEnd
      isInternal
    }
  }
`;

export const CANCEL_DESYNC_SUBSCRIPTION = gql`
  mutation CancelDesyncSubscription {
    cancelDesyncSubscription {
      success
      message
    }
  }
`;

export const RESUME_DESYNC_SUBSCRIPTION = gql`
  mutation ResumeDesyncSubscription {
    resumeDesyncSubscription {
      success
      message
    }
  }
`;

export const CHANGE_DESYNC_PLAN = gql`
  mutation ChangeDesyncPlan($priceId: String!) {
    changeDesyncPlan(priceId: $priceId) {
      success
      message
    }
  }
`;

export const CREATE_DESYNC_SETUP_INTENT = gql`
  mutation CreateDesyncSetupIntent {
    createDesyncSetupIntent {
      clientSecret
      setupIntentId
    }
  }
`;

export const SET_DESYNC_DEFAULT_CARD = gql`
  mutation SetDesyncDefaultCard($setupIntentId: String!) {
    setDesyncDefaultCard(setupIntentId: $setupIntentId) {
      success
      message
    }
  }
`;

// --- Multi-seat (buying seats for teammates) --------------------------------

export const DESYNC_SEAT_PAYMENT_METHOD_QUERY = gql`
  query DesyncSeatPaymentMethod {
    desyncSeatPaymentMethod {
      hasCard
      brand
      last4
    }
  }
`;

export const MY_DESYNC_SEATS_QUERY = gql`
  query MyDesyncSeats {
    myDesyncSeats {
      subscriptionId
      beneficiaryEmail
      role
      status
      planName
      cancelAtPeriodEnd
      periodEnd
    }
  }
`;

export const CREATE_DESYNC_SEAT_SETUP_INTENT = gql`
  mutation CreateDesyncSeatSetupIntent {
    createDesyncSeatSetupIntent {
      clientSecret
      setupIntentId
    }
  }
`;

export const BUY_DESYNC_SEAT = gql`
  mutation BuyDesyncSeat(
    $priceId: String!
    $beneficiaryEmail: String!
    $workspaceId: String!
    $role: String
    $setupIntentId: String
  ) {
    buyDesyncSeat(
      priceId: $priceId
      beneficiaryEmail: $beneficiaryEmail
      workspaceId: $workspaceId
      role: $role
      setupIntentId: $setupIntentId
    ) {
      status
      subscriptionId
      message
    }
  }
`;

export const CANCEL_DESYNC_SEAT = gql`
  mutation CancelDesyncSeat($subscriptionId: String!) {
    cancelDesyncSeat(subscriptionId: $subscriptionId) {
      success
      message
    }
  }
`;

export const CHANGE_DESYNC_SEAT_PLAN = gql`
  mutation ChangeDesyncSeatPlan($beneficiaryEmail: String!, $priceId: String!) {
    changeDesyncSeatPlan(beneficiaryEmail: $beneficiaryEmail, priceId: $priceId) {
      success
      message
    }
  }
`;

export const DESYNC_MEMBER_PLANS_QUERY = gql`
  query DesyncMemberPlans($emails: [String!]!) {
    desyncMemberPlans(emails: $emails) {
      email
      planLevel
      cadence
    }
  }
`;

// Minimal roles query (just what the seat invite role picker needs) — the full
// GetRoles query pulls heavy fragments we don't need here.
export const DESYNC_GET_ROLES = gql`
  query DesyncGetRoles {
    getRoles {
      id
      label
      canUpdateAllSettings
    }
  }
`;

// Onboarding: scrape + analyze the user's website to pre-fill the questionnaire.
// Fail-silent on the server (ok=false on any failure) — the UI treats a non-ok /
// errored result as "no prefill" and leaves the form blank.
export const ANALYZE_WEBSITE_MUTATION = gql`
  mutation AnalyzeWebsite($website: String!) {
    analyzeWebsite(website: $website) {
      ok
      company
      product
      who
      businessType
      outreach
      tags
    }
  }
`;
