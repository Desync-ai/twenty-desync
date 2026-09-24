import { styled } from '@linaria/react';
import { DesyncAiChatPanel } from '@/desync-ai/components/DesyncAiChatPanel';

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
`;

// The "Ask AI" side-panel seat renders the Desync assistant, which calls the
// lead-gen platform's metered AI gateway (quota-gated) instead of Twenty's
// native server-side LLM. See DesyncAiChatPanel.
export const SidePanelAskAiPage = () => {
  return (
    <StyledContainer>
      <DesyncAiChatPanel />
    </StyledContainer>
  );
};
