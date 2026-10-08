import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import {
  AUTO_SELECT_MODEL_ID_BY_TIER,
  AUTO_SELECT_WORKSPACE_DEFAULT_MODEL_ID,
} from 'twenty-shared/ai';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { AiModelTierSlider } from '@/ai/components/AiModelTierSlider';
import { clampToSelectableAiModelTier } from '@/ai/constants/selectableAiModelTiers';
import { useAiModelTiers } from '@/ai/hooks/useAiModelTiers';
import { useWorkspaceAiModelTiers } from '@/ai/hooks/useWorkspaceAiModelTiers';
import { getAiModelTierForAgentModelId } from '@/ai/utils/getAiModelTierForAgentModelId';
import { getNearestAiModelTier } from '@/ai/utils/getNearestAiModelTier';
import { aiModelsState } from '@/client-config/states/aiModelsState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSliderCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  corner-shape: round;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledFooter = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
`;

type AiModelPickerProps = {
  modelId: string;
  onModelIdChange: (modelId: string) => void;
  disabled?: boolean;
};

export const AiModelPicker = ({
  modelId,
  onModelIdChange,
  disabled = false,
}: AiModelPickerProps) => {
  const { t } = useLingui();
  const tiers = useAiModelTiers();
  const aiModels = useAtomStateValue(aiModelsState);
  const { agentTier } = useWorkspaceAiModelTiers();

  const isWorkspaceDefault = modelId === AUTO_SELECT_WORKSPACE_DEFAULT_MODEL_ID;
  const tierFromModelId = getAiModelTierForAgentModelId(modelId, agentTier);
  // A legacy agent may still be pinned to a concrete model; we position the
  // slider on the nearest tier but never surface the model's name.
  const pinnedModel = !isDefined(tierFromModelId)
    ? aiModels.find((model) => model.modelId === modelId)
    : undefined;

  const selectedTier = clampToSelectableAiModelTier(
    tierFromModelId ?? getNearestAiModelTier(pinnedModel, tiers),
  );

  return (
    <StyledContainer>
      <StyledSliderCard>
        <AiModelTierSlider
          selectedTier={selectedTier}
          onTierChange={(tier) =>
            onModelIdChange(AUTO_SELECT_MODEL_ID_BY_TIER[tier])
          }
          disabled={disabled}
        />
      </StyledSliderCard>
      <StyledFooter>
        <StyledHint>
          {isWorkspaceDefault
            ? t`Follows the workspace default for agents`
            : t`Set for this agent only`}
        </StyledHint>
      </StyledFooter>
    </StyledContainer>
  );
};
