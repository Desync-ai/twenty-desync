import { Module } from '@nestjs/common';

import { ComposioService } from 'src/engine/core-modules/composio/composio.service';

@Module({
  providers: [ComposioService],
  exports: [ComposioService],
})
export class ComposioModule {}
