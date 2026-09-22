import { gql } from '@apollo/client';

// Raw (non-codegen-typed) document on purpose: the frontend build must not
// depend on regenerating generated-metadata against a running server. The token
// pair is ignored by the client anyway — web auth is the server-set
// `twenty-session` httpOnly cookie — but GraphQL still requires a valid
// selection set, so AuthTokenPairFragment's fields are inlined here.
export const GET_AUTH_TOKENS_FROM_CLERK_TOKEN = gql`
  mutation getAuthTokensFromClerkToken($clerkToken: String!, $origin: String!) {
    getAuthTokensFromClerkToken(clerkToken: $clerkToken, origin: $origin) {
      tokens {
        accessOrWorkspaceAgnosticToken {
          token
          expiresAt
        }
        refreshToken {
          token
          expiresAt
        }
      }
    }
  }
`;
