import { gql } from '@apollo/client';

// Desync: one-click "Import people from Google". Hits the core-module resolver
// (default Apollo client, same transport as the desync billing operations).
export const IMPORT_GOOGLE_CONTACTS_MUTATION = gql`
  mutation ImportGoogleContacts {
    importGoogleContacts {
      found
      imported
    }
  }
`;
