import { type AiModelTier } from 'twenty-shared/ai';

// Desync surfaces the model picker as three unnamed tiers. The other
// AI_MODEL_TIERS keys stay valid for already-stored values but are never shown;
// a stored value outside this set snaps to the nearest one (see the clamp).
export const SELECTABLE_AI_MODEL_TIERS = [
  'fast',
  'balanced',
  'smart',
] as const satisfies readonly AiModelTier[];

export type SelectableAiModelTier = (typeof SELECTABLE_AI_MODEL_TIERS)[number];

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
