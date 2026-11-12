// Desync signup/activation funnel events sent to PostHog, keyed by event name.
// Properties are deliberately limited to enums, booleans and numbers: never put
// names, emails, company names, websites, subdomains or free text here (this is a
// public repo and PostHog is a third party).
export type FunnelEventProperties = {
  signup_started: Record<string, never>;
  clerk_auth_completed: Record<string, never>;
  onboarding_question_answered: { step: number; total_steps: number };
  workspace_create_clicked: { has_logo: boolean };
  workspace_activated: { duration_ms: number };
  email_sync_skipped: Record<string, never>;
  email_sync_connected: { provider: 'google' | 'microsoft' };
  first_record_created: {
    source: 'manual' | 'csv_import';
    object: 'person' | 'company' | 'opportunity' | 'note' | 'task' | 'other';
  };
  ai_chat_prompt_sent: { is_new_thread: boolean; has_files: boolean };
};
