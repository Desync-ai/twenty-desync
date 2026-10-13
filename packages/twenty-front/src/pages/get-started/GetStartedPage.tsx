import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconArrowRight, IconPlug, IconSparkles } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { agentChatPrepromptState } from '@/ai/states/agentChatPrepromptState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { markGetStartedSeen } from '@/desync-onboarding/utils/getStartedSeen';
import { TextArea } from '@/ui/input/components/TextArea';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import {
  ConnectIntegrationCard,
  INTEGRATIONS,
} from '~/pages/settings/integrations/SettingsIntegrations';

// The integrations that are "places leads/contacts live", shown inline on the
// Get-started page so the user can connect without leaving the tab.
const LEAD_SOURCE_PLUGINS = [
  'hubspot',
  'salesforce',
  'apollo',
  'gmail',
  'outlook',
  'attio',
  'googlecalendar',
  'calendly',
];
const LEAD_SOURCE_INTEGRATIONS = INTEGRATIONS.filter((integration) =>
  LEAD_SOURCE_PLUGINS.includes(integration.plugin),
);

// Desync "Get started": a painfully-obvious first-run page. New users land on a
// dense, empty grid and do not know what to do or what the agent can do. This
// walks them through it: connect tools -> say where their leads are -> one tap
// to open the copilot pre-filled to clear the demo data and build their CRM.

const EXAMPLE_PROMPTS = [
  'Find leads that fit my business and add them to my CRM.',
  'Research a specific company and add it with its key contacts.',
  'Build a list of target companies in my market and add them.',
];

const StyledPage = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  margin: 0 auto;
  max-width: 640px;
  padding: ${themeCssVariables.spacing[8]} ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledSubtitle = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  margin: 0;
`;

const StyledSteps = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledStep = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledStepTop = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledStepNumber = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.blue};
  border-radius: 50%;
  color: #fff;
  display: flex;
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  height: 24px;
  justify-content: center;
  width: 24px;
`;

const StyledStepText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledStepTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStepHint = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
`;

const StyledIntegrationsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
`;

const StyledExamples = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledExamplesLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledChip = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;

  &:hover {
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.font.color.primary};
  }
`;

export const GetStartedPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const setAgentChatPreprompt = useSetAtomState(agentChatPrepromptState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);

  const [leadsSource, setLeadsSource] = useState('');

  // Desync: once the user has reached Get-started, don't auto-land them here
  // again on future entries to this workspace (the sidebar link still works).
  useEffect(() => {
    markGetStartedSeen(currentWorkspace?.id);
  }, [currentWorkspace?.id]);

  const openCopilotWith = (text: string) => {
    setAgentChatPreprompt({ text, mode: 'PREFILL' });
    navigate('/chat');
  };

  const buildPopulatePrompt = () => {
    const src = leadsSource.trim();
    return [
      'Help me set up my CRM. Please do these in order:',
      '1. Remove the sample/demo data that came with this workspace (the example companies, people, notes and opportunities) so I start clean. Confirm with me before deleting anything.',
      `2. Add my real customers and leads: pull them from the tools I have connected (email, calendar, meeting notes, HubSpot, Salesforce, and so on)${
        src ? `, and from here: ${src}` : ''
      }. Create the matching People and Companies.`,
      '3. Where it is clearly warranted (do not force it or invent anything), also create Opportunities and add Notes. For example: if you see payments I RECEIVED, invoices, or signed or won deals, add matching Opportunities and link them to the right person or company; add a Note when there is useful context like a deal thread or meeting summary. Do NOT turn my own purchases or vendor subscriptions into Opportunities, and skip this step entirely when there is no obvious signal.',
      '4. If, after checking my connected tools and any source above, there are no real contacts to add, then (and only then) search the web for 3 to 5 leads that fit my business and add them as People and Companies, tagged as AI-suggested.',
      'When you are done, give me a short summary of what you added and 3 follow-ups I should do this week.',
    ]
      .filter(Boolean)
      .join('\n');
  };

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <StyledTitle>{t`Welcome to Desync. Let's set up your CRM.`}</StyledTitle>
          <StyledSubtitle>
            {t`Your built-in AI agent can fill your CRM for you, pull in your contacts, find new leads, and tell you who to follow up with. Three quick steps and it does the work.`}
          </StyledSubtitle>
        </StyledHeader>

        <StyledSteps>
          <StyledStep>
            <StyledStepTop>
              <StyledStepNumber>1</StyledStepNumber>
              <StyledStepText>
                <StyledStepTitle>{t`Connect where your leads live`}</StyledStepTitle>
                <StyledStepHint>
                  {t`Connect a source and the agent can pull your real contacts and companies straight in. Connect as many as apply.`}
                </StyledStepHint>
              </StyledStepText>
            </StyledStepTop>
            <StyledIntegrationsGrid>
              {LEAD_SOURCE_INTEGRATIONS.map((integration) => (
                <ConnectIntegrationCard
                  key={integration.plugin}
                  integration={integration}
                  compact
                />
              ))}
            </StyledIntegrationsGrid>
            <div>
              <Button
                variant="outline"
                startIcon={<IconPlug size={16} />}
                onClick={() =>
                  navigate(getSettingsPath(SettingsPath.Integrations))
                }
              >
                {t`See all integrations`}
              </Button>
            </div>
          </StyledStep>

          <StyledStep>
            <StyledStepTop>
              <StyledStepNumber>2</StyledStepNumber>
              <StyledStepText>
                <StyledStepTitle>{t`Let the agent build your CRM`}</StyledStepTitle>
                <StyledStepHint>
                  {t`Opens the agent with a ready-to-send plan: it clears the sample data (confirming first), then pulls your contacts and companies from whatever you connected above. If you connected nothing, it finds a few leads for you.`}
                </StyledStepHint>
              </StyledStepText>
            </StyledStepTop>
            <TextArea
              textAreaId="get-started-leads-source"
              label={t`Optional: a source that isn't a connected tool (a website, a spreadsheet, a list of names)`}
              placeholder={t`e.g. acme.com and 2 other companies, or paste a list of names`}
              value={leadsSource}
              onChange={setLeadsSource}
              minRows={2}
              maxRows={3}
            />
            <div>
              <Button
                variant="solid"
                color="accent"
                startIcon={<IconSparkles size={16} />}
                onClick={() => openCopilotWith(buildPopulatePrompt())}
              >
                {t`Build my CRM`}
              </Button>
            </div>
          </StyledStep>
        </StyledSteps>

        <StyledExamples>
          <StyledExamplesLabel>
            {t`Or have the agent fill your CRM another way:`}
          </StyledExamplesLabel>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <StyledChip key={prompt} onClick={() => openCopilotWith(prompt)}>
              <IconArrowRight
                size={14}
                style={{ marginRight: 6, verticalAlign: 'middle' }}
              />
              {prompt}
            </StyledChip>
          ))}
        </StyledExamples>
      </StyledContent>
    </StyledPage>
  );
};
