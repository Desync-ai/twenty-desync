import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
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

  @Get('prefill')
  async prefill(@Req() request: AuthenticatedRequest) {
    return this.fioAdsService.getPrefill(this.userEmail(request));
  }

  @Post('assistant')
  async assistant(
    @Body()
    body: {
      brand?: { name?: string; website?: string };
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    // The assistant spends AI budget, so gate it on the same eligibility as launch.
    const status = await this.fioAdsService.getStatus({
      userId: this.userId(request),
      email: this.userEmail(request),
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
    });

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason === 'not_admin'
          ? 'Only workspace admins can use the Fio ad assistant.'
          : 'The Fio ad assistant is available on Starter and above.',
      );
    }

    return this.fioAdsService.assist({
      brand: body?.brand,
      messages: body?.messages ?? [],
      email: this.userEmail(request),
    });
  }

  @Get('voices')
  voices() {
    return { voices: this.fioAdsService.listVoices() };
  }

  @Get('voice-sample')
  async voiceSample(
    @Query('voiceId') voiceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    // Same eligibility as voiceover (it synthesizes through our ElevenLabs key).
    const status = await this.fioAdsService.getStatus({
      userId: this.userId(request),
      email: this.userEmail(request),
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
    });

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason === 'not_admin'
          ? 'Only workspace admins can preview Fio ad voices.'
          : 'Fio ad voice preview is available on Starter and above.',
      );
    }

    return this.fioAdsService.getVoiceSample({ voiceId });
  }

  @Post('transcribe')
  async transcribe(
    @Body()
    body: {
      audio?: { filename?: string; contentType?: string; dataBase64?: string };
    },
    @Req() request: AuthenticatedRequest,
  ) {
    // Gate the same way as the assistant (it calls an external STT service).
    const status = await this.fioAdsService.getStatus({
      userId: this.userId(request),
      email: this.userEmail(request),
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
    });

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason === 'not_admin'
          ? 'Only workspace admins can use Fio ad transcription.'
          : 'Fio ad transcription is available on Starter and above.',
      );
    }

    return this.fioAdsService.transcribe({ audio: body?.audio });
  }

  @Post('voiceover')
  async voiceover(
    @Body() body: { text?: string; voiceId?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    const status = await this.fioAdsService.getStatus({
      userId: this.userId(request),
      email: this.userEmail(request),
      workspaceId: this.workspaceId(request),
      userWorkspaceId: this.userWorkspaceId(request),
    });

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason === 'not_admin'
          ? 'Only workspace admins can use Fio ad AI voiceover.'
          : 'Fio ad AI voiceover is available on Starter and above.',
      );
    }

    return this.fioAdsService.generateVoiceover({
      text: body?.text,
      voiceId: body?.voiceId,
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
