// Plain English, like the stream errors already persisted on the thread: these
// are stored on the turn and shown as-is to whoever opens the thread later.
export const AGENT_CHAT_TURN_ERROR_MESSAGES = {
  generic:
    'Something went wrong while generating a response. Please try again.',
  emptyResponse: 'The assistant returned an empty response. Please try again.',
  noReply: 'No response was received. Please try again.',
  creditsExhausted: 'Chat stopped: no more available credits.',
} as const;
