import { Injectable, Logger } from '@nestjs/common';

import { google } from 'googleapis';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

export type GoogleApisServiceAvailability = {
  isMessagingAvailable: boolean;
  isCalendarAvailable: boolean;
  isContactsAvailable: boolean;
};

@Injectable()
export class GoogleApisServiceAvailabilityService {
  private readonly logger = new Logger(
    GoogleApisServiceAvailabilityService.name,
  );

  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  async checkServicesAvailability(
    accessToken: string,
  ): Promise<GoogleApisServiceAvailability> {
    const oAuth2Client = new google.auth.OAuth2({
      clientId: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
      transporterOptions: { fetchImplementation: fetch },
    });

    oAuth2Client.setCredentials({
      access_token: accessToken,
    });

    const [isMessagingAvailable, isCalendarAvailable, isContactsAvailable] =
      await Promise.all([
        this.checkMessagingAvailability(oAuth2Client),
        this.checkCalendarAvailability(oAuth2Client),
        this.checkContactsAvailability(oAuth2Client),
      ]);

    return {
      isMessagingAvailable,
      isCalendarAvailable,
      isContactsAvailable,
    };
  }

  private async checkMessagingAvailability(
    oAuth2Client: InstanceType<typeof google.auth.OAuth2>,
  ): Promise<boolean> {
    if (!this.twentyConfigService.get('MESSAGING_PROVIDER_GMAIL_ENABLED')) {
      return false;
    }

    try {
      const gmailClient = google.gmail({
        version: 'v1',
        auth: oAuth2Client,
      });

      await gmailClient.users.getProfile({ userId: 'me' });

      return true;
    } catch (error) {
      if (this.isServiceNotEnabledError(error)) {
        this.logger.log(
          'Messaging service is not enabled for this Google Workspace account',
        );

        return false;
      }

      this.logger.error('Error checking messaging availability', error);

      throw error;
    }
  }

  private async checkCalendarAvailability(
    oAuth2Client: InstanceType<typeof google.auth.OAuth2>,
  ): Promise<boolean> {
    if (!this.twentyConfigService.get('CALENDAR_PROVIDER_GOOGLE_ENABLED')) {
      return false;
    }

    try {
      const calendarClient = google.calendar({
        version: 'v3',
        auth: oAuth2Client,
      });

      await calendarClient.events.list({
        calendarId: 'primary',
        maxResults: 1,
      });

      return true;
    } catch (error) {
      if (this.isServiceNotEnabledError(error)) {
        this.logger.log(
          'Calendar service is not enabled for this Google Workspace account',
        );

        return false;
      }

      this.logger.error('Error checking Calendar availability', error);

      throw error;
    }
  }

  private async checkContactsAvailability(
    oAuth2Client: InstanceType<typeof google.auth.OAuth2>,
  ): Promise<boolean> {
    if (!this.twentyConfigService.get('CONTACTS_PROVIDER_GOOGLE_ENABLED')) {
      return false;
    }

    try {
      const peopleClient = google.people({
        version: 'v1',
        auth: oAuth2Client,
      });

      // Light probe: a brand-new account with no contacts returns an empty
      // list (not an error), so success here just means the People API is
      // reachable with the granted scope.
      await peopleClient.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names',
        pageSize: 1,
      });

      return true;
    } catch (error) {
      if (this.isServiceNotEnabledError(error)) {
        this.logger.log(
          'People (Contacts) service is not enabled for this Google account',
        );

        return false;
      }

      this.logger.error('Error checking Contacts availability', error);

      throw error;
    }
  }

  private isServiceNotEnabledError(error: unknown): boolean {
    const errorResponse = (
      error as { response?: { data?: { error?: unknown } } }
    )?.response?.data?.error;

    if (!errorResponse || typeof errorResponse !== 'object') {
      return false;
    }

    const gmailError = errorResponse as {
      errors?: Array<{ reason?: string; message?: string }>;
    };

    const firstError = gmailError.errors?.[0];

    if (!firstError) {
      return false;
    }

    const isFailedPrecondition = firstError.reason === 'failedPrecondition';

    const isServiceNotEnabled =
      firstError.message?.toLowerCase()?.includes('service not enabled') ??
      false;

    const isPreconditionCheckFailed =
      firstError.message
        ?.toLowerCase()
        ?.includes('precondition check failed') ?? false;

    return (
      isFailedPrecondition && (isServiceNotEnabled || isPreconditionCheckFailed)
    );
  }
}
