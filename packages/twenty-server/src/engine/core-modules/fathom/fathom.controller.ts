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
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { FathomService } from 'src/engine/core-modules/fathom/fathom.service';

/**
 * Fathom (fathom.video) connect/status/disconnect for the CRM settings card.
 * Direct, bring-your-own-key: the user pastes their Fathom API key, which we
 * validate against Fathom's MCP server and store user-scoped + encrypted. The
 * copilot then gets Fathom's tools via FathomToolProvider. Not a Composio flow.
 */
@Controller('fathom')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UseFilters(RestApiExceptionFilter)
export class FathomController {
  constructor(private readonly fathomService: FathomService) {}

  private userId(request: AuthenticatedRequest): string {
    const id = (request as { user?: { id?: string } }).user?.id;
    if (!id) {
      throw new BadRequestException('No user in session');
    }

    return id;
  }

  @Get('status')
  async status(@Req() request: AuthenticatedRequest) {
    const connected = await this.fathomService.isConnected(this.userId(request));

    return { plugin: 'fathom', connected };
  }

  @Post('connect')
  async connect(
    @Body() body: { apiKey?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body?.apiKey?.trim()) {
      throw new BadRequestException('Provide your Fathom API key.');
    }

    return this.fathomService.connect(this.userId(request), body.apiKey);
  }

  @Post('disconnect')
  async disconnect(@Req() request: AuthenticatedRequest) {
    await this.fathomService.disconnect(this.userId(request));

    return { plugin: 'fathom', connected: false };
  }
}
