"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialFieldClassifier = void 0;
const PASSWORD_KEYWORDS = [
    'password', 'pass word', 'passcode', 'pass code', 'passphrase',
];
const EMAIL_KEYWORDS = ['email', 'e-mail', 'e mail'];
/**
 * Keywords that indicate a username / login-identity field.
 * Matched against the lowercased, trimmed step target string.
 */
const USERNAME_KEYWORDS = [
    'username', 'user name', 'user id', 'userid',
    'login id', 'loginid', 'login name', 'loginname',
    'account name', 'account id', 'accountid',
];
class CredentialFieldClassifier {
    /**
     * Returns the credential field type for the given step target string.
     *
     * @param target – The human-readable target from a test step, e.g. "Username",
     *                 "Password field", "Email address".
     */
    classify(target) {
        const normalized = target.toLowerCase().trim();
        // Password must be checked first so "password" does not accidentally match a
        // broader check that could also catch "passphrase → username" edge-cases.
        if (PASSWORD_KEYWORDS.some((kw) => normalized.includes(kw)))
            return 'password';
        if (EMAIL_KEYWORDS.some((kw) => normalized.includes(kw)))
            return 'email';
        if (USERNAME_KEYWORDS.some((kw) => normalized.includes(kw)))
            return 'username';
        return 'generic';
    }
}
exports.CredentialFieldClassifier = CredentialFieldClassifier;
