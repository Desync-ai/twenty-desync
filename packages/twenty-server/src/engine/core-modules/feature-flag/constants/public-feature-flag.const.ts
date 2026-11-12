import { isNonEmptyString } from '@sniptt/guards';
import { FeatureFlagKey } from 'twenty-shared/types';

type FeatureFlagMetadata = {
  label: string;
  description: string;
  icon: string;
  imagePath?: string;
};

export type PublicFeatureFlag = {
  key: FeatureFlagKey;
  metadata: FeatureFlagMetadata;
};

export const PUBLIC_FEATURE_FLAGS: PublicFeatureFlag[] = [
  {
    key: FeatureFlagKey.IS_JUNCTION_RELATIONS_ENABLED,
    metadata: {
      label: 'Junction Relations',
      description:
        'Enable many-to-many relations through junction tables configuration',
      icon: 'IconRelationManyToMany',
    },
  },
  ...(isNonEmptyString(process.env.CATHOLIC_DB_URL)
    ? [
        {
          // Desync fork: self-serve toggle for the read-only Catholic
          // institutions data source. Only a public flag where the DB is wired
          // (CATHOLIC_DB_URL set), so the toggle is absent on instances without
          // it; the agent tool still re-checks the flag and entitlement.
          key: FeatureFlagKey.IS_CATHOLIC_INSTITUTIONS_ENABLED,
          metadata: {
            label: 'Catholic Institutions Database',
            description:
              "Let the AI agent search Desync's Catholic institutions reference data — parishes, schools, and hospitals.",
            icon: 'IconDatabase',
          },
        },
      ]
    : []),
  ...(process.env.CLOUDFLARE_API_KEY
    ? [
        // {
        // Here you can add cloud only feature flags
        // },
      ]
    : []),
];
