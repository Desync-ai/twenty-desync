import { styled } from '@linaria/react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useLingui } from '@lingui/react/macro';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { IconArrowUp, IconSparkles } from 'twenty-ui/icon';
import { RoundedIconButton, Textarea } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { clerkConfigState } from '@/client-config/states/clerkConfigState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { CRM_AI_BASE_URL } from '~/config';

// The Desync AI assistant is a keyless client: it calls the lead-gen platform's
// metered gateway (POST /internal/ai/complete) with the signed-in user's Clerk
// JWT. That endpoint gates + meters every call against the SAME AI quota as the
// in-app search agent, so the CRM can never overspend a user's budget — the
// spend controls live server-side, not here.

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AiCompleteResponse = {
  role: 'assistant';
  content: string;
  usage?: {
    ai_cost_cents: number;
    ai_cost_quota_cents: number;
    this_call_cost_cents: number;
  };
};

type AiErrorBody = {
  error?: string;
  killswitch?: boolean;
};

// Product framing sent as the system prompt. The gateway supplies a generic
// default; this is the CRM-specific framing the calling app owns.
const SYSTEM_PROMPT =
  'You are the Desync AI assistant embedded in the Desync CRM. Help the user ' +
  'with their contacts, companies, deals, and outreach. Be concise and use ' +
  'markdown for structure when it helps.';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const StyledMessageList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledCentered = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.light};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

const StyledMessageRow = styled.div<{ isUser: boolean }>`
  align-items: ${({ isUser }) => (isUser ? 'flex-end' : 'flex-start')};
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledBubble = styled.div<{ isUser: boolean }>`
  background: ${({ isUser }) =>
    isUser ? themeCssVariables.background.tertiary : 'transparent'};
  border-radius: ${({ isUser }) =>
    isUser ? themeCssVariables.border.radius.lg : '0'};
  color: ${themeCssVariables.font.color.primary};
  line-height: 1.4em;
  max-width: 100%;
  overflow-wrap: break-word;
  padding: ${({ isUser }) =>
    isUser
      ? `${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]}`
      : '0'};
  white-space: ${({ isUser }) => (isUser ? 'pre-wrap' : 'normal')};
  width: ${({ isUser }) => (isUser ? 'fit-content' : '100%')};

  p {
    line-height: 1.4em;
    margin-block: ${themeCssVariables.spacing[1]};
  }

  code {
    background: ${themeCssVariables.background.tertiary};
    border-radius: ${themeCssVariables.border.radius.sm};
    padding: 1px 3px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  pre {
    background: ${themeCssVariables.background.tertiary};
    border-radius: ${themeCssVariables.border.radius.sm};
    max-width: 100%;
    overflow-x: auto;
    padding: ${themeCssVariables.spacing[2]};

    code {
      background: none;
      padding: 0;
    }
  }

  ul,
  ol {
    margin: ${themeCssVariables.spacing[1]} 0;
    padding-left: ${themeCssVariables.spacing[4]};
  }

  ul {
    list-style-type: disc;
  }
`;

const StyledThinking = styled.div`
  color: ${themeCssVariables.font.color.light};
`;

const StyledBanner = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0 ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledComposer = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledComposerButtons = styled.div`
  align-items: center;
  display: flex;
  justify-content: flex-end;
  width: 100%;
`;

const DesyncAiChatInner = () => {
  const { t } = useLingui();
  const { getToken } = useClerkAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (text.length === 0 || isLoading || isBlocked) {
      return;
    }

    const outgoing: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(outgoing);
    setInput('');
    setBanner(null);
    setIsLoading(true);

    try {
      // Fresh short-lived Clerk session JWT for the Bearer header (the gateway
      // resolves the internal user from this token — never a body identity).
      const token = await getToken();
      if (token === null) {
        setBanner(t`Your session has expired — please refresh the page.`);
        return;
      }

      const response = await fetch(`${CRM_AI_BASE_URL}/internal/ai/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: outgoing, system: SYSTEM_PROMPT }),
      });

      if (response.ok) {
        const data = (await response.json()) as AiCompleteResponse;
        setMessages([
          ...outgoing,
          { role: 'assistant', content: data.content ?? '' },
        ]);
        return;
      }

      const errorBody = (await response
        .json()
        .catch(() => ({}))) as AiErrorBody;

      // 403 = unentitled / no AI quota provisioned; 429 = quota exhausted. Both
      // are terminal for this session — block the composer and explain, using
      // the server's own message when present.
      if (response.status === 403) {
        setIsBlocked(true);
        setBanner(
          errorBody.error ?? t`The AI assistant requires an active paid plan.`,
        );
      } else if (response.status === 429) {
        setIsBlocked(true);
        setBanner(
          errorBody.error ??
            t`You've reached your AI usage limit for this billing period.`,
        );
      } else if (response.status === 503) {
        setBanner(
          t`The AI assistant is temporarily unavailable. Please try again shortly.`,
        );
      } else {
        setBanner(errorBody.error ?? t`Something went wrong. Please try again.`);
      }
    } catch {
      setBanner(
        t`Couldn't reach the AI assistant. Check your connection and try again.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !isLoading;
  const canSend = !isLoading && !isBlocked && input.trim().length > 0;

  return (
    <StyledContainer>
      <StyledMessageList>
        {isEmpty ? (
          <StyledCentered>
            <IconSparkles size={32} />
            <div>{t`Ask the Desync assistant anything about your CRM.`}</div>
          </StyledCentered>
        ) : (
          <>
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              return (
                <StyledMessageRow key={index} isUser={isUser}>
                  <StyledBubble isUser={isUser}>
                    {isUser ? (
                      message.content
                    ) : (
                      <Markdown>{message.content}</Markdown>
                    )}
                  </StyledBubble>
                </StyledMessageRow>
              );
            })}
            {isLoading && (
              <StyledMessageRow isUser={false}>
                <StyledBubble isUser={false}>
                  <StyledThinking>{t`Thinking…`}</StyledThinking>
                </StyledBubble>
              </StyledMessageRow>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </StyledMessageList>

      {banner !== null && <StyledBanner>{banner}</StyledBanner>}

      <StyledComposer>
        <Textarea
          autoResize
          maxRows={8}
          placeholder={t`Message the Desync assistant…`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isBlocked}
        />
        <StyledComposerButtons>
          <RoundedIconButton
            Icon={IconArrowUp}
            size="medium"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label={t`Send`}
          />
        </StyledComposerButtons>
      </StyledComposer>
    </StyledContainer>
  );
};

/**
 * Desync AI chat — a self-contained side-panel assistant that calls the lead-gen
 * platform's metered AI gateway with the user's Clerk JWT. Replaces Twenty's
 * native (server-LLM, unmetered) copilot in the "Ask AI" side-panel seat.
 *
 * The inner component calls `useClerkAuth()`, which is only valid inside
 * `<ClerkProvider>` — mounted only when Clerk is enabled (see
 * ClerkAuthProvider). This wrapper guards on `clerkConfigState` so the hook
 * never runs without a provider, and short-circuits when no gateway URL is
 * configured.
 */
export const DesyncAiChatPanel = () => {
  const { t } = useLingui();
  const clerkConfig = useAtomStateValue(clerkConfigState);

  if (!clerkConfig.isEnabled) {
    return (
      <StyledCentered>{t`Sign in to use the AI assistant.`}</StyledCentered>
    );
  }

  if (CRM_AI_BASE_URL.length === 0) {
    return (
      <StyledCentered>{t`The AI assistant is not configured on this instance.`}</StyledCentered>
    );
  }

  return <DesyncAiChatInner />;
};
