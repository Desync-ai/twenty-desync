import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';

import { DesyncOnboardingResolver } from 'src/engine/core-modules/desync-onboarding/desync-onboarding.resolver';
import { DesyncOnboardingService } from 'src/engine/core-modules/desync-onboarding/desync-onboarding.service';

/**
 * Desync: signup questionnaire + entitlement paywall / paid checkout, proxied to
 * the private Twenty backend. EntitlementService is self-contained (reads
 * ENTITLEMENT_DATABASE_URL via its own pool, no DI), so we provide it here
 * directly rather than importing AuthModule (avoids a circular dependency).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserWorkspaceEntity])],
  providers: [
    DesyncOnboardingService,
    DesyncOnboardingResolver,
    EntitlementService,
  ],
  exports: [DesyncOnboardingService],
})
export class DesyncOnboardingModule {}
