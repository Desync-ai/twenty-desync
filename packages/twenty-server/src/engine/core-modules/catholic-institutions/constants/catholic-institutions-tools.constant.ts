export const SEARCH_CATHOLIC_PARISHES_TOOL_NAME = 'search_catholic_parishes';
export const SEARCH_CATHOLIC_SCHOOLS_TOOL_NAME = 'search_catholic_schools';
export const SEARCH_CATHOLIC_HOSPITALS_TOOL_NAME = 'search_catholic_hospitals';

type CatholicInstitutionsToolSpec = {
  name: string;
  label: string;
  description: string;
  inputSchema: object;
};

const PAGINATION_PROPERTIES = {
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 25,
    description: 'Maximum rows to return (max 100).',
  },
  offset: {
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Rows to skip, for paging.',
  },
};

// Fixed catalog of read-only search tools over Desync's own Catholic
// institutions reference data (the `compat` views of `desync_core`). Each tool
// maps 1:1 to a CatholicInstitutionsService method; names are the executionRef
// toolIds the provider dispatches on.
export const CATHOLIC_INSTITUTIONS_TOOL_SPECS: CatholicInstitutionsToolSpec[] =
  [
    {
      name: SEARCH_CATHOLIC_PARISHES_TOOL_NAME,
      label: 'Search Catholic parishes',
      description:
        "Search Desync's own reference data of Catholic parishes/churches (read-only). Filter by name, city, state, diocese, archdiocese or ZIP. Returns parish name, website, address, diocese, status and bulletin/giving/livestream links.",
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Case-insensitive match on the parish/church name.',
          },
          city: { type: 'string', description: 'Case-insensitive city match.' },
          state: {
            type: 'string',
            description: 'Two-letter state code (e.g. "IN") or state name.',
          },
          diocese: {
            type: 'string',
            description: 'Case-insensitive diocese match.',
          },
          archdiocese: {
            type: 'string',
            description: 'Case-insensitive archdiocese match.',
          },
          zip: { type: 'string', description: 'Exact ZIP code.' },
          church_id: {
            type: 'string',
            description: 'Exact parish id, when already known.',
          },
          has_affiliated_school: {
            type: 'boolean',
            description:
              'Only parishes with (or without) an affiliated school.',
          },
          ...PAGINATION_PROPERTIES,
        },
        additionalProperties: false,
      },
    },
    {
      name: SEARCH_CATHOLIC_SCHOOLS_TOOL_NAME,
      label: 'Search Catholic schools',
      description:
        "Search Desync's own reference data of Catholic schools (read-only) — includes colleges/universities and seminaries via school_level. Filter by name, city, state, level, type, diocese or religious order. Returns name, website, address, level/type, enrollment, tuition and operational status.",
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Case-insensitive match on the school name.',
          },
          city: { type: 'string', description: 'Case-insensitive city match.' },
          state: {
            type: 'string',
            description: 'Two-letter state code (e.g. "IN") or state name.',
          },
          school_level: {
            type: 'string',
            description:
              'Case-insensitive level match, e.g. "College/University" or "Seminary".',
          },
          school_type: {
            type: 'string',
            description: 'Case-insensitive school-type match.',
          },
          diocese: {
            type: 'string',
            description: 'Case-insensitive diocese match.',
          },
          religious_order: {
            type: 'string',
            description: 'Case-insensitive religious-order match.',
          },
          school_id: {
            type: 'string',
            description: 'Exact school id, when already known.',
          },
          ...PAGINATION_PROPERTIES,
        },
        additionalProperties: false,
      },
    },
    {
      name: SEARCH_CATHOLIC_HOSPITALS_TOOL_NAME,
      label: 'Search Catholic hospitals',
      description:
        "Search Desync's own reference data of Catholic hospitals (read-only). Filter by name, city, state, diocese, Catholic sponsor or hospital type. Returns name, website, address, phone, type, licensed beds, Catholic sponsor and diocese.",
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Case-insensitive match on the hospital name.',
          },
          city: { type: 'string', description: 'Case-insensitive city match.' },
          state: {
            type: 'string',
            description: 'Two-letter state code (e.g. "IN") or state name.',
          },
          diocese: {
            type: 'string',
            description: 'Case-insensitive diocese match.',
          },
          catholic_sponsor: {
            type: 'string',
            description:
              'Case-insensitive match on the sponsoring Catholic organization.',
          },
          hospital_type: {
            type: 'string',
            description: 'Case-insensitive hospital-type match.',
          },
          hospital_id: {
            type: 'string',
            description: 'Exact hospital id, when already known.',
          },
          system_id: {
            type: 'string',
            description:
              'Exact hospital-system id to list a system’s hospitals.',
          },
          ...PAGINATION_PROPERTIES,
        },
        additionalProperties: false,
      },
    },
  ];
