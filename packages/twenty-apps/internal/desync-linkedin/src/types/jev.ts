export type JevNoulQuestion = {
  type: 'noul';
  instructions: unknown;
  criteria?: { true: string; false: string };
};

export type JevSpec = {
  state: unknown;
  questions: Record<string, JevNoulQuestion>;
};

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> };

export type JevReply = {
  answers: Record<string, JevAnswer>;
  model: string;
};

export type AskJev = (spec: JevSpec) => Promise<JevReply>;
