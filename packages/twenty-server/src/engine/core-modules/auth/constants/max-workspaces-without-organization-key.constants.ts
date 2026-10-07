// Desync: self-hosted fork with one workspace per customer — there is no
// practical instance-wide workspace cap (upstream default was 5, which blocked
// us as soon as we onboarded a few customers). Set effectively-unlimited.
export const MAX_WORKSPACES_WITHOUT_ENTERPRISE_KEY = 1_000_000;
