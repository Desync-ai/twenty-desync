import { Module } from '@nestjs/common';

import { ApiKeyModule } from 'src/engine/core-modules/api-key/api-key.module';
import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { ComposioModule } from 'src/engine/core-modules/composio/composio.module';
import { IntegrationsController } from 'src/engine/core-modules/integrations/integrations.controller';
import { IntegrationsService } from 'src/engine/core-modules/integrations/integrations.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

// AuthModule + WorkspaceCacheStorageModule provide the deps JwtAuthGuard resolves
// (AccessTokenService + WorkspaceCacheStorageService); WorkspaceAuthGuard has none.
// ApiKeyModule + RoleModule provide the write-token minting (ApiKeyService/RoleService).
// PermissionsModule provides PermissionsService for the SettingsPermissionGuard on /sync.
@Module({
  imports: [
    AuthModule,
    ComposioModule,
    WorkspaceCacheStorageModule,
    ApiKeyModule,
    RoleModule,
    PermissionsModule,
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
