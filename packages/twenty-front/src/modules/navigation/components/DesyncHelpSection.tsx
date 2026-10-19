import { isNonEmptyString } from '@sniptt/guards';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { IconAlertTriangle, IconCalendarEvent } from 'twenty-ui/icon';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Button } from 'twenty-ui/primitives/input';
import { H1Title, H1TitleFontColor } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { calendarBookingPageIdState } from '@/client-config/states/calendarBookingPageIdState';
import { BookCallEmbed } from '@/onboarding/components/BookCallEmbed';
import { TextArea } from '@/ui/input/components/TextArea';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Desync: a pinned "Help" section at the bottom of the main sidebar so a user
// can always (a) book time with the team and (b) report a bug / send feedback,
// from anywhere in the app. The bug report carries a Bug/Feedback type and a
// 1-3 severity (1 = most serious). Both post to the same /integrations/feedback
// endpoint that emails the team via Resend.

const BOOK_CALL_MODAL_ID = 'desync-book-call-modal';
const BUG_REPORT_MODAL_ID = 'desync-bug-report-modal';

type FeedbackType = 'bug' | 'feedback';
type Severity = 1 | 2 | 3;

const StyledSection = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledFieldLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledHelperText = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledToggleRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};

  & > * {
    flex: 1;
    min-width: 0;
  }
`;

const StyledModalActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[2]};
  width: 100%;

  & > * {
    flex: 1;
  }
`;

const StyledCalEmbed = styled.div`
  height: min(72vh, 660px);
  overflow: auto;
  width: 100%;
`;

const postFeedback = async (payload: {
  kind: FeedbackType;
  message: string;
  severity?: Severity;
}) => {
  const res = await fetch(
    `${REACT_APP_SERVER_BASE_URL}/integrations/feedback`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j?.error ?? j?.message ?? msg;
    } catch {
      // keep the default message
    }
    throw new Error(msg);
  }
};

export const DesyncHelpSection = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();

  const calendarBookingPageId = useAtomStateValue(calendarBookingPageIdState);
  const hasBookingPage = isNonEmptyString(calendarBookingPageId);

  const [type, setType] = useState<FeedbackType>('bug');
  const [severity, setSeverity] = useState<Severity>(2);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const openBugReport = () => {
    setType('bug');
    setSeverity(2);
    setMessage('');
    openModal(BUG_REPORT_MODAL_ID);
  };

  const submit = async () => {
    const text = message.trim();
    if (!text) {
      return;
    }
    setSending(true);
    try {
      await postFeedback({
        kind: type,
        message: text,
        ...(type === 'bug' ? { severity } : {}),
      });
      enqueueToast({
        variant: 'success',
        children: t`Thanks, sent to the Desync team.`,
      });
      setMessage('');
      closeModal(BUG_REPORT_MODAL_ID);
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't send: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setSending(false);
    }
  };

  const isBug = type === 'bug';

  return (
    <>
      <StyledSection role="group" aria-label="Help">
        {hasBookingPage && (
          <NavigationDrawerItem
            label={t`Book a call`}
            Icon={IconCalendarEvent}
            onClick={() => openModal(BOOK_CALL_MODAL_ID)}
          />
        )}
        <NavigationDrawerItem
          label={t`Report a bug`}
          Icon={IconAlertTriangle}
          onClick={openBugReport}
        />
      </StyledSection>

      {hasBookingPage && (
        <ModalStatefulWrapper
          modalInstanceId={BOOK_CALL_MODAL_ID}
          onClose={() => closeModal(BOOK_CALL_MODAL_ID)}
          isClosable
          size="medium"
          padding="medium"
          overlay="dark"
          width="min(920px, 94vw)"
          dataGloballyPreventClickOutside
          renderInDocumentBody
          smallBorderRadius
        >
          <H1Title
            title={t`Talk to the Desync team`}
            fontColor={H1TitleFontColor.Primary}
          />
          <StyledHelperText>
            {t`Book a 30-minute call with Mark or Jackson.`}
          </StyledHelperText>
          <StyledCalEmbed>
            <BookCallEmbed calendarBookingPageId={calendarBookingPageId} />
          </StyledCalEmbed>
        </ModalStatefulWrapper>
      )}

      <ModalStatefulWrapper
        modalInstanceId={BUG_REPORT_MODAL_ID}
        onClose={() => closeModal(BUG_REPORT_MODAL_ID)}
        isClosable
        size="medium"
        padding="large"
        overlay="dark"
        width="460px"
        dataGloballyPreventClickOutside
        renderInDocumentBody
        smallBorderRadius
        autoHeight
      >
        <H1Title
          title={isBug ? t`Report a bug` : t`Send feedback`}
          fontColor={H1TitleFontColor.Primary}
        />
        <StyledModalBody>
          <StyledField>
            <StyledFieldLabel>{t`Type`}</StyledFieldLabel>
            <StyledToggleRow>
              <Button
                variant={isBug ? 'solid' : 'outline'}
                color={isBug ? 'accent' : undefined}
                onClick={() => setType('bug')}
              >
                {t`Bug`}
              </Button>
              <Button
                variant={!isBug ? 'solid' : 'outline'}
                color={!isBug ? 'accent' : undefined}
                onClick={() => setType('feedback')}
              >
                {t`Feedback`}
              </Button>
            </StyledToggleRow>
          </StyledField>

          {isBug && (
            <StyledField>
              <StyledFieldLabel>{t`Severity`}</StyledFieldLabel>
              <StyledToggleRow>
                {([1, 2, 3] as const).map((level) => (
                  <Button
                    key={level}
                    variant={severity === level ? 'solid' : 'outline'}
                    color={severity === level ? 'accent' : undefined}
                    onClick={() => setSeverity(level)}
                  >
                    {String(level)}
                  </Button>
                ))}
              </StyledToggleRow>
              <StyledHelperText>
                {t`1 is most serious, 3 is least.`}
              </StyledHelperText>
            </StyledField>
          )}

          <TextArea
            textAreaId={`${BUG_REPORT_MODAL_ID}-message`}
            label={isBug ? t`What happened?` : t`Your feedback`}
            placeholder={
              isBug
                ? t`What you expected, what happened, and where.`
                : t`Tell us what's on your mind.`
            }
            value={message}
            onChange={setMessage}
            minRows={4}
            maxRows={10}
          />
        </StyledModalBody>
        <StyledModalActions>
          <Button
            variant="outline"
            onClick={() => closeModal(BUG_REPORT_MODAL_ID)}
            fullWidth
          >
            {t`Cancel`}
          </Button>
          <Button
            variant="solid"
            color="accent"
            onClick={submit}
            disabled={!message.trim() || sending}
            fullWidth
          >
            {t`Send`}
          </Button>
        </StyledModalActions>
      </ModalStatefulWrapper>
    </>
  );
};
