import { AgentChatTurnFailureService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-turn-failure.service';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';

type StaleTurnRow = {
  turnId: string;
  threadId: string;
  workspaceId: string;
  activeStreamId: string | null;
};

describe('AgentChatTurnFailureService.sweepStaleTurns', () => {
  const staleTurn: StaleTurnRow = {
    turnId: 'turn-id',
    threadId: 'thread-id',
    workspaceId: 'workspace-id',
    activeStreamId: null,
  };

  const buildService = ({
    staleTurns = [staleTurn],
    latestUserMessageTurnId = 'turn-id',
    reapedError = null as { code: string } | null,
    upsertRejection,
  }: {
    staleTurns?: StaleTurnRow[];
    latestUserMessageTurnId?: string;
    reapedError?: { code: string } | null;
    upsertRejection?: Error;
  } = {}) => {
    const queryBuilder: Record<string, jest.Mock> = {};

    for (const method of [
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'setParameters',
      'orderBy',
      'limit',
    ]) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany = jest.fn().mockResolvedValue(staleTurns);

    const allWorkspacesThreadRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const threadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const agentChatService = {
      upsertTurnErrorMessage: upsertRejection
        ? jest.fn().mockRejectedValue(upsertRejection)
        : jest.fn().mockResolvedValue(undefined),
      findLatestSentUserMessage: jest
        .fn()
        .mockResolvedValue({ turnId: latestUserMessageTurnId }),
    };
    const agentChatStreamingService = {
      reapDeadStream: jest.fn().mockResolvedValue(reapedError),
    };
    const eventPublisherService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const metricsService = { incrementCounterBy: jest.fn() };

    const service = new AgentChatTurnFailureService(
      allWorkspacesThreadRepository as never,
      threadRepository as never,
      agentChatService as never,
      agentChatStreamingService as never,
      eventPublisherService as never,
      metricsService as never,
    );

    return {
      service,
      threadRepository,
      agentChatService,
      agentChatStreamingService,
      eventPublisherService,
      metricsService,
    };
  };

  it('persists a no-reply error on a turn whose worker died before answering', async () => {
    const { service, agentChatService, metricsService, eventPublisherService } =
      buildService();

    await expect(service.sweepStaleTurns()).resolves.toBe(1);

    expect(agentChatService.upsertTurnErrorMessage).toHaveBeenCalledWith({
      threadId: 'thread-id',
      turnId: 'turn-id',
      workspaceId: 'workspace-id',
      turnError: {
        code: AiExceptionCode.STREAM_INTERRUPTED,
        message: 'No response was received. Please try again.',
      },
    });
    expect(metricsService.incrementCounterBy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ failure_phase: 'no_reply' }),
      }),
    );
    expect(eventPublisherService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-id' }),
    );
  });

  it('sets the thread error so the latest failed turn can be retried', async () => {
    const { service, threadRepository } = buildService();

    await service.sweepStaleTurns();

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      expect.objectContaining({ id: 'thread-id' }),
      {
        lastStreamError: expect.objectContaining({
          code: AiExceptionCode.STREAM_INTERRUPTED,
          message: 'No response was received. Please try again.',
        }),
      },
    );
  });

  it('leaves the thread error alone when a newer turn exists', async () => {
    const { service, agentChatService, threadRepository } = buildService({
      latestUserMessageTurnId: 'newer-turn-id',
    });

    await expect(service.sweepStaleTurns()).resolves.toBe(1);

    expect(agentChatService.upsertTurnErrorMessage).toHaveBeenCalled();
    expect(threadRepository.update).not.toHaveBeenCalled();
  });

  it('skips a turn whose stream is still alive', async () => {
    const { service, agentChatService, agentChatStreamingService } =
      buildService({
        staleTurns: [{ ...staleTurn, activeStreamId: 'stream-id' }],
        reapedError: null,
      });

    await expect(service.sweepStaleTurns()).resolves.toBe(0);

    expect(agentChatStreamingService.reapDeadStream).toHaveBeenCalledWith({
      thread: { id: 'thread-id', activeStreamId: 'stream-id' },
      workspaceId: 'workspace-id',
    });
    expect(agentChatService.upsertTurnErrorMessage).not.toHaveBeenCalled();
  });

  it('fails a turn whose stream died, without counting it twice', async () => {
    const { service, agentChatService, metricsService } = buildService({
      staleTurns: [{ ...staleTurn, activeStreamId: 'stream-id' }],
      reapedError: { code: AiExceptionCode.STREAM_INTERRUPTED },
    });

    await expect(service.sweepStaleTurns()).resolves.toBe(1);

    expect(agentChatService.upsertTurnErrorMessage).toHaveBeenCalled();
    expect(metricsService.incrementCounterBy).not.toHaveBeenCalled();
  });

  it('keeps sweeping the other turns when one fails', async () => {
    const { service, agentChatService } = buildService({
      staleTurns: [staleTurn, { ...staleTurn, turnId: 'other-turn-id' }],
    });

    agentChatService.upsertTurnErrorMessage
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);

    await expect(service.sweepStaleTurns()).resolves.toBe(1);

    expect(agentChatService.upsertTurnErrorMessage).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no turn is stale', async () => {
    const { service, agentChatService } = buildService({ staleTurns: [] });

    await expect(service.sweepStaleTurns()).resolves.toBe(0);

    expect(agentChatService.upsertTurnErrorMessage).not.toHaveBeenCalled();
  });
});
