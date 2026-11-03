import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { Pool } from 'pg';
import { isDefined } from 'twenty-shared/utils';

// Desync fork: read-only access to our own `desync_core` reference database
// (parishes, schools, hospitals) through its `compat` schema via the
// `core_reader` role — the same contract lead-gen and the web app already use.
// Connection is a single DSN read from the server/worker env (fork convention,
// NOT config-variables.ts), matching how Composio integrations are wired.
const CATHOLIC_DB_URL_ENV = 'CATHOLIC_DB_URL';

// Shared Neon serverless compute: keep the pool small and bound every query so a
// CRM agent can never stall the warehouse. The daily refresh runs ~09:30 UTC.
const POOL_MAX = 4;
// Client-side timer (not a server startup param), so it survives PgBouncer.
const QUERY_TIMEOUT_MS = 15_000;
const CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const CHURCH_COLUMNS = [
  'church_id',
  'church_name',
  'church_url',
  'street_address',
  'city',
  'state',
  'zip',
  'country',
  'diocese',
  'archdiocese',
  'deanery',
  'parish_status',
  'year_founded',
  'languages_offered',
  'has_affiliated_school',
  'live_stream_url',
  'online_giving_url',
  'bulletin_url',
];

const SCHOOL_COLUMNS = [
  'school_id',
  'school_name',
  'school_url',
  'address',
  'city',
  'state',
  'zip',
  'school_type',
  'school_level',
  'enrollment_total',
  'tuition_amount',
  'diocese',
  'religious_order',
  'grades_served',
  'operational_status',
  'ein',
];

const HOSPITAL_COLUMNS = [
  'hospital_id',
  'system_id',
  'name',
  'hospital_url',
  'street_address',
  'city',
  'state',
  'zip',
  'main_phone',
  'hospital_type',
  'licensed_beds',
  'catholic_sponsor',
  'diocese',
  'archdiocese',
];

type FilterMatch = 'contains' | 'ieq' | 'eq';

// A WHERE condition whose `column` is always a hard-coded identifier from the
// lists above — only `value` ever comes from the model, and it is bound, never
// interpolated.
type FilterSpec = {
  column: string;
  value: string | number | boolean;
  match: FilterMatch;
};

export type CatholicInstitutionsQueryResult = {
  source: string;
  note: string;
  limit: number;
  offset: number;
  count: number;
  rows: Record<string, unknown>[];
};

@Injectable()
export class CatholicInstitutionsService implements OnModuleDestroy {
  private readonly logger = new Logger(CatholicInstitutionsService.name);
  private pool: Pool | null = null;

  isConfigured(): boolean {
    return isNonEmptyString(process.env[CATHOLIC_DB_URL_ENV]);
  }

  async searchParishes(
    args: Record<string, unknown>,
  ): Promise<CatholicInstitutionsQueryResult> {
    const specs: FilterSpec[] = [];

    this.pushString(specs, 'church_name', args.search, 'contains');
    this.pushString(specs, 'city', args.city, 'contains');
    this.pushString(specs, 'state', args.state, 'ieq');
    this.pushString(specs, 'diocese', args.diocese, 'contains');
    this.pushString(specs, 'archdiocese', args.archdiocese, 'contains');
    this.pushString(specs, 'zip', args.zip, 'eq');
    this.pushString(specs, 'church_id', args.church_id, 'eq');
    this.pushBoolean(
      specs,
      'has_affiliated_school',
      args.has_affiliated_school,
    );

    return this.runSearch(
      'compat.churches',
      CHURCH_COLUMNS,
      'church_name',
      specs,
      args,
    );
  }

  async searchSchools(
    args: Record<string, unknown>,
  ): Promise<CatholicInstitutionsQueryResult> {
    const specs: FilterSpec[] = [];

    this.pushString(specs, 'school_name', args.search, 'contains');
    this.pushString(specs, 'city', args.city, 'contains');
    this.pushString(specs, 'state', args.state, 'ieq');
    this.pushString(specs, 'school_level', args.school_level, 'contains');
    this.pushString(specs, 'school_type', args.school_type, 'contains');
    this.pushString(specs, 'diocese', args.diocese, 'contains');
    this.pushString(specs, 'religious_order', args.religious_order, 'contains');
    this.pushString(specs, 'school_id', args.school_id, 'eq');

    return this.runSearch(
      'compat.school',
      SCHOOL_COLUMNS,
      'school_name',
      specs,
      args,
    );
  }

