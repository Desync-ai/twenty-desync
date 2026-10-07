import { Field, Int, ObjectType } from '@nestjs/graphql';

// Desync: result of a one-click Google Contacts import (People API) into the
// current workspace.
@ObjectType()
export class GoogleContactsImportResult {
  // Unique contacts pulled from Google (saved contacts + "other contacts").
  @Field(() => Int)
  found: number;

  // NEW people created in the workspace; contacts that already exist are skipped.
  @Field(() => Int)
  imported: number;
}
