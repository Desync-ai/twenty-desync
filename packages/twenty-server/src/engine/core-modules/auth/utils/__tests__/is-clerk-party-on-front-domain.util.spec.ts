import {
  isClerkPartyOnFrontDomain,
  parseClerkAuthorizedParty,
} from 'src/engine/core-modules/auth/utils/is-clerk-party-on-front-domain.util';

describe('parseClerkAuthorizedParty', () => {
  it('should parse a bare origin', () => {
    expect(
      parseClerkAuthorizedParty('https://app.crm.example.com')?.hostname,
    ).toBe('app.crm.example.com');
  });

  it.each([
    undefined,
    null,
    '',
    42,
    'not a url',
    'https://app.crm.example.com/',
    'https://app.crm.example.com/path',
    'https://app.crm.example.com?x=1',
    'https://user@app.crm.example.com',
  ])('should reject %p', (azp) => {
    expect(parseClerkAuthorizedParty(azp)).toBeNull();
  });
});

describe('isClerkPartyOnFrontDomain', () => {
  const frontUrl = new URL('https://crm.example.com');

  const check = (azp: string, front = frontUrl) => {
    const party = parseClerkAuthorizedParty(azp);

    return party !== null && isClerkPartyOnFrontDomain(party, front);
  };

  it.each([
    'https://crm.example.com',
    'https://app.crm.example.com',
    'https://acme-co.crm.example.com',
  ])('should accept %s', (azp) => {
    expect(check(azp)).toBe(true);
  });

  it.each([
    'https://evilcrm.example.com',
    'https://example.com',
    'https://app.example.com',
    'https://a.b.crm.example.com',
    'https://crm.example.com.evil.com',
    'http://app.crm.example.com',
    'https://app.crm.example.com:8443',
    'https://app_x.crm.example.com',
  ])('should reject %s', (azp) => {
    expect(check(azp)).toBe(false);
  });

  it('should match the protocol and port of a local front', () => {
    const localFront = new URL('http://localhost:3001');

    expect(check('http://localhost:3001', localFront)).toBe(true);
    expect(check('http://apple.localhost:3001', localFront)).toBe(true);
    expect(check('http://localhost:3000', localFront)).toBe(false);
  });
});
