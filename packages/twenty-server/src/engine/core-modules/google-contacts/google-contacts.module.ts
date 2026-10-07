import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OAuth2ClientManagerModule } from 'src/modules/connected-account/oauth2-client-manager/oauth2-client-manager.module';
import { ContactCreationManagerModule } from 'src/modules/contact-creation-manager/contact-creation-manager.module';

import { GoogleContactsImportService } from './google-contacts-import.service';
import { GoogleContactsResolver } from './google-contacts.resolver';

/**
 * Desync: one-click "Import people from Google" (People API — saved contacts +
 * "other contacts"). Uses only SENSITIVE contacts scopes (no Gmail, no CASA) and
 * reuses the existing google-apis OAuth connect for the stored refresh token
 * (GoogleOAuth2ClientProvider) and Twenty's own person-creation path
 * (CreateCompanyAndPersonService).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectedAccountEntity, UserWorkspaceEntity]),
    OAuth2ClientManagerModule,
    ContactCreationManagerModule,
  ],
  providers: [GoogleContactsImportService, GoogleContactsResolver],
  exports: [GoogleContactsImportService],
})
export class GoogleContactsModule {}
