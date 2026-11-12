import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

import { type AgentMessagePartEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-message-part.entity';
import { mapDBPartToUIMessagePart } from 'src/engine/metadata-modules/ai/ai-agent-execution/utils/mapDBPartToUIMessagePart';
import { mapUIMessagePartsToDBParts } from 'src/engine/metadata-modules/ai/ai-agent-execution/utils/mapUIMessagePartsToDBParts';

describe('AgentMessagePart mappers — turn error parts', () => {
  const turnErrorPart = {
    type: 'data-turn-error',
    data: { code: 'STREAM_INTERRUPTED', message: 'No response was received.' },
  } as ExtendedUIMessagePart;

  it('stores the code and message of a turn error', () => {
    const [row] = mapUIMessagePartsToDBParts(
      [turnErrorPart],
      'message-1',
      'workspace-1',
    );

    expect(row).toMatchObject({
      type: 'data-turn-error',
      state: 'STREAM_INTERRUPTED',
      textContent: 'No response was received.',
    });
  });

  it('never sends a turn error back to the model', () => {
    const [row] = mapUIMessagePartsToDBParts(
      [turnErrorPart],
      'message-1',
      'workspace-1',
    );

    expect(
      mapDBPartToUIMessagePart(row as unknown as AgentMessagePartEntity),
    ).toBeNull();
  });
});
