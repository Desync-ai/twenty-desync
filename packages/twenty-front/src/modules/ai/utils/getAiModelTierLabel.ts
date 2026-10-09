import { t } from '@lingui/core/macro';
import { type AiModelTier } from 'twenty-shared/ai';

export const getAiModelTierLabel = (tier: AiModelTier): string => {
  switch (tier) {
    case 'extraFast':
    case 'fast':
      return t`Fast`;
    case 'balanced':
      return t`Balanced`;
    case 'smart':
    case 'extraSmart':
      return t`Max Thinking`;
  }
};
