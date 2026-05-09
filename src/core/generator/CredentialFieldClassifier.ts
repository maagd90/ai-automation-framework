/**
 * Classifies an input step target into a semantic credential field type.
 *
 * This drives two responsibilities in {@link SpecGenerator}:
 *  1. {@link buildTestData} – which key in the test-data JSON receives the step value.
 *  2. {@link resolveDataReference} – which data-access expression is emitted in the spec.
 *
 * Classification order matters: `password` is checked before generic terms so that
 * a target like "confirm password" does not fall through to `generic`.
 */
export type CredentialFieldType = 'username' | 'email' | 'password' | 'generic';

const PASSWORD_KEYWORDS: ReadonlyArray<string> = [
  'password', 'pass word', 'passcode', 'pass code', 'passphrase',
];

const EMAIL_KEYWORDS: ReadonlyArray<string> = ['email', 'e-mail', 'e mail'];

/**
 * Keywords that indicate a username / login-identity field.
 * Matched against the lowercased, trimmed step target string.
 */
const USERNAME_KEYWORDS: ReadonlyArray<string> = [
  'username', 'user name', 'user id', 'userid',
  'login id', 'loginid', 'login name', 'loginname',
  'account name', 'account id', 'accountid',
];

export class CredentialFieldClassifier {
  /**
   * Returns the credential field type for the given step target string.
   *
   * @param target – The human-readable target from a test step, e.g. "Username",
   *                 "Password field", "Email address".
   */
  classify(target: string): CredentialFieldType {
    const normalized = target.toLowerCase().trim();

    // Password must be checked first so "password" does not accidentally match a
    // broader check that could also catch "passphrase → username" edge-cases.
    if (PASSWORD_KEYWORDS.some((kw) => normalized.includes(kw))) return 'password';
    if (EMAIL_KEYWORDS.some((kw) => normalized.includes(kw))) return 'email';
    if (USERNAME_KEYWORDS.some((kw) => normalized.includes(kw))) return 'username';

    return 'generic';
  }
}
