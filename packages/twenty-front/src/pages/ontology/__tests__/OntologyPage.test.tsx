import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { OntologyPage } from '~/pages/ontology/OntologyPage';

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
  });

  it('renders an iframe pointed at the configured console URL', () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: true,
      consoleUrl: 'https://console.example.com',
    });

    const { getByTitle } = render(<OntologyPage />, { wrapper: Wrapper });

    const iframe = getByTitle('Ontology') as HTMLIFrameElement;

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.src).toBe('https://console.example.com/');
    expect(iframe.getAttribute('sandbox')?.split(' ')).toContain(
      'allow-downloads',
    );
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('allow')).toBe('clipboard-write');
  });

  it('renders no iframe when no console URL is configured', () => {
    jotaiStore.set(ontologyConfigState.atom, {
      isEnabled: false,
      consoleUrl: null,
    });

    const { queryByTitle } = render(<OntologyPage />, { wrapper: Wrapper });

    expect(queryByTitle('Ontology')).toBeNull();
  });
});
