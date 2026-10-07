import { PassportStrategy } from '@nestjs/passport';

import { Strategy, type VerifyCallback } from 'passport-google-oauth20';

import { getGoogleApisOauthScopes } from 'src/engine/core-modules/auth/utils/get-google-apis-oauth-scopes';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

export type GoogleApiScopeConfig = {
  isCalendarEnabled?: boolean;
  isMessagingAliasFetchingEnabled?: boolean;
};

export abstract class GoogleAPIsOauthCommonStrategy extends PassportStrategy(
  Strategy,
  'google-apis',
) {
  constructor(twentyConfigService: TwentyConfigService) {
    const scopes = getGoogleApisOauthScopes({
      gmail: twentyConfigService.get('MESSAGING_PROVIDER_GMAIL_ENABLED'),
      calendar: twentyConfigService.get('CALENDAR_PROVIDER_GOOGLE_ENABLED'),
      contacts: twentyConfigService.get('CONTACTS_PROVIDER_GOOGLE_ENABLED'),
    });

    super({
      clientID: twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
      callbackURL: twentyConfigService.get('AUTH_GOOGLE_APIS_CALLBACK_URL'),
      scope: scopes,
      passReqToCallback: true,
    });
  }

  abstract validate(
    request: Express.Request,
    accessToken: string,
    refreshToken: string,
    profile: unknown,
    done: VerifyCallback,
  ): Promise<void>;
}
