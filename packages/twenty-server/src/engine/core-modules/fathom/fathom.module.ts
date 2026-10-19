import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { FathomController } from 'src/engine/core-modules/fathom/fathom.controller';
import { FathomService } from 'src/engine/core-modules/fathom/fathom.service';
import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

// AuthModule + WorkspaceCacheStorageModule provide the deps JwtAuthGuard resolves
// (AccessTokenService + WorkspaceCacheStorageService); WorkspaceAuthGuard has none.
// KeyValuePair stores each user's Fathom API key (encrypted via SecretEncryption).
// FathomService is exported so FathomToolProvider surfaces Fathom tools to the copilot.
@Module({
  imports: [
    AuthModule,
    WorkspaceCacheStorageModule,
    KeyValuePairModule,
    SecretEncryptionModule,
  ],
  controllers: [FathomController],
  providers: [FathomService],
  exports: [FathomService],
})
export class FathomModule {}
