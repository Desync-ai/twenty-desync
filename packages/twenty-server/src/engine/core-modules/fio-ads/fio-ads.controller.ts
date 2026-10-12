import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedRequest } from 'src/engine/api/rest/types/authenticated-request';
import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { FioAdsService } from 'src/engine/core-modules/fio-ads/fio-ads.service';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsRestApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-rest-api-exception.filter';

/**
 * "Launch a Fio ad" endpoints, called by the CRM sidebar. Same workspace-scoped
 * session auth as the other user-facing REST controllers. The submission is
 * emailed to the team's Fio address, which (per FioAdsService) stays on
 * jackson@desync.ai until FIO_ADS_EMAIL is explicitly set.
 */
@Controller('fio-ads')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(PermissionsRestApiExceptionFilter, RestApiExceptionFilter)
export class FioAdsController {
  constructor(private readonly fioAdsService: FioAdsService) {}

  private userId(request: AuthenticatedRequest): string | undefined {
    return (request as { user?: { id?: string } }).user?.id;
  }

  private userEmail(request: AuthenticatedRequest): string | undefined {
    return (request as { user?: { email?: string } }).user?.email;
  }

  private workspaceId(request: AuthenticatedRequest): string | undefined {
    return (request as { workspace?: { id?: string } }).workspace?.id;
  }

  private userWorkspaceId(request: AuthenticatedRequest): string | undefined {
    return (request as { userWorkspaceId?: string }).userWorkspaceId;
  }

  @Get('status')
  async status(@Req() request: AuthenticatedRequest) {
    return this.fioAdsService.getStatus({
      userId: this.userId(request),
      email: this.userEmail(request),
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
    });
  }

  @Post('launch')
  async launch(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = this.userId(request);
    if (!userId) {
      throw new BadRequestException('No user in session');
    }

    return this.fioAdsService.launch({
      userId,
      email: this.userEmail(request) ?? '',
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
      payload: (body ?? {}) as Parameters<FioAdsService['launch']>[0]['payload'],
    });
  }
}
