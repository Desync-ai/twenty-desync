/** email, profile and openid permission can be called without the https://www.googleapis.com/auth/ prefix
 * see https://developers.google.com/identity/protocols/oauth2/scopes
 *
 * Scopes are conditional on which providers are enabled so a calendar-only or
 * contacts-only setup does NOT request Gmail's restricted scopes
 * (readonly/send/compose) — those would force a Google CASA security assessment.
 * calendar.events and the two contacts scopes are only SENSITIVE scopes
 * (standard brand verification, no CASA):
 *  - contacts.readonly         → the user's saved Google Contacts (address book)
 *  - contacts.other.readonly   → "Other contacts": people they've emailed with
 *                                but never saved, auto-collected by Google.
 *                                Lets us import people-from-email WITHOUT ever
 *                                touching the mailbox (no Gmail/restricted scope).
 */
export const getGoogleApisOauthScopes = (
  opts: { gmail?: boolean; calendar?: boolean; contacts?: boolean } = {
    gmail: true,
    calendar: true,
  },
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
  if (opts.contacts) {
    scopes.push(
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    );
  }

  return scopes;
};
