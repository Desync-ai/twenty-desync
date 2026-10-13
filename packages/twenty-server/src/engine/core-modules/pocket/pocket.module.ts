import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { PocketController } from 'src/engine/core-modules/pocket/pocket.controller';
import { PocketService } from 'src/engine/core-modules/pocket/pocket.service';
import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

// AuthModule + WorkspaceCacheStorageModule provide the deps JwtAuthGuard resolves
// (AccessTokenService + WorkspaceCacheStorageService); WorkspaceAuthGuard has none.
// KeyValuePair stores each user's Pocket API key (encrypted at rest via
// SecretEncryptionModule). PocketService is exported so PocketToolProvider
// (tool-provider module) can surface Pocket tools to the copilot.
@Module({
  imports: [
    AuthModule,
    WorkspaceCacheStorageModule,
    KeyValuePairModule,
    SecretEncryptionModule,
  ],
  controllers: [PocketController],
  providers: [PocketService],
  exports: [PocketService],
})
export class PocketModule {}
