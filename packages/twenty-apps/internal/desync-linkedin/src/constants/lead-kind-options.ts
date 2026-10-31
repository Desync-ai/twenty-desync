import { type SelectOptionMeta } from 'src/types/select-option-meta';

export const LEAD_KIND_OPTIONS: readonly SelectOptionMeta[] = [
  { key: 'icp', value: 'ICP', label: 'ICP', color: 'green', position: 0 },
  {
    key: 'person',
    value: 'PERSON',
    label: 'Person',
    color: 'blue',
    position: 1,
  },
  {
    key: 'notAPerson',
    value: 'NOT_A_PERSON',
    label: 'Not a person',
    color: 'gray',
    position: 2,
  },
  {
    key: 'undecided',
    value: 'UNDECIDED',
    label: 'Undecided',
    color: 'yellow',
    position: 3,
  },
];
