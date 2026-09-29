import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { OntologyLaunchController } from 'src/engine/core-modules/ontology/controllers/ontology-launch.controller';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

@Module({
  imports: [TokenModule, WorkspaceCacheStorageModule],
  controllers: [OntologyLaunchController],
})
export class OntologyModule {}
