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
import { PocketService } from 'src/engine/core-modules/pocket/pocket.service';

/**
 * Pocket (heypocketai.com) connect/status/disconnect for the CRM settings card.
 * Direct, bring-your-own-key: the user pastes their Pocket API key (pk_...),
 * which we validate against Pocket's MCP server and store user-scoped. The
 * copilot then gets Pocket's tools via PocketToolProvider. Not a Composio flow.
 */
@Controller('pocket')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UseFilters(RestApiExceptionFilter)
export class PocketController {
  constructor(private readonly pocketService: PocketService) {}

  private userId(request: AuthenticatedRequest): string {
    const id = (request as { user?: { id?: string } }).user?.id;
    if (!id) {
      throw new BadRequestException('No user in session');
    }

    return id;
  }

  @Get('status')
  async status(@Req() request: AuthenticatedRequest) {
    const connected = await this.pocketService.isConnected(this.userId(request));

    return { plugin: 'pocket', connected };
  }

  @Post('connect')
  async connect(
    @Body() body: { apiKey?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body?.apiKey?.trim()) {
      throw new BadRequestException('Provide your Pocket API key.');
    }

    return this.pocketService.connect(this.userId(request), body.apiKey);
  }

  @Post('disconnect')
  async disconnect(@Req() request: AuthenticatedRequest) {
    await this.pocketService.disconnect(this.userId(request));

    return { plugin: 'pocket', connected: false };
  }
}
