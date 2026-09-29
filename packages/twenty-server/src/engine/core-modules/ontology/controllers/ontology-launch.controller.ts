import {
  Controller,
  Get,
  Header,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';

import { ApiPath } from 'twenty-shared/types';

import { buildOntologyLaunchToken } from 'src/engine/core-modules/ontology/utils/build-ontology-launch-token.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

type OntologyLaunchResponse = { url: string };

// SSO contract v1 (Twenty -> Ontology console): see the launch-token util and
// its test vector for the token format this builds.
// NoPermissionGuard: this is a self-service read for the calling user's own
// launch url, same shape as a profile fetch — no elevated permission applies.
@Controller(`${ApiPath.Rest}/ontology`)
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class OntologyLaunchController {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  @Get('launch')
  // Per-user, secret-bearing response on one shared URL for every caller:
  // must never be cached (by a browser, proxy, or CDN in front of it).
  @Header('Cache-Control', 'no-store')
  async getLaunchUrl(
    @AuthUser() user: UserEntity,
    @AuthWorkspace() workspace: FlatWorkspace,
  ): Promise<OntologyLaunchResponse> {
    const consoleUrl = this.twentyConfigService.get('ONTOLOGY_CONSOLE_URL');

    if (!consoleUrl) {
      throw new NotFoundException();
    }

    const secret = this.twentyConfigService.get('ONTOLOGY_SSO_SECRET');

    if (!secret) {
      return { url: consoleUrl };
    }

    const token = buildOntologyLaunchToken({
      email: user.email,
      userId: user.id,
      workspaceId: workspace.id,
      secretB64Url: secret,
    });

    return { url: `${consoleUrl}#sso=${token}` };
  }
}
