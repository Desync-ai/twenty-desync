import { isNonEmptyString, isObject, isString } from '@sniptt/guards';

import { type AskJev, type JevAnswer, type JevReply } from 'src/types/jev';

// TypeSafe's decision API, the same one twenty-backend's /classify proxies;
// the model is pinned because the `jev-latest` alias moves.
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_JEV_MODEL = 'jev-1.13.0';
const RETRIES = 2;
const MESSAGE_MAX = 200;

const isRetryable = (status: number) =>
  status === 408 || status === 429 || status >= 500;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// The server's own short message, never the body and never the key.
const readServerMessage = (body: string, apiKey: string): string => {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const nested = parsed.error;
    const candidates = [
      parsed.message,
      parsed.detail,
      isObject(nested) ? (nested as Record<string, unknown>).message : nested,
    ];
    const found = candidates.find(
      (candidate): candidate is string =>
        isString(candidate) && candidate.trim().length > 0,
    );

    return found
      ? found.split(apiKey).join('[key]').trim().slice(0, MESSAGE_MAX)
      : '';
  } catch {
    return '';
  }
};

export const createAskJev = ({
  apiKey,
  model,
  fetchImplementation = fetch,
}: {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
}): AskJev => {
  const trimmedModel = model?.trim();
  const pinnedModel = isNonEmptyString(trimmedModel)
    ? trimmedModel
    : DEFAULT_JEV_MODEL;

  return async (spec): Promise<JevReply> => {
    const body = JSON.stringify({
      model: pinnedModel,
      state: spec.state,
      questions: spec.questions,
    });

    for (let attempt = 0; ; attempt++) {
      const isLastAttempt = attempt === RETRIES;
      const response = await fetchImplementation(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          answers?: unknown;
          model?: unknown;
        };

        if (!isObject(data?.answers) || !isString(data?.model)) {
          throw new Error('Jev replied without answers or a model.');
        }

        return {
          answers: data.answers as Record<string, JevAnswer>,
          model: data.model,
        };
      }

      if (!isRetryable(response.status) || isLastAttempt) {
        const message = readServerMessage(
          await response.text().catch(() => ''),
          apiKey,
        );

        throw new Error(
          `Jev: HTTP ${response.status}${message ? `: ${message}` : ''}`,
        );
      }

      await sleep(500 * 2 ** attempt);
    }
  };
};
