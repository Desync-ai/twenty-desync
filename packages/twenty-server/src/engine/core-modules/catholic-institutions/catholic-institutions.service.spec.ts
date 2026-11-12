import { Pool } from 'pg';

import { CatholicInstitutionsService } from 'src/engine/core-modules/catholic-institutions/catholic-institutions.service';

jest.mock('pg');

const mockQuery = jest.fn();

(Pool as unknown as jest.Mock).mockImplementation(() => ({
  query: mockQuery,
  end: jest.fn(),
}));

describe('CatholicInstitutionsService', () => {
  let service: CatholicInstitutionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    process.env.CATHOLIC_DB_URL = 'postgres://core_reader@host/desync_core';
    service = new CatholicInstitutionsService();
  });

  afterEach(() => {
    delete process.env.CATHOLIC_DB_URL;
  });

  const lastSql = (): string => mockQuery.mock.calls[0][0] as string;
  const lastParams = (): unknown[] => mockQuery.mock.calls[0][1] as unknown[];

  it('reports configured only when the DSN env is set', () => {
    expect(service.isConfigured()).toBe(true);

    delete process.env.CATHOLIC_DB_URL;

    expect(service.isConfigured()).toBe(false);
  });

  it('binds every filter value as a parameter and never interpolates it', async () => {
    await service.searchParishes({
      search: "St. Joseph'; DROP TABLE churches;--",
      city: 'South Bend',
      state: 'IN',
      limit: 5,
      offset: 10,
    });

    const sql = lastSql();

    expect(sql).toContain('FROM compat.churches');
    expect(sql).toContain('church_name ILIKE $1');
    expect(sql).toContain('city ILIKE $2');
    expect(sql).toContain('state ILIKE $3');
    expect(sql).toContain('LIMIT $4 OFFSET $5');
    // The raw value is bound, not spliced into the SQL text.
    expect(sql).not.toContain('DROP TABLE');
    expect(lastParams()).toEqual([
      "%St. Joseph'; DROP TABLE churches;--%",
      '%South Bend%',
      'IN',
      5,
      10,
    ]);
  });

  it('omits the WHERE clause and uses default paging when no filters are given', async () => {
    await service.searchParishes({});

    expect(lastSql()).not.toContain('WHERE');
    expect(lastParams()).toEqual([25, 0]);
  });

  it('clamps the limit to the 1..100 range and floors a negative offset', async () => {
    await service.searchParishes({ limit: 500, offset: -4 });

    expect(lastParams()).toEqual([100, 0]);
  });

  it('coerces a string boolean filter to a bound boolean', async () => {
    await service.searchParishes({ has_affiliated_school: 'true' });

    expect(lastSql()).toContain('has_affiliated_school = $1');
    expect(lastParams()).toEqual([true, 25, 0]);
  });

  it('queries the right view for schools and hospitals', async () => {
    await service.searchSchools({ search: 'Notre Dame' });
    expect(lastSql()).toContain('FROM compat.school');
    expect(lastSql()).toContain('school_name ILIKE $1');

    mockQuery.mockClear();

    await service.searchHospitals({ search: 'Mercy' });
    expect(lastSql()).toContain('FROM compat.hospitals');
    expect(lastSql()).toContain('name ILIKE $1');
  });

  it('returns a structured result with the source view and row count', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ church_id: '1' }] });

    const result = await service.searchParishes({ search: 'St. Mary' });

    expect(result.source).toBe('desync_core.compat.churches');
    expect(result.count).toBe(1);
    expect(result.rows).toEqual([{ church_id: '1' }]);
  });
});
