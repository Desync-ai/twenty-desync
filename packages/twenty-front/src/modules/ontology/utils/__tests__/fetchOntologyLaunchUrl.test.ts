import { REACT_APP_SERVER_BASE_URL } from '~/config';

import { fetchOntologyLaunchUrl } from '@/ontology/utils/fetchOntologyLaunchUrl';

global.fetch = jest.fn();

describe('fetchOntologyLaunchUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the launch url with the app credentialed session, not a bearer header', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://console.example.com#sso=abc.def' }),
    });

    const result = await fetchOntologyLaunchUrl();

    expect(fetch).toHaveBeenCalledWith(
      `${REACT_APP_SERVER_BASE_URL}/rest/ontology/launch`,
      { credentials: 'include' },
    );
    expect(result).toBe('https://console.example.com#sso=abc.def');
  });

  it('throws when the response is not ok', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(fetchOntologyLaunchUrl()).rejects.toThrow(
      'Failed to fetch the Ontology launch URL: 401',
    );
  });

  it('throws when the response body has no url', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await expect(fetchOntologyLaunchUrl()).rejects.toThrow(
      'Ontology launch response did not include a url',
    );
  });

  it('propagates network errors', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchOntologyLaunchUrl()).rejects.toThrow('Network error');
  });
});
