export const REACT_APP_SERVER_BASE_URL =
  window._env_?.REACT_APP_SERVER_BASE_URL || window.location.origin;

// Base URL of the lead-gen platform's metered AI gateway (POST /internal/ai/complete).
// Deploy-time env, injected at runtime into window._env_ (like the server base URL
// above). Empty when unset — the CRM AI panel then renders a "not configured" notice
// rather than calling an unknown origin.
export const CRM_AI_BASE_URL = window._env_?.REACT_APP_CRM_AI_BASE_URL ?? '';
