import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Uses the app's normal cookie-based session (credentials: 'include'), the
// same authenticated client other non-GraphQL endpoints on this origin use
// (see SSEClientEffect). Never attaches or logs a token itself: the launch
// token comes back INSIDE the response body, already appended to the url.
export const fetchOntologyLaunchUrl = async (): Promise<string> => {
  const response = await fetch(
    `${REACT_APP_SERVER_BASE_URL}/rest/ontology/launch`,
    { credentials: 'include' },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the Ontology launch URL: ${response.status}`,
    );
  }

  const body: { url?: string } = await response.json();

  if (typeof body.url !== 'string') {
    throw new Error('Ontology launch response did not include a url');
  }

  return body.url;
};
