// TODO: derive default model preferences dynamically from the catalog
// instead of hardcoding model IDs that become stale as models evolve
//
// Each tier is resolved by taking the first model that is actually available,
// meaning the one whose provider the instance holds a key for. A chain is
// therefore a preference order across providers, not a shortlist: every
// supported provider needs an entry, or an instance configured with only that
// provider resolves the tier to nothing.
import { type AiModelTier } from 'twenty-shared/ai';

// Efforts are pinned so a tier runs at the effort its benchmark was measured
// at, and so one model family can back neighbouring tiers at different speeds.
// Desync CRM runs copilot/agent inference on Anthropic only, surfaced to users
// as three unnamed tiers (Fast / Balanced / Max Thinking). Each tier pins one
// Claude model at a fixed reasoning effort so "more thinking" scales with the
// tier. The extraFast / extraSmart keys are kept (stored values may reference
// them) but map onto the same three models; the UI only offers fast/balanced/
// smart. No OpenAI/Google/xAI/Mistral/Fable in any chain.
export const DEFAULT_MODELS_BY_TIER: Record<AiModelTier, string[]> = {
  extraFast: ['anthropic/claude-haiku-5-5@low'],
  fast: ['anthropic/claude-haiku-5-5@low'],
  balanced: ['anthropic/claude-sonnet-5-5@medium'],
  smart: ['anthropic/claude-opus-5-5@high'],
  extraSmart: ['anthropic/claude-opus-5-5@max'],
};

export const DEFAULT_DISABLED_MODELS: string[] = [];
