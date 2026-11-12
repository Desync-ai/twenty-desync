// One error reply per turn (uuid v5 of the turn id), so the stream job and the
// stale turn sweeper can both write it without duplicating it.
export const AGENT_CHAT_TURN_ERROR_MESSAGE_ID_NAMESPACE =
  '26716008-c1aa-4acb-88ca-2f60867fdd63';
