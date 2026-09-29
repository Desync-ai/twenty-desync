import { useEffect, useState } from 'react';
import { styled } from '@linaria/react';
import { Loader } from 'twenty-ui/primitives/feedback';

import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { fetchOntologyLaunchUrl } from '@/ontology/utils/fetchOntologyLaunchUrl';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

const ONTOLOGY_PAGE_TITLE = 'Ontology';

const StyledIframeContainer = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
`;

const StyledIframe = styled.iframe`
  border: none;
  flex: 1;
  height: 100%;
  width: 100%;
`;

// The console is a separately hosted app; this page only frames it in an
// iframe. No postMessage bridge, and no token handling of our own: the SSO
// launch token (if any) rides inside the fetched url's fragment, and is never
// read, stored, or logged here — only ever handed straight to the iframe src.
export const OntologyPage = () => {
  const ontologyConfig = useAtomStateValue(ontologyConfigState);

  const [iframeSrc, setIframeSrc] = useState<string | null>(
    ontologyConfig.consoleUrl,
  );
  const [isLoadingLaunchUrl, setIsLoadingLaunchUrl] = useState(
    !!ontologyConfig.consoleUrl,
  );

  useEffect(() => {
    if (!ontologyConfig.consoleUrl) {
      return;
    }

    let isMounted = true;

    fetchOntologyLaunchUrl()
      .then((url) => {
        if (isMounted) {
          setIframeSrc(url);
        }
      })
      .catch(() => {
        // Fall back to the plain console URL: identical to SSO being off.
        if (isMounted) {
          setIframeSrc(ontologyConfig.consoleUrl);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingLaunchUrl(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [ontologyConfig.consoleUrl]);

  return (
    <>
      <PageTitle title={ONTOLOGY_PAGE_TITLE} />
      <PageCardLayout
        showInformationBanner={false}
        header={<PageCardHeader title={ONTOLOGY_PAGE_TITLE} />}
      >
        <StyledIframeContainer>
          {isLoadingLaunchUrl ? (
            <Loader color="gray" />
          ) : (
            iframeSrc && (
              <StyledIframe
                src={iframeSrc}
                title={ONTOLOGY_PAGE_TITLE}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads"
                allow="clipboard-write"
                referrerPolicy="no-referrer"
              />
            )
          )}
        </StyledIframeContainer>
      </PageCardLayout>
    </>
  );
};
