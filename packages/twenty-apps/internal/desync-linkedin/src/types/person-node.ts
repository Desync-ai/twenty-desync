export type PersonNode = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  emails?: { primaryEmail?: string | null } | null;
  jobTitle?: string | null;
  city?: string | null;
  linkedinLink?: { primaryLinkUrl?: string | null } | null;
  company?: {
    name?: string | null;
    domainName?: { primaryLinkUrl?: string | null } | null;
  } | null;
};
