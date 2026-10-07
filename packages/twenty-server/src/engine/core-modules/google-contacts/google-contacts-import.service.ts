import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { google, type people_v1 } from 'googleapis';
import { ConnectedAccountProvider, FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { CreateCompanyAndPersonService } from 'src/modules/contact-creation-manager/services/create-company-and-contact.service';
import { type Contact } from 'src/modules/contact-creation-manager/types/contact.type';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

// Bound the import so a very large address book can't make the request hang.
const MAX_CONTACTS = 5000;
const PAGE_SIZE = 1000;

/**
 * Desync: pulls the signed-in user's Google contacts via the People API and
 * creates them as People in the current workspace.
 *
 * Two sources, both SENSITIVE scopes only (no Gmail, no CASA):
 *  - people.connections  → the user's saved Google Contacts (address book)
 *  - otherContacts       → "Other contacts": people they've emailed with but
 *                          never saved, auto-collected by Google. This is how we
 *                          get "people from their email" WITHOUT a mailbox scope.
 *
 * Person creation is delegated to Twenty's own CreateCompanyAndPersonService, so
 * dedupe-by-email, company creation and restore-on-soft-delete all behave exactly
 * like the Gmail/Calendar contact auto-creation path.
 */
@Injectable()
export class GoogleContactsImportService {
  private readonly logger = new Logger(GoogleContactsImportService.name);

  constructor(
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
    private readonly createCompanyAndPersonService: CreateCompanyAndPersonService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  async importForUser({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }): Promise<{ found: number; imported: number }> {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!isDefined(userWorkspace)) {
      throw new Error('No workspace membership found for the current user.');
    }

    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: {
        workspaceId,
        userWorkspaceId: userWorkspace.id,
        provider: ConnectedAccountProvider.GOOGLE,
      },
    });

    if (!isDefined(connectedAccount)) {
      throw new Error(
        'No Google account is connected. Connect Google first, then import.',
      );
    }

    const contacts = await this.fetchGoogleContacts(connectedAccount.id);

    const before = await this.countPeople(workspaceId);

    if (contacts.length > 0) {
      await this.createCompanyAndPersonService.createCompaniesAndPeopleAndUpdateParticipants(
        connectedAccount,
        contacts,
        workspaceId,
        FieldActorSource.IMPORT,
      );
    }

    const after = await this.countPeople(workspaceId);
    const imported = Math.max(0, after - before);

    this.logger.log(
      `Google contacts import (workspace ${workspaceId}): found ${contacts.length}, imported ${imported}`,
    );

    return { found: contacts.length, imported };
  }

  private async countPeople(workspaceId: string): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository = this.workspaceOrmManager.getRepository(
        PersonWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

      return personRepository.count();
    }, authContext);
  }

  private async fetchGoogleContacts(
    connectedAccountId: string,
  ): Promise<Contact[]> {
    const oAuth2Client =
      await this.googleOAuth2ClientProvider.getClient(connectedAccountId);
    const peopleApi = google.people({ version: 'v1', auth: oAuth2Client });
    const byHandle = new Map<string, Contact>();

    // 1. "Other contacts" — people they've emailed with but never saved.
    let pageToken: string | undefined;

    do {
      const res = await peopleApi.otherContacts.list({
        readMask: 'names,emailAddresses',
        pageSize: PAGE_SIZE,
        pageToken,
        sources: ['READ_SOURCE_TYPE_CONTACT'],
      });

      for (const person of res.data.otherContacts ?? []) {
        this.addContact(byHandle, person);
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (isDefined(pageToken) && byHandle.size < MAX_CONTACTS);

    // 2. Saved contacts — the user's address book.
    pageToken = undefined;

    do {
      const res = await peopleApi.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names,emailAddresses',
        pageSize: PAGE_SIZE,
        pageToken,
      });

      for (const person of res.data.connections ?? []) {
        this.addContact(byHandle, person);
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (isDefined(pageToken) && byHandle.size < MAX_CONTACTS);

    return [...byHandle.values()];
  }

  private addContact(
    byHandle: Map<string, Contact>,
    person: people_v1.Schema$Person,
  ): void {
    if (byHandle.size >= MAX_CONTACTS) {
      return;
    }

    const email = person.emailAddresses?.find(
      (emailAddress) =>
        isDefined(emailAddress.value) && emailAddress.value.includes('@'),
    )?.value;

    if (!isDefined(email)) {
      return;
    }

    const handle = email.trim().toLowerCase();

    if (handle.length === 0 || byHandle.has(handle)) {
      return;
    }

    const displayName =
      person.names?.find((name) => isDefined(name.displayName))?.displayName ??
      '';

    byHandle.set(handle, { handle, displayName });
  }
}
