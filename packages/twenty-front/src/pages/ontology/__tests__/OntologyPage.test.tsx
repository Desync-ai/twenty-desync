import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { fetchOntologyLaunchUrl } from '@/ontology/utils/fetchOntologyLaunchUrl';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { OntologyPage } from '~/pages/ontology/OntologyPage';

jest.mock('@/ontology/utils/fetchOntologyLaunchUrl');

const mockedFetchOntologyLaunchUrl =
  fetchOntologyLaunchUrl as jest.MockedFunction<typeof fetchOntologyLaunchUrl>;

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <HelmetProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </HelmetProvider>
  </JotaiProvider>
);

describe('OntologyPage', () => {
  beforeEach(() => {
    resetJotaiStore();
    jest.clearAllMocks();
  });

  it('renders an iframe whose src comes from the launch endpoint, not the raw console URL', async () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: true,
      consoleUrl: 'https://console.example.com',
    });
    mockedFetchOntologyLaunchUrl.mockResolvedValue(
      'https://console.example.com#sso=abc.def',
    );

    const { getByTitle, queryByTitle } = render(<OntologyPage />, {
      wrapper: Wrapper,
    });

    // While the launch fetch is in flight, no iframe yet (loading state).
    expect(queryByTitle('Ontology')).toBeNull();

    await waitFor(() => expect(queryByTitle('Ontology')).not.toBeNull());

    const iframe = getByTitle('Ontology') as HTMLIFrameElement;

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.src).toBe('https://console.example.com/#sso=abc.def');
    expect(iframe.getAttribute('sandbox')?.split(' ')).toContain(
      'allow-downloads',
    );
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('allow')).toBe('clipboard-write');
  });

  it('falls back to the plain console URL when the launch fetch fails', async () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: true,
      consoleUrl: 'https://console.example.com',
    });
    mockedFetchOntologyLaunchUrl.mockRejectedValue(new Error('boom'));

    const { getByTitle, queryByTitle } = render(<OntologyPage />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(queryByTitle('Ontology')).not.toBeNull());

    const iframe = getByTitle('Ontology') as HTMLIFrameElement;

    expect(iframe.src).toBe('https://console.example.com/');
  });

  it('renders no iframe, and never fetches a launch url, when no console URL is configured', async () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: false,
      consoleUrl: null,
    });

    const { queryByTitle } = render(<OntologyPage />, { wrapper: Wrapper });

    expect(queryByTitle('Ontology')).toBeNull();
    expect(mockedFetchOntologyLaunchUrl).not.toHaveBeenCalled();
  });
});
