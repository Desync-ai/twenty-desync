import { UseGuards } from '@nestjs/common';
import { Mutation, Resolver } from '@nestjs/graphql';

import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

import { GoogleContactsImportResult } from './dtos/google-contacts.dto';
import { GoogleContactsImportService } from './google-contacts-import.service';

/**
 * Desync: one-click "Import people from Google". The button lives in the CRM's
 * Account settings; it imports into the workspace the caller is currently in
 * (@AuthWorkspace) using that user's connected Google account (@AuthUser).
 */
@Resolver()
@UseGuards(WorkspaceAuthGuard)
export class GoogleContactsResolver {
  constructor(
    private readonly googleContactsImportService: GoogleContactsImportService,
  ) {}

  @Mutation(() => GoogleContactsImportResult)
  async importGoogleContacts(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<GoogleContactsImportResult> {
    return this.googleContactsImportService.importForUser({
      userId: user.id,
      workspaceId: workspace.id,
    });
  }
}
