import { styled } from '@linaria/react';

import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

const ONTOLOGY_PAGE_TITLE = 'Ontology';

const StyledIframeContainer = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledIframe = styled.iframe`
  border: none;
  flex: 1;
  height: 100%;
  width: 100%;
`;

// The console is a separately hosted app; this page only frames it in an
// iframe. No postMessage bridge, token handling, or data ever crosses here.
export const OntologyPage = () => {
  const ontologyConfig = useAtomStateValue(ontologyConfigState);

  return (
    <>
      <PageTitle title={ONTOLOGY_PAGE_TITLE} />
      <PageCardLayout
        showInformationBanner={false}
        header={<PageCardHeader title={ONTOLOGY_PAGE_TITLE} />}
      >
        <StyledIframeContainer>
          {ontologyConfig.consoleUrl && (
            <StyledIframe
              src={ontologyConfig.consoleUrl}
              title={ONTOLOGY_PAGE_TITLE}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads"
              allow="clipboard-write"
              referrerPolicy="no-referrer"
            />
          )}
        </StyledIframeContainer>
      </PageCardLayout>
    </>
  );
};
