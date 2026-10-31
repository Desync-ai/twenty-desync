export type LeadResult = {
  success: boolean;
  recordId: string;
  status: string;
  message: string;
  data?: Record<string, unknown>;
};
