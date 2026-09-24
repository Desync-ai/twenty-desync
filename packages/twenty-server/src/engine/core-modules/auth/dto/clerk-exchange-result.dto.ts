import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Result of exchanging a Clerk session token. Two shapes:
 *  - Entitled  -> { loginToken, workspaceUrl }: the frontend redirects to
 *    `{workspaceUrl}/verify?loginToken=…`, which sets the host-only session
 *    cookie on the correct subdomain (the cookie can't span sibling subdomains).
 *  - Not entitled -> { subscribeUrl }: no CRM access; the frontend sends the user
 *    to sign up + subscribe on the lead-gen platform instead of erroring.
 */
@ObjectType()
export class ClerkExchangeResult {
  @Field(() => String, { nullable: true })
  loginToken?: string;

  @Field(() => String, { nullable: true })
  workspaceUrl?: string;

  @Field(() => String, { nullable: true })
  subscribeUrl?: string;
}
