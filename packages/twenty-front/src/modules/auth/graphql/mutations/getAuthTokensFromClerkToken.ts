import { gql } from '@apollo/client';

// Raw (non-codegen-typed) document on purpose: the frontend build must not
// depend on regenerating generated-metadata against a running server.
//
// Two result shapes:
//  - Entitled -> { loginToken, workspaceUrl }: useRedeemClerkToken redirects to
//    `{workspaceUrl}/verify?loginToken=…` (sets the host-only cookie on the right
//    subdomain).
//  - Not entitled -> { subscribeUrl }: no CRM access; the frontend sends the user
//    to sign up + subscribe on the lead-gen platform.
export const GET_AUTH_TOKENS_FROM_CLERK_TOKEN = gql`
  mutation getAuthTokensFromClerkToken($clerkToken: String!, $origin: String!) {
    getAuthTokensFromClerkToken(clerkToken: $clerkToken, origin: $origin) {
      loginToken
      workspaceUrl
      subscribeUrl
    }
  }
`;
