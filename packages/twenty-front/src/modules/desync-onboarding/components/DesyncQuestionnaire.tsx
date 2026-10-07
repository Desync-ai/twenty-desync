import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { StyledOnboardingStepHeading } from '@/onboarding/components/StyledOnboardingStepHeading';
import { StyledOnboardingStepSubtitle } from '@/onboarding/components/StyledOnboardingStepSubtitle';
import { StyledOnboardingStepTitle } from '@/onboarding/components/StyledOnboardingStepTitle';
import { ONBOARDING_CONTENT_BLOCK_WIDTH } from '@/onboarding/constants/OnboardingContentBlockWidth';
import { TextInput } from '@/ui/input/components/TextInput';

import { ANALYZE_WEBSITE_MUTATION } from '../graphql/desyncBilling';

// Desync signup questionnaire. Rendered on the CENTRAL domain as a step in the
// SignInUp flow. Submitted to the core-schema `saveDesyncOnboarding` mutation
// (served at /metadata), which writes scraper_db `user_data.onboarding_*` + the
// best customers (match_requests) and grants the free Referral plan.
//
// Flow: the user drops in their WEBSITE first; we fire `analyzeWebsite` (scrape +
// Claude) in the background and PRE-FILL the profile fields + tags from it while
// they add a customer. Everything is editable. The analysis is best-effort and
// FAIL-SILENT — if it fails we show nothing and the user just fills the (few)
// required fields manually. Only company + website + ≥1 customer are required, so
// a failed scrape never blocks completion / workspace creation.
const SAVE_DESYNC_ONBOARDING = gql`
  mutation SaveDesyncOnboarding($answers: JSON!) {
    saveDesyncOnboarding(answers: $answers)
  }
`;

const DEAL_SIZE_OPTIONS = [
  { value: '', label: 'Deal size (optional)' },
  { value: '<1k', label: 'Under $1k' },
  { value: '1k-10k', label: '$1k-$10k' },
  { value: '10k-50k', label: '$10k-$50k' },
  { value: '50k-100k', label: '$50k-$100k' },
  { value: '100k+', label: '$100k+' },
];

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  max-width: 100%;
  padding-bottom: ${themeCssVariables.spacing[4]};
  width: ${ONBOARDING_CONTENT_BLOCK_WIDTH}px;
`;

const StyledGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledSectionLabel = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTag = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledTagRemove = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.light};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1;
  padding: 0;
`;

const StyledAddTagRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCustomerRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledCustomerFields = styled.div`
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledDealSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  height: 32px;
  padding: 0 ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledLinkButton = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.color.blue};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: 0;
  text-align: left;
`;

const StyledRemoveButton = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.light};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.lg};
  padding: 0 ${themeCssVariables.spacing[1]};
`;

const StyledButtonContainer = styled.div`
  display: flex;
  max-width: 100%;
  width: ${ONBOARDING_CONTENT_BLOCK_WIDTH}px;
