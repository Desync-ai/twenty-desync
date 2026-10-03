import { gql } from '@apollo/client';

// Desync: accept a pending workspace invitation for the already-authenticated
// (central agnostic session) user. The server accepts it on app.* and returns a
// login token + workspace URL; the frontend hands the user into the workspace via
// /verify. Avoids relying on the Clerk session reaching the workspace subdomain.
export const ACCEPT_WORKSPACE_INVITATION_FOR_CURRENT_USER = gql`
  mutation AcceptWorkspaceInvitationForCurrentUser($personalInviteToken: String!) {
    acceptWorkspaceInvitationForCurrentUser(
      personalInviteToken: $personalInviteToken
    ) {
      loginToken
      workspaceUrl
    }
  }
`;
