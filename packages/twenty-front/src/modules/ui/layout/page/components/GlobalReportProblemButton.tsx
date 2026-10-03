import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';
import { useToast } from 'twenty-ui/primitives/feedback';
import { H1Title, H1TitleFontColor } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Always-visible "Report a problem" affordance, mounted app-wide in DefaultLayout
// so users can flag an issue from any page. Posts to the same team-email endpoint
// as the Settings -> Integrations "Report a problem" button.
const MODAL_ID = 'global-report-problem-modal';

const StyledFloating = styled.div`
  bottom: ${themeCssVariables.spacing[4]};
  position: fixed;
  right: ${themeCssVariables.spacing[4]};
  z-index: 9000;
`;

const StyledBody = styled.div`
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[6]};

  > * {
    flex: 1;
    min-width: 0;
  }
`;

export const GlobalReportProblemButton = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  // Hide the floating button while the right side panel is open (AI agent chat,
  // command menu, record panel). It's pinned to the bottom-right corner, which is
  // exactly where the AI chat's Send button sits — so it would otherwise block it.
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);

  const submit = async () => {
    const text = message.trim();
    if (!text) {
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${REACT_APP_SERVER_BASE_URL}/integrations/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'problem', message: text }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? json?.message ?? `Request failed (${res.status})`);
      }
      enqueueToast({ variant: 'success', children: t`Thanks — sent to the Desync team.` });
      setMessage('');
      closeModal(MODAL_ID);
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't send: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!isSidePanelOpened && (
        <StyledFloating>
          <Button
            variant="solid"
            size="md"
            elevated
            onClick={() => {
              setMessage('');
              openModal(MODAL_ID);
            }}
          >
            {t`Report a problem`}
          </Button>
        </StyledFloating>
      )}

      <ModalStatefulWrapper
        modalInstanceId={MODAL_ID}
        onClose={() => closeModal(MODAL_ID)}
        isClosable
        size="medium"
        padding="large"
        overlay="dark"
        width="420px"
        dataGloballyPreventClickOutside
        renderInDocumentBody
        smallBorderRadius
        autoHeight
      >
        <H1Title title={t`Report a problem`} fontColor={H1TitleFontColor.Primary} />
        <StyledBody>
          <SettingsTextInput
            instanceId={`${MODAL_ID}-message`}
            label={t`What happened?`}
            placeholder={t`Describe the problem…`}
            value={message}
            onChange={setMessage}
            maxLength={1000}
            autoFocusOnMount
            fullWidth
          />
        </StyledBody>
        <StyledActions>
          <Button variant="outline" onClick={() => closeModal(MODAL_ID)} fullWidth>
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
        </StyledActions>
      </ModalStatefulWrapper>
    </>
  );
};
