import { ArgsType, Field } from '@nestjs/graphql';

import { IsNotEmpty, IsString } from 'class-validator';

@ArgsType()
export class GetAuthTokensFromClerkTokenInput {
  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  clerkToken: string;
}
