import { describe, expect, it } from 'vitest';

import { decideLeadKind } from 'src/logic-functions/utils/decide-lead-kind';
import { type JevReply } from 'src/types/jev';

const reply = (answers: Record<string, number>): JevReply => ({
  model: 'jev-1.13.0',
  answers: Object.fromEntries(
    Object.entries(answers).map(([name, noul]) => [
      name,
      { type: 'noul', noul },
    ]),
  ),
});

describe('decideLeadKind', () => {
  it.each([
    [{ person: 0.1 }, false, { kind: 'NOT_A_PERSON', score: 0.9 }],
    [{ person: 0.5 }, false, { kind: 'UNDECIDED', score: null }],
    [{ person: 0.9 }, false, { kind: 'PERSON', score: 0.9 }],
    [{ person: 0.95, icp: 0.85 }, true, { kind: 'ICP', score: 0.85 }],
    [{ person: 0.95, icp: 0.4 }, true, { kind: 'PERSON', score: 0.95 }],
  ])('reads %j (icp asked: %s)', (answers, wasIcpAsked, expected) => {
    expect(decideLeadKind(reply(answers), wasIcpAsked)).toEqual(expected);
  });

  it('refuses a reply without the asked answer', () => {
    expect(() => decideLeadKind(reply({ person: 0.95 }), true)).toThrow(/icp/);
  });
});
