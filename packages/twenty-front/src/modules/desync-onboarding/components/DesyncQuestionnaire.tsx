import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { StyledOnboardingStepHeading } from '@/onboarding/components/StyledOnboardingStepHeading';
import { StyledOnboardingStepSubtitle } from '@/onboarding/components/StyledOnboardingStepSubtitle';
import { StyledOnboardingStepTitle } from '@/onboarding/components/StyledOnboardingStepTitle';
import { ONBOARDING_CONTENT_BLOCK_WIDTH } from '@/onboarding/constants/OnboardingContentBlockWidth';
import { TextInput } from '@/ui/input/components/TextInput';

// Desync signup questionnaire. Rendered on the CENTRAL domain as a step in the
// SignInUp flow (so the workspace nav hotkeys that stole the "g" key aren't
// mounted). Submitted to the core-schema `saveDesyncOnboarding` mutation (served
// at /metadata, the default Apollo client), which writes scraper_db
// `user_data.onboarding_*` + the best customers (match_requests) and grants the
// free Referral plan. The user must answer the 5 required questions AND add at
// least one best customer before continuing.
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

const StyledSectionLabel = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
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

export const DesyncQuestionnaire = ({ onCompleted }: Props) => {
  const { enqueueToast } = useToast();

  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [product, setProduct] = useState('');
  const [who, setWho] = useState('');
  const [outreach, setOutreach] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([emptyCustomer()]);

  const [saveDesyncOnboarding, { loading }] = useMutation(
    SAVE_DESYNC_ONBOARDING,
  );

  const updateCustomer = (id: number, patch: Partial<Customer>) =>
    setCustomers((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  const addCustomer = () => setCustomers((rows) => [...rows, emptyCustomer()]);

  const removeCustomer = (id: number) =>
    setCustomers((rows) =>
      rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
    );

  const customersWithWebsite = customers.filter(
    (c) => c.website.trim() !== '',
  );

  // The 5 required answers + at least one best customer (a row with a website).
  const isValid =
    company.trim() !== '' &&
    website.trim() !== '' &&
    product.trim() !== '' &&
    who.trim() !== '' &&
    outreach.trim() !== '' &&
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
          A few quick questions so we can find the right leads for you.
        </StyledOnboardingStepSubtitle>
      </StyledOnboardingStepHeading>

      <StyledForm>
        <TextInput
          label="What's your company?"
          value={company}
          onChange={setCompany}
          placeholder="Acme Inc."
          fullWidth
          autoFocus
        />
        <TextInput
          label="Company website"
          value={website}
          onChange={setWebsite}
          placeholder="https://acme.com"
          fullWidth
        />
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
          label="What type of business are you? (optional)"
          value={businessType}
          onChange={setBusinessType}
          placeholder="e.g. B2B SaaS, agency, nonprofit"
          fullWidth
        />

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
