import { t } from '@lingui/core/macro';
import { IconMessage, IconRobot } from 'twenty-ui/icon';
import { H2Title } from 'twenty-ui/primitives/typography';
import { Section } from 'twenty-ui/primitives/layout';
import { Card } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { AiModelTierIndicator } from '@/ai/components/AiModelTierIndicator';
import {
  SELECTABLE_AI_MODEL_TIERS,
  clampToSelectableAiModelTier,
} from '@/ai/constants/selectableAiModelTiers';
import { useWorkspaceAiModelTiers } from '@/ai/hooks/useWorkspaceAiModelTiers';
import { getAiModelTierLabel } from '@/ai/utils/getAiModelTierLabel';
import { SettingsOptionCardContentSelect } from '@/settings/components/SettingsOptions/SettingsOptionCardContentSelect';
import { StyledSettingsSelectGroup } from '@/settings/components/SettingsOptions/StyledSettingsSelectGroup';
import { Select } from '@/ui/input/components/Select';
import { SettingsAiModelTiersPreview } from '~/pages/settings/ai/components/SettingsAiModelTiersPreview';
import { useSettingsAiModelsActions } from '~/pages/settings/ai/hooks/useSettingsAiModelsActions';

export const SettingsAiModelsTab = () => {
  const { chatTier, agentTier } = useWorkspaceAiModelTiers();
  const { handleChatTierChange, handleAgentTierChange } =
    useSettingsAiModelsActions();

  const tierOptions = SELECTABLE_AI_MODEL_TIERS.map((tier) => ({
    value: tier,
    label: getAiModelTierLabel(tier),
    LeftComponent: <AiModelTierIndicator tier={tier} />,
  }));

  return (
    <>
      <Section>
        <H2Title
          title={t`Models`}
          description={t`Choose the default mode for people and agents`}
        />
        <Card rounded backgroundColor={themeCssVariables.background.secondary}>
          <StyledSettingsSelectGroup controlWidth={160}>
            <SettingsOptionCardContentSelect
              Icon={IconMessage}
              title={t`AI chat`}
              description={t`Mode used when you chat with Desync`}
              divider
            >
              <Select
                dropdownId="models-tab-chat-tier-select"
                value={clampToSelectableAiModelTier(chatTier)}
                onChange={handleChatTierChange}
                options={tierOptions}
                selectSizeVariant="small"
              />
            </SettingsOptionCardContentSelect>
            <SettingsOptionCardContentSelect
              Icon={IconRobot}
              title={t`Agents`}
              description={t`Mode agents use when they run on their own`}
            >
              <Select
                dropdownId="models-tab-agent-tier-select"
                value={clampToSelectableAiModelTier(agentTier)}
                onChange={handleAgentTierChange}
                options={tierOptions}
                selectSizeVariant="small"
              />
            </SettingsOptionCardContentSelect>
          </StyledSettingsSelectGroup>
        </Card>
      </Section>

      <SettingsAiModelTiersPreview />
    </>
  );
};