  async searchHospitals(
    args: Record<string, unknown>,
  ): Promise<CatholicInstitutionsQueryResult> {
    const specs: FilterSpec[] = [];

    this.pushString(specs, 'name', args.search, 'contains');
    this.pushString(specs, 'city', args.city, 'contains');
    this.pushString(specs, 'state', args.state, 'ieq');
    this.pushString(specs, 'diocese', args.diocese, 'contains');
    this.pushString(
      specs,
      'catholic_sponsor',
      args.catholic_sponsor,
      'contains',
    );
    this.pushString(specs, 'hospital_type', args.hospital_type, 'contains');
    this.pushString(specs, 'hospital_id', args.hospital_id, 'eq');
    this.pushString(specs, 'system_id', args.system_id, 'eq');

    return this.runSearch(
      'compat.hospitals',
      HOSPITAL_COLUMNS,
      'name',
      specs,
      args,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (isDefined(this.pool)) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async runSearch(
    view: string,
    columns: string[],
    orderByColumn: string,
    specs: FilterSpec[],
    args: Record<string, unknown>,
  ): Promise<CatholicInstitutionsQueryResult> {
    const limit = this.readLimit(args);
    const offset = this.readOffset(args);

    const params: (string | number | boolean)[] = [];
    const conditions = specs.map((spec) => {
      if (spec.match === 'contains') {
        params.push(`%${spec.value}%`);

        return `${spec.column} ILIKE $${params.length}`;
      }

      if (spec.match === 'ieq') {
        params.push(spec.value);

        return `${spec.column} ILIKE $${params.length}`;
      }

      params.push(spec.value);

      return `${spec.column} = $${params.length}`;
    });

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;

    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const sql = `SELECT ${columns.join(', ')} FROM ${view} ${whereClause} ORDER BY ${orderByColumn} ASC NULLS LAST LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;

    const rows = await this.query(sql, params);

    return {
      source: `desync_core.${view}`,
      note: "Desync's own Catholic institutions reference data (read-only).",
      limit,
      offset,
      count: rows.length,
      rows,
    };
  }

  private async query(
    sql: string,
    params: (string | number | boolean)[],
  ): Promise<Record<string, unknown>[]> {
    const pool = this.getPool();

    try {
      const result = await pool.query<Record<string, unknown>>(sql, params);

      return result.rows;
    } catch (error) {
      this.logger.error(
        `Catholic institutions query failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw error;
    }
  }

  private getPool(): Pool {
    const connectionString = process.env[CATHOLIC_DB_URL_ENV];

    if (!isNonEmptyString(connectionString)) {
      throw new Error(`${CATHOLIC_DB_URL_ENV} is not set`);
    }

    if (!isDefined(this.pool)) {
      this.pool = new Pool({
        connectionString,
        max: POOL_MAX,
        // query_timeout is a client-side timer and connectionTimeout fails fast
        // on a bad DSN. We avoid statement_timeout / `options` startup params
        // because Neon's PgBouncer pooled endpoint rejects them; writes are
        // already refused by the read-only `core_reader` role.
        query_timeout: QUERY_TIMEOUT_MS,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        application_name: 'twenty-crm-catholic-institutions',
        // Neon's pooled endpoint terminates TLS; the container trust store does
        // not always carry its CA, and this reads non-PII reference data only.
        ssl: { rejectUnauthorized: false },
      });
    }

    return this.pool;
  }

  private pushString(
    specs: FilterSpec[],
    column: string,
    value: unknown,
    match: FilterMatch,
  ): void {
    if (isNonEmptyString(value)) {
      specs.push({ column, value: value.trim(), match });
    }
  }

  private pushBoolean(
    specs: FilterSpec[],
    column: string,
    value: unknown,
  ): void {
    if (value === true || value === false) {
      specs.push({ column, value, match: 'eq' });

      return;
    }

    if (value === 'true' || value === 'false') {
      specs.push({ column, value: value === 'true', match: 'eq' });
    }
  }

  private readLimit(args: Record<string, unknown>): number {
    const raw = Number(args.limit);

    if (!Number.isFinite(raw)) {
      return DEFAULT_LIMIT;
    }

    return Math.min(Math.max(1, Math.trunc(raw)), MAX_LIMIT);
  }

  private readOffset(args: Record<string, unknown>): number {
    const raw = Number(args.offset);

    if (!Number.isFinite(raw) || raw < 0) {
      return 0;
    }

    return Math.trunc(raw);
  }
}
