import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type ComponentType, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  IconArrowRight,
  IconDatabase,
  IconMail,
  IconPhone,
  IconPlug,
  IconSparkles,
  IconTargetArrow,
  IconUsers,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useOpenAskAiPageWithPreprompt } from '@/ai/hooks/useOpenAskAiPageWithPreprompt';
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

// The integrations that are "places leads/contacts live", shown inline in the
// Populate play so the user can connect without leaving the tab.
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

// Quick lookup so a play can name the Composio integrations it benefits from.
const INTEGRATION_BY_PLUGIN = new Map(
  INTEGRATIONS.map((integration) => [integration.plugin, integration] as const),
);

// Desync "Playbooks" (was "Get started"): one-tap recipes that open the built-in
// agent pre-loaded with a battle-tested prompt and run it. Most users don't know
// how to prompt an AI; each card packages a high-value job into a single button
// so they get the payoff without writing anything. Master-detail layout: pick a
// play on the left, its detail (what it does, the tools it uses, the run button)
// opens on the right. Populate keeps the review-before-send flow since it clears
// the demo data; the other plays auto-run with a hard no-send rule.

const POPULATE_KEY = 'populate';

const EXAMPLE_PROMPTS = [
  'Find leads that fit my business and add them to my CRM.',
  'Research a specific company and add it with its key contacts.',
  'Build a list of target companies in my market and add them.',
];

// Shared guardrail for any play that drafts outreach: the agent must understand
// the goal, the recipient, and our own user's business before it writes a word.
const OUTREACH_BRIEF =
  'Before writing anything, make sure you know and briefly state: (1) the goal of this outreach and what I want to happen, (2) what the recipient and their company actually do, and (3) what my company does and what I am offering them. Pull these from my CRM and connected tools; if any of the three is unclear, ask me one short question instead of guessing. Tailor every message to all three.';

// Hard rule appended to every auto-run play: a playbook can draft and prepare,
// but it must never send a message or take an irreversible action on its own.
const NO_SEND_RULE =
  'Hard rule: never send any email or message yourself, and never take an irreversible action, under any circumstances. Only prepare drafts and proposed changes for me to review. I will send anything that goes out.';

const ENRICH_PROMPT =
  'Enrich the people already in my CRM. Start with the 50 most recently added People that have missing details. For each one, fill in any missing job title, company, work email, LinkedIn URL and location using my connected tools and the web. Update the records in place, do not create duplicates, and do not invent anything: if you cannot verify a field, leave it blank. When you are done, tell me how many people you updated and which fields were most often missing.';

const CALLS_PROMPT =
  'Go through my call and meeting transcripts from the last two weeks, using my connected tools (Fathom, Granola, Pocket, meeting notes, calendar). For each call: find the matching Person or Company in my CRM (only create one if it is clearly missing), add a Note with a short summary and the key takeaways, and create Tasks for any clear follow-ups or commitments, with a due date when one was mentioned. When you are done, give me a short list of the calls you processed and the follow-up tasks you created.';

const LOOKALIKES_PROMPT =
  'Find new leads that look like my best customers. First look at my won opportunities and the companies and people I clearly do business with, and tell me the pattern you see (industry, company size, the roles of the people). Then find about 15 new leads that fit that same profile and add them as People and Companies, tagged as AI-suggested, each with a one-line reason it matches. Do not draft or send any outreach: just build the list and show me who you added and why.';

const FOLLOWUPS_PROMPT = `Find the people I have gone quiet on: open opportunities with no activity in the last two weeks, and people I have emailed or met with before but have not contacted recently. For each, draft a short, personalized follow-up. ${OUTREACH_BRIEF} Draft everything for my review and do not send anything. When you are done, show me the drafts grouped by person so I can review and send them myself.`;

type Playbook = {
  key: string;
  title: string;
  outcome: string;
  cta: string;
  Icon: ComponentType<{ size?: number }>;
  prompt: string;
  hint?: string;
  // Composio integrations this play benefits from, shown as real connect cards
  // in the detail panel. Empty/undefined renders "No integration needed".
  plugins?: string[];
};

