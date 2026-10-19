import { type AiModelTier } from 'twenty-shared/ai';

import { type SelectableAiModelTier } from '@/ai/constants/selectableAiModelTiers';

// Map any tier onto one of the three shown ones, so a legacy/stored value never
// lands off the slider.
export const clampToSelectableAiModelTier = (
  tier: AiModelTier,
): SelectableAiModelTier => {
  switch (tier) {
    case 'extraFast':
    case 'fast':
      return 'fast';
    case 'balanced':
      return 'balanced';
    case 'smart':
    case 'extraSmart':
      return 'smart';
  }
};
