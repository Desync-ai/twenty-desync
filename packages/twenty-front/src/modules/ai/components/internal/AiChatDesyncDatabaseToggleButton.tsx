import { t } from '@lingui/core/macro';
import { IconDatabase } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/primitives/input';

import { useLabPublicFeatureFlags } from '@/settings/lab/hooks/useLabPublicFeatureFlags';

// Desync fork: composer options-bar toggle that flips the self-serve
// IS_CATHOLIC_INSTITUTIONS_ENABLED flag, so the agent can search our Catholic
// institutions database. Rendered only when that flag is public — i.e. the
// server has CATHOLIC_DB_URL set — so it is absent where the DB isn't wired.
// Matched by string value because the generated FeatureFlagKey enum may not list
// a freshly-added key (it is a runtime-built GraphQL enum).
export const AiChatDesyncDatabaseToggleButton = () => {
  const { labPublicFeatureFlags, handleLabPublicFeatureFlagUpdate } =
    useLabPublicFeatureFlags();

  const desyncDatabaseFlag = labPublicFeatureFlags.find(
    (flag) => String(flag.key) === 'IS_CATHOLIC_INSTITUTIONS_ENABLED',
  );

  if (!desyncDatabaseFlag) {
    return null;
  }

  const isEnabled = desyncDatabaseFlag.value;

  return (
    <IconButton
      variant="tertiary"
      size="small"
      accent={isEnabled ? 'blue' : 'default'}
      onClick={() => {
        void handleLabPublicFeatureFlagUpdate(
          desyncDatabaseFlag.key,
          !isEnabled,
        );
      }}
      Icon={IconDatabase}
      ariaLabel={
        isEnabled
          ? t`Stop querying the Desync database`
          : t`Query the Desync database`
      }
    />
  );
};
