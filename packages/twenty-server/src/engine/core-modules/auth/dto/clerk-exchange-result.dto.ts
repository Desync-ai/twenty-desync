import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Result of exchanging a Clerk session token. Shapes:
 *  - Straight into a workspace -> { loginToken, workspaceUrl }: the frontend
 *    redirects to `{workspaceUrl}/verify?loginToken=…`, which sets the host-only
 *    session cookie on the correct subdomain (can't span sibling subdomains).
 *  - Desync: stay on central -> { onCentralDomain: true }: the server has already
 *    issued a WORKSPACE-AGNOSTIC session cookie on the central domain, so the
 *    frontend must NOT redirect — it runs the central step machine (questionnaire
 *    → workspace choice/creation). Used for new users and users without a
 *    workspace yet, so they finish signup on app.* before picking a workspace.
 *  - Not entitled (now only for subdomain invite-accept) -> { subscribeUrl }.
 */
@ObjectType()
export class ClerkExchangeResult {
  @Field(() => String, { nullable: true })
  loginToken?: string;

  @Field(() => String, { nullable: true })
  workspaceUrl?: string;

  @Field(() => String, { nullable: true })
  subscribeUrl?: string;

  @Field(() => Boolean, { nullable: true })
  onCentralDomain?: boolean;
}
