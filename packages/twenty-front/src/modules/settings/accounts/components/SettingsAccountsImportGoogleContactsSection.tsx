import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { ConnectedAccountProvider, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconGoogle, IconUsers } from 'twenty-ui/icon';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Button } from 'twenty-ui/primitives/input';
import { Section } from 'twenty-ui/primitives/layout';
import { H2Title } from 'twenty-ui/primitives/typography';

import { isGoogleContactsEnabledState } from '@/client-config/states/isGoogleContactsEnabledState';
import { IMPORT_GOOGLE_CONTACTS_MUTATION } from '@/settings/accounts/graphql/importGoogleContacts';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type ImportGoogleContactsData = {
  importGoogleContacts: { found: number; imported: number };
};

/**
 * Desync: one-click "Import people from Google". Pulls the user's saved contacts
 * plus "other contacts" (people they've emailed, auto-collected by Google) into
 * the People list. Uses the People API via SENSITIVE contacts scopes only — no
 * Gmail, no CASA. If Google isn't connected yet, the button starts the OAuth
 * consent and returns here; a second click runs the import.
 */
export const SettingsAccountsImportGoogleContactsSection = () => {
  const { t } = useLingui();

  const isGoogleContactsEnabled = useAtomStateValue(
    isGoogleContactsEnabledState,
  );
  const { accounts } = useMyConnectedAccounts();
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const { enqueueToast } = useToast();
  const [importGoogleContacts, { loading }] =
    useMutation<ImportGoogleContactsData>(IMPORT_GOOGLE_CONTACTS_MUTATION);

  if (!isGoogleContactsEnabled) {
    return null;
  }

  const hasGoogleAccount = accounts.some(
    (account) => account.provider === ConnectedAccountProvider.GOOGLE,
  );

  const handleClick = async () => {
    // Not connected yet → start Google consent, returning to this page after.
    if (!hasGoogleAccount) {
      triggerApisOAuth(ConnectedAccountProvider.GOOGLE, {
        redirectLocation: getSettingsPath(SettingsPath.Accounts),
      });

      return;
    }

    try {
      const { data } = await importGoogleContacts();
      const found = data?.importGoogleContacts.found ?? 0;
      const imported = data?.importGoogleContacts.imported ?? 0;

      enqueueToast({
        children:
          imported > 0
            ? t`Imported ${imported} new people from Google (${found} contacts found).`
            : t`No new people to import — your ${found} Google contacts are already in the CRM.`,
        variant: 'success',
      });
    } catch (error) {
      enqueueToast({
        children:
          error instanceof Error
            ? error.message
            : t`Could not import your Google contacts. Please try again.`,
        variant: 'error',
      });
    }
  };

  const description = hasGoogleAccount
    ? t`Add the people you email with — your saved Google contacts plus the "other contacts" Google collects automatically — to your People list.`
    : t`Connect your Google account to add the people you email with to your People list.`;

  return (
    <Section>
      <H2Title title={t`Import from Google`} description={description} />
      <Button
        onClick={handleClick}
        loading={loading}
        variant="solid"
        color="accent"
        size="sm"
        startIcon={hasGoogleAccount ? <IconUsers /> : <IconGoogle />}
      >
        {hasGoogleAccount ? t`Import contacts` : t`Connect Google`}
      </Button>
    </Section>
  );
};
