export const AI_TELEMETRY_CONFIG = {
  isEnabled: true,
  // Desync: do NOT record AI prompt inputs/outputs into telemetry/traces — they
  // carry CRM records and clients' PII. Keep spans (isEnabled) without content.
  recordInputs: false,
  recordOutputs: false,
};
