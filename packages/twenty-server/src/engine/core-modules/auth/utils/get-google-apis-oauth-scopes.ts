/** email, profile and openid permission can be called without the https://www.googleapis.com/auth/ prefix
 * see https://developers.google.com/identity/protocols/oauth2/scopes
 *
 * Scopes are conditional on which providers are enabled so a calendar-only setup
 * does NOT request Gmail's restricted scopes (readonly/send/compose) — those
 * would force a Google CASA security assessment. calendar.events is only a
 * SENSITIVE scope (standard verification, no CASA).
 */
export const getGoogleApisOauthScopes = (
  opts: { gmail?: boolean; calendar?: boolean } = { gmail: true, calendar: true },
) => {
  const scopes = ['email', 'profile', 'https://www.googleapis.com/auth/profile.emails.read'];

  if (opts.gmail) {
    scopes.push(
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
    );
  }
  if (opts.calendar) {
    scopes.push('https://www.googleapis.com/auth/calendar.events');
  }

  return scopes;
};
