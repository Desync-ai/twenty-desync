import { type JevReply } from 'src/types/jev';

export type LeadKind = 'ICP' | 'PERSON' | 'NOT_A_PERSON' | 'UNDECIDED';

export type LeadDecision = { kind: LeadKind; score: number | null };

// The extension's bars (lib/classify.ts CLASSIFY_BARS), kept equal so a lead
// reads the same whichever side classified it.
export const LEAD_BARS = {
  person: { yes: 0.8, no: 0.2 },
  icp: { yes: 0.8 },
} as const;

const round3 = (value: number) => Math.round(value * 1000) / 1000;

const readNoul = (reply: JevReply, name: string): number => {
  const answer = reply.answers[name];
  const value = answer?.type === 'noul' ? answer.noul : Number.NaN;

  if (!(value >= 0 && value <= 1)) {
    throw new Error(`Jev's reply has no ${name} answer.`);
  }

  return value;
};

// The score is the probability of the kind written: P(person), 1 - P(person),
// or the lower of P(person) and P(fit) for ICP; empty while undecided.
export const decideLeadKind = (
  reply: JevReply,
  wasIcpAsked: boolean,
): LeadDecision => {
  const personProbability = readNoul(reply, 'person');

  if (personProbability <= LEAD_BARS.person.no) {
    return { kind: 'NOT_A_PERSON', score: round3(1 - personProbability) };
  }

  if (personProbability < LEAD_BARS.person.yes) {
    return { kind: 'UNDECIDED', score: null };
  }

  if (!wasIcpAsked) {
    return { kind: 'PERSON', score: round3(personProbability) };
  }

  const fitProbability = readNoul(reply, 'icp');

  return fitProbability >= LEAD_BARS.icp.yes
    ? {
        kind: 'ICP',
        score: round3(Math.min(personProbability, fitProbability)),
      }
    : { kind: 'PERSON', score: round3(personProbability) };
};
