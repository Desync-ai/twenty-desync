import { describe, expect, it } from 'vitest';

import { readApolloPerson } from 'src/logic-functions/utils/read-apollo-person';

describe('readApolloPerson', () => {
  it.each([
    ['at the top', { person: { email: 'Ana@Acme.com', title: 'VP Sales' } }],
    [
      'under data',
      { data: { person: { email: 'ana@acme.com', title: 'VP Sales' } } },
    ],
    [
      'under response_data',
      {
        response_data: { person: { email: 'ana@acme.com', title: 'VP Sales' } },
      },
    ],
  ])('finds the person %s', (_where, data) => {
    expect(readApolloPerson(data)).toEqual({
      email: 'ana@acme.com',
      jobTitle: 'VP Sales',
    });
  });

  it('drops a locked placeholder email', () => {
    expect(
      readApolloPerson({
        person: { email: 'email_not_unlocked@domain.com', title: 'CTO' },
      }),
    ).toEqual({ jobTitle: 'CTO' });
  });

  it('is null when nothing usable came back', () => {
    expect(readApolloPerson({ person: null })).toBeNull();
    expect(readApolloPerson({ person: { email: null, title: '' } })).toBeNull();
    expect(readApolloPerson('nope')).toBeNull();
  });
});
