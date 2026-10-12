import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { DesyncOnboardingModule } from 'src/engine/core-modules/desync-onboarding/desync-onboarding.module';
import { FioAdsController } from 'src/engine/core-modules/fio-ads/fio-ads.controller';
import { FioAdsService } from 'src/engine/core-modules/fio-ads/fio-ads.service';
import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

// AuthModule + WorkspaceCacheStorageModule provide the deps JwtAuthGuard resolves
// (AccessTokenService + WorkspaceCacheStorageService); WorkspaceAuthGuard has none.
// PermissionsModule backs the PermissionsRestApiExceptionFilter. DesyncOnboarding
// provides the subscription lookup (plan gate); KeyValuePair stores the one-ad record.
@Module({
  imports: [
    AuthModule,
    WorkspaceCacheStorageModule,
    PermissionsModule,
    DesyncOnboardingModule,
    KeyValuePairModule,
  ],
  controllers: [FioAdsController],
  providers: [FioAdsService],
})
export class FioAdsModule {}