// The one-tap plays. Populate is handled separately because its detail asks
// questions and runs with review rather than firing the agent immediately.
const PLAYBOOKS: Playbook[] = [
  {
    key: 'enrich',
    title: 'Enrich your people',
    outcome:
      'Fill in missing titles, companies, work emails and LinkedIn for the people already in your CRM.',
    cta: 'Enrich my people',
    Icon: IconUsers,
    prompt: ENRICH_PROMPT,
  },
  {
    key: 'calls',
    title: 'Turn calls into notes & tasks',
    outcome:
      'Read your recent call transcripts, log a note on each contact and create the follow-up tasks.',
    cta: 'Process my calls',
    Icon: IconPhone,
    prompt: CALLS_PROMPT,
    plugins: ['fathom', 'granola_mcp', 'pocket'],
  },
  {
    key: 'lookalikes',
    title: 'Find leads like your best customers',
    outcome:
      'Spot the pattern in your best customers and add ~15 new leads that fit the same profile.',
    cta: 'Find lookalike leads',
    Icon: IconTargetArrow,
    prompt: LOOKALIKES_PROMPT,
    plugins: ['apollo', 'hubspot', 'salesforce'],
  },
  {
    key: 'followups',
    title: 'Draft follow-ups for quiet contacts',
    outcome:
      'Find people and deals that have gone quiet and draft a personalized nudge for each, ready to review.',
    cta: 'Draft my follow-ups',
    Icon: IconMail,
    prompt: FOLLOWUPS_PROMPT,
    hint: 'Drafts only. A playbook never sends anything itself.',
    plugins: ['gmail', 'outlook'],
  },
];

// Left-rail entries: Populate first (its own detail), then the one-tap plays.
const PLAY_LIST: {
  key: string;
  title: string;
  outcome: string;
  Icon: ComponentType<{ size?: number }>;
}[] = [
  {
    key: POPULATE_KEY,
    title: 'Populate your CRM',
    outcome:
      'Import your existing contacts and companies, and let the agent set it all up for you.',
    Icon: IconDatabase,
  },
  ...PLAYBOOKS.map(({ key, title, outcome, Icon }) => ({
    key,
    title,
    outcome,
    Icon,
  })),
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
  max-width: 1120px;
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

const StyledLayout = styled.div`
  align-items: flex-start;
  display: flex;
  gap: ${themeCssVariables.spacing[6]};

  @media (max-width: 899px) {
    flex-direction: column;
  }
`;

const StyledPlayList = styled.div`
  display: flex;
  flex: 0 0 360px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  width: 360px;

  @media (max-width: 899px) {
    flex: 1 1 auto;
    width: 100%;
  }
`;

const StyledPlayCard = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[4]};
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledPlayCardTop = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPlayCardTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledPlayCardOutcome = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
`;

const StyledDetail = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  min-height: 320px;
  min-width: 0;
  padding: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledPlaceholder = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.light};
  display: flex;
  flex: 1;
  font-size: ${themeCssVariables.font.size.md};
  justify-content: center;
  text-align: center;
`;

const StyledDetailHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledDetailTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledDetailText = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  margin: 0;
`;

const StyledDetailNote = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
`;

const StyledSectionLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const StyledBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStepHint = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
`;

const StyledIntegrationsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  const { openAskAiPageWithPreprompt } = useOpenAskAiPageWithPreprompt();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);

  const [leadsSource, setLeadsSource] = useState('');
  // Which play's detail is open. Null = nothing selected yet.
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);

  // Desync: once the user has reached Playbooks, don't auto-land them here
  // again on future entries to this workspace (the sidebar link still works).
  useEffect(() => {
    markGetStartedSeen(currentWorkspace?.id);
  }, [currentWorkspace?.id]);

  const openCopilotWith = (text: string) => {
    setAgentChatPreprompt({ text, mode: 'PREFILL' });
    navigate('/chat');
  };

  // Plays fire the agent straight away: one tap, it opens and runs. Every play
  // carries the no-send rule so the agent can draft but never send.
  const runPlaybook = (prompt: string) => {
    openAskAiPageWithPreprompt({
      text: `${prompt}\n\n${NO_SEND_RULE}`,
      mode: 'SEND',
    });
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

  const activePlay =
    activePlaybook !== null && activePlaybook !== POPULATE_KEY
      ? PLAYBOOKS.find((playbook) => playbook.key === activePlaybook)
      : undefined;

  const renderPopulateDetail = () => (
    <>
      <StyledDetailHeader>
        <IconDatabase size={22} />
        <StyledDetailTitle>{t`Populate your CRM`}</StyledDetailTitle>
      </StyledDetailHeader>
      <StyledDetailText>
        {t`Import your real customers and leads from the tools you already use, then let the agent set up your People, Companies, and deals for you.`}
      </StyledDetailText>

      <StyledBlock>
        <StyledSectionLabel>{t`1. Connect where your leads live`}</StyledSectionLabel>
        <StyledStepHint>
          {t`Connect a source and the agent can pull your real contacts and companies straight in. Connect as many as apply.`}
        </StyledStepHint>
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
            onClick={() => navigate(getSettingsPath(SettingsPath.Integrations))}
          >
            {t`See all integrations`}
          </Button>
        </div>
      </StyledBlock>

      <StyledBlock>
        <StyledSectionLabel>{t`2. Let the agent build your CRM`}</StyledSectionLabel>
        <StyledStepHint>
          {t`Opens the agent with a ready-to-send plan: it clears the sample data (confirming first), then pulls your contacts and companies from whatever you connected. If you connected nothing, it finds a few leads for you.`}
        </StyledStepHint>
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
      </StyledBlock>

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
    </>
  );

  const renderPlayDetail = (playbook: Playbook) => {
    const suggested = (playbook.plugins ?? [])
      .map((plugin) => INTEGRATION_BY_PLUGIN.get(plugin))
      .filter((def): def is NonNullable<typeof def> => def !== undefined);

    return (
      <>
        <StyledDetailHeader>
          <playbook.Icon size={22} />
          <StyledDetailTitle>{playbook.title}</StyledDetailTitle>
        </StyledDetailHeader>
        <StyledDetailText>{playbook.outcome}</StyledDetailText>

        <StyledBlock>
          <StyledSectionLabel>{t`Tools this play can use`}</StyledSectionLabel>
          {suggested.length > 0 ? (
            <StyledIntegrationsGrid>
              {suggested.map((integration) => (
                <ConnectIntegrationCard
                  key={integration.plugin}
                  integration={integration}
                  compact
                />
              ))}
            </StyledIntegrationsGrid>
          ) : (
            <StyledStepHint>{t`No integration needed for this one.`}</StyledStepHint>
          )}
        </StyledBlock>

        <StyledDetailNote>
          {playbook.hint
            ? playbook.hint
            : t`The agent drafts and prepares changes for you. It never sends anything on its own.`}
        </StyledDetailNote>

        <div>
          <Button
            variant="solid"
            color="accent"
            startIcon={<IconSparkles size={16} />}
            onClick={() => runPlaybook(playbook.prompt)}
          >
            {playbook.cta}
          </Button>
        </div>
      </>
    );
  };

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <StyledTitle>{t`Playbooks`}</StyledTitle>
          <StyledSubtitle>
            {t`Pick a play and your built-in AI agent does the work for you. One tap, no prompting needed.`}
          </StyledSubtitle>
        </StyledHeader>

        <StyledLayout>
          <StyledPlayList>
            {PLAY_LIST.map((play) => (
              <StyledPlayCard
                key={play.key}
                onClick={() =>
                  setActivePlaybook((prev) =>
                    prev === play.key ? null : play.key,
                  )
                }
                style={
                  activePlaybook === play.key
                    ? { borderColor: themeCssVariables.color.blue }
                    : undefined
                }
              >
                <StyledPlayCardTop>
                  <play.Icon size={18} />
                  <StyledPlayCardTitle>{play.title}</StyledPlayCardTitle>
                </StyledPlayCardTop>
                <StyledPlayCardOutcome>{play.outcome}</StyledPlayCardOutcome>
              </StyledPlayCard>
            ))}
          </StyledPlayList>

          <StyledDetail>
            {activePlaybook === null && (
              <StyledPlaceholder>
                {t`Pick a play on the left to see what it does and the tools it uses.`}
              </StyledPlaceholder>
            )}
            {activePlaybook === POPULATE_KEY && renderPopulateDetail()}
            {activePlay && renderPlayDetail(activePlay)}
          </StyledDetail>
        </StyledLayout>
      </StyledContent>
    </StyledPage>
  );
};