`;

type Customer = { id: number; website: string; contact: string; dealSize: string };

type WebsiteAnalysis = {
  ok: boolean;
  company: string;
  product: string;
  who: string;
  businessType: string;
  outreach: string[];
  tags: string[];
};

type Props = {
  onCompleted: () => void;
};

let nextCustomerId = 1;
const emptyCustomer = (): Customer => ({
  id: nextCustomerId++,
  website: '',
  contact: '',
  dealSize: '',
});

// Crude "looks like a domain" test — enough to avoid firing on every keystroke.
const looksLikeDomain = (value: string) => /\.[a-z]{2,}/i.test(value.trim());

export const DesyncQuestionnaire = ({ onCompleted }: Props) => {
  const { enqueueToast } = useToast();

  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [product, setProduct] = useState('');
  const [who, setWho] = useState('');
  const [outreach, setOutreach] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([emptyCustomer()]);

  const analyzedForRef = useRef('');

  const [saveDesyncOnboarding, { loading }] = useMutation(
    SAVE_DESYNC_ONBOARDING,
  );
  const [analyzeWebsiteMutation] = useMutation(ANALYZE_WEBSITE_MUTATION);

  // Background website analysis: fire (debounced) once the website looks complete,
  // pre-fill only EMPTY fields (never clobber the user's edits), and set tags.
  // Fail-silent — any failure leaves the form blank for manual entry.
  useEffect(() => {
    const url = website.trim();

    if (url === '' || url === analyzedForRef.current || !looksLikeDomain(url)) {
      return;
    }

    const handle = setTimeout(() => {
      analyzedForRef.current = url;
      setAnalyzing(true);

      void analyzeWebsiteMutation({ variables: { website: url } })
        .then(({ data }) => {
          const r = (data as { analyzeWebsite?: WebsiteAnalysis } | undefined)
            ?.analyzeWebsite;

          if (r?.ok !== true) {
            return;
          }

          setCompany((v) => (v.trim() === '' ? r.company ?? '' : v));
          setProduct((v) => (v.trim() === '' ? r.product ?? '' : v));
          setWho((v) => (v.trim() === '' ? r.who ?? '' : v));
          setBusinessType((v) => (v.trim() === '' ? r.businessType ?? '' : v));
          setOutreach((v) =>
            v.trim() === '' ? (r.outreach ?? []).join(', ') : v,
          );
          setTags((prev) => (prev.length === 0 ? r.tags ?? [] : prev));
        })
        .catch(() => {
          // fail-silent — leave fields blank for manual entry
        })
        .finally(() => setAnalyzing(false));
    }, 800);

    return () => clearTimeout(handle);
  }, [website, analyzeWebsiteMutation]);

  const addTag = () => {
    const tag = newTag.trim();
    if (tag !== '' && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
    }
    setNewTag('');
  };

  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((t) => t !== tag));

  const updateCustomer = (id: number, patch: Partial<Customer>) =>
    setCustomers((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  const addCustomer = () => setCustomers((rows) => [...rows, emptyCustomer()]);

  const removeCustomer = (id: number) =>
    setCustomers((rows) =>
      rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
    );

  const customersWithWebsite = customers.filter((c) => c.website.trim() !== '');

  // Only the inputs the user must provide regardless of the scrape: company,
  // website, and at least one customer. product/who/outreach are prefilled by the
  // analysis and optional, so a failed scrape never blocks Continue.
  const isValid =
    company.trim() !== '' &&
    website.trim() !== '' &&
    customersWithWebsite.length >= 1;

  const handleSubmit = async () => {
    if (!isValid || loading) {
      return;
    }

    try {
      const { data } = await saveDesyncOnboarding({
        variables: {
          answers: {
            company,
            website,
            product,
            who,
            outreach,
            business_type: businessType,
            tags,
            customers: customersWithWebsite.map((c) => ({
              website: c.website.trim(),
              contact: c.contact.trim(),
              deal_size: c.dealSize,
            })),
          },
        },
      });

      if (data?.saveDesyncOnboarding !== true) {
        throw new Error('Could not save your answers. Please try again.');
      }

      onCompleted();
    } catch (error) {
      enqueueToast({
        children:
          error instanceof Error
            ? error.message
            : 'Could not save your answers. Please try again.',
        variant: 'error',
      });
    }
  };

  return (
    <>
      <StyledOnboardingStepHeading>
        <StyledOnboardingStepTitle>
          Tell us about your business
        </StyledOnboardingStepTitle>
        <StyledOnboardingStepSubtitle>
          Drop in your website and we'll fill in the rest — just confirm it and
          add a customer.
        </StyledOnboardingStepSubtitle>
      </StyledOnboardingStepHeading>

      <StyledForm>
        <StyledGroup>
          <TextInput
            label="Your website"
            value={website}
            onChange={setWebsite}
            placeholder="https://acme.com"
            fullWidth
            autoFocus
          />
          {analyzing && <StyledHint>Reading your site to fill this in…</StyledHint>}
        </StyledGroup>

        <TextInput
          label="Company"
          value={company}
          onChange={setCompany}
          placeholder="Acme Inc."
          fullWidth
        />

        <StyledGroup>
          <StyledSectionLabel>Tags</StyledSectionLabel>
          {tags.length > 0 && (
            <StyledTagRow>
              {tags.map((tag) => (
                <StyledTag key={tag}>
                  {tag}
                  <StyledTagRemove
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => removeTag(tag)}
                  >
                    ×
                  </StyledTagRemove>
                </StyledTag>
              ))}
            </StyledTagRow>
          )}
          <StyledAddTagRow>
            <TextInput
              label=""
              value={newTag}
              onChange={setNewTag}
              placeholder="Add a tag"
              fullWidth
            />
            <StyledLinkButton type="button" onClick={addTag}>
              + Add
            </StyledLinkButton>
          </StyledAddTagRow>
        </StyledGroup>

        <StyledGroup>
          <StyledSectionLabel>
            Details (auto-filled from your site — edit if needed)
          </StyledSectionLabel>
          <TextInput
            label="What do you sell?"
            value={product}
            onChange={setProduct}
            placeholder="Product or service"
            fullWidth
          />
          <TextInput
            label="Who are your ideal customers?"
            value={who}
            onChange={setWho}
            placeholder="e.g. mid-size Catholic parishes"
            fullWidth
          />
          <TextInput
            label="How do you do outreach today?"
            value={outreach}
            onChange={setOutreach}
            placeholder="e.g. email, LinkedIn, cold calls"
            fullWidth
          />
          <TextInput
            label="What type of business are you?"
            value={businessType}
            onChange={setBusinessType}
            placeholder="e.g. B2B SaaS, agency, nonprofit"
            fullWidth
          />
        </StyledGroup>

        <StyledGroup>
          <StyledSectionLabel>
            Your best customers (add at least one)
          </StyledSectionLabel>
          {customers.map((c) => (
            <StyledCustomerRow key={c.id}>
              <StyledCustomerFields>
                <TextInput
                  label=""
                  value={c.website}
                  onChange={(value) => updateCustomer(c.id, { website: value })}
                  placeholder="Customer website (required)"
                  fullWidth
                />
                <TextInput
                  label=""
                  value={c.contact}
                  onChange={(value) => updateCustomer(c.id, { contact: value })}
                  placeholder="Contact name (optional)"
                  fullWidth
                />
                <StyledDealSelect
                  value={c.dealSize}
                  onChange={(event) =>
                    updateCustomer(c.id, { dealSize: event.target.value })
                  }
                >
                  {DEAL_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </StyledDealSelect>
              </StyledCustomerFields>
              {customers.length > 1 && (
                <StyledRemoveButton
                  type="button"
                  aria-label="Remove customer"
                  onClick={() => removeCustomer(c.id)}
                >
                  ×
                </StyledRemoveButton>
              )}
            </StyledCustomerRow>
          ))}
          <StyledLinkButton type="button" onClick={addCustomer}>
            + Add another customer
          </StyledLinkButton>
        </StyledGroup>
      </StyledForm>

      <StyledButtonContainer>
        <MainButton
          onClick={handleSubmit}
          disabled={!isValid || loading}
          fullWidth
        >
          Continue
        </MainButton>
      </StyledButtonContainer>
    </>
  );
};
