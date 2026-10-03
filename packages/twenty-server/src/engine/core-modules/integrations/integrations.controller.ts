import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { AuthenticatedRequest } from 'src/engine/api/rest/types/authenticated-request';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { IntegrationsService } from 'src/engine/core-modules/integrations/integrations.service';
import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsRestApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-rest-api-exception.filter';

/**
 * User-facing integration endpoints, called by the Settings -> Integrations UI.
 * Auth is the same as the REST API (workspace-scoped user session). The signed-in
 * workspace member is the Corsair "tenant", so each user connects their OWN account.
 */
@Controller('integrations')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(PermissionsRestApiExceptionFilter, RestApiExceptionFilter)
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(private readonly integrationsService: IntegrationsService) {}

  private requireTenant(workspaceMemberId?: string): string {
    if (!workspaceMemberId) {
      throw new BadRequestException('No workspace member in session');
    }
    return workspaceMemberId;
  }

  // The Desync (Gabriel CRM) source resolves the user's workspace by email.
  private userEmail(request: AuthenticatedRequest): string | undefined {
    return (request as { user?: { email?: string } }).user?.email;
  }

  @Get(':plugin/status')
  async getStatus(
    @Param('plugin') plugin: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrationsService.status(
      this.requireTenant(workspaceMemberId),
      plugin,
      this.userEmail(request),
    );
  }

  @Post(':plugin/connect')
  async connect(
    @Param('plugin') plugin: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrationsService.connect(
      this.requireTenant(workspaceMemberId),
      plugin,
      this.userEmail(request),
    );
  }

  // Triggering a sync mints a workspace write-token (an API-key operation), so it
  // requires the SAME API_KEYS_AND_WEBHOOKS settings permission Twenty requires to
  // create an API key. Without this, any member (even read-only) could cause an
  // admin-role token to be minted — a privilege escalation.
  @Post(':plugin/sync')
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async sync(
    @Param('plugin') plugin: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.requireTenant(workspaceMemberId);
    const workspaceId = request.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('No workspace in session');
    }
    // corsair fetches the provider's records + writes them back via /rest using a
    // short-lived workspace API token minted here (session cookies can't write).
    // Runs as a background job; the UI polls getSyncStatus for progress.
    return this.integrationsService.sync(tenant, workspaceId, plugin, this.userEmail(request));
  }

  @Get(':plugin/sync/status')
  async getSyncStatus(
    @Param('plugin') plugin: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ) {
    return this.integrationsService.syncStatus(this.requireTenant(workspaceMemberId), plugin);
  }

  // Integration-request / problem-report from the Settings UI → emails the team.
  @Post('feedback')
  async feedback(
    @Body() body: { kind?: string; message?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    const message = (body?.message ?? '').trim();
    if (!message) {
      throw new BadRequestException('message required');
    }
    const kind = body?.kind === 'request' ? 'request' : 'problem';
    return this.integrationsService.feedback(kind, message, this.userEmail(request));
  }
}
