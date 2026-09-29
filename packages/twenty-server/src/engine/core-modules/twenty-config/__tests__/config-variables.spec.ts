import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';

// Scoped to the ONTOLOGY_CONSOLE_URL property alone (skipMissingProperties +
// filtering errors by property) so this doesn't couple to every other
// required config variable elsewhere in the class.
const getOntologyConsoleUrlErrors = (value: unknown) => {
  const instance = plainToClass(ConfigVariables, {
    ONTOLOGY_CONSOLE_URL: value,
  });

  return validateSync(instance, { skipMissingProperties: true }).filter(
    (error) => error.property === 'ONTOLOGY_CONSOLE_URL',
  );
};

describe('ConfigVariables ONTOLOGY_CONSOLE_URL', () => {
  it('is not required', () => {
    expect(getOntologyConsoleUrlErrors(undefined)).toEqual([]);
  });

  it.each([
    'https://console.example.com',
    'http://127.0.0.1:8791',
    'http://localhost:8791/x',
  ])('accepts %s', (value) => {
    expect(getOntologyConsoleUrlErrors(value)).toEqual([]);
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com',
    'ftp://x',
    'garbage',
    '',
  ])('rejects %s', (value) => {
    expect(getOntologyConsoleUrlErrors(value)).not.toEqual([]);
  });
});
