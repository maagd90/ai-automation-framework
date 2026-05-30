import { describe, expect, it } from 'vitest';
import { CredentialFieldClassifier } from '../../src/core/generator/CredentialFieldClassifier';

describe('CredentialFieldClassifier', () => {
  const classifier = new CredentialFieldClassifier();

  // ── Username targets ────────────────────────────────────────────────────────

  it('classifies "username" as username', () => {
    expect(classifier.classify('username')).toBe('username');
  });

  it('classifies "Username" (PascalCase) as username', () => {
    expect(classifier.classify('Username')).toBe('username');
  });

  it('classifies "user name" as username', () => {
    expect(classifier.classify('user name')).toBe('username');
  });

  it('classifies "User Name" as username', () => {
    expect(classifier.classify('User Name')).toBe('username');
  });

  it('classifies "user id" as username', () => {
    expect(classifier.classify('user id')).toBe('username');
  });

  it('classifies "userid" as username', () => {
    expect(classifier.classify('userid')).toBe('username');
  });

  it('classifies "login id" as username', () => {
    expect(classifier.classify('login id')).toBe('username');
  });

  it('classifies "login name" as username', () => {
    expect(classifier.classify('login name')).toBe('username');
  });

  it('classifies "account name" as username', () => {
    expect(classifier.classify('account name')).toBe('username');
  });

  // ── Email targets ────────────────────────────────────────────────────────────

  it('classifies "email" as email', () => {
    expect(classifier.classify('email')).toBe('email');
  });

  it('classifies "Email address" as email', () => {
    expect(classifier.classify('Email address')).toBe('email');
  });

  it('classifies "e-mail" as email', () => {
    expect(classifier.classify('e-mail')).toBe('email');
  });

  // ── Password targets ─────────────────────────────────────────────────────────

  it('classifies "password" as password', () => {
    expect(classifier.classify('password')).toBe('password');
  });

  it('classifies "Password" as password', () => {
    expect(classifier.classify('Password')).toBe('password');
  });

  it('classifies "confirm password" as password', () => {
    expect(classifier.classify('confirm password')).toBe('password');
  });

  it('classifies "passcode" as password', () => {
    expect(classifier.classify('passcode')).toBe('password');
  });

  // ── Generic targets ──────────────────────────────────────────────────────────

  it('classifies "search" as generic', () => {
    expect(classifier.classify('search')).toBe('generic');
  });

  it('classifies "first name" as generic', () => {
    expect(classifier.classify('first name')).toBe('generic');
  });

  it('classifies "phone number" as generic', () => {
    expect(classifier.classify('phone number')).toBe('generic');
  });

  it('classifies empty string as generic', () => {
    expect(classifier.classify('')).toBe('generic');
  });

  // ── Priority: password is checked before email and username ─────────────────

  it('classifies a target containing both "password" and "user" as password', () => {
    // e.g. "user password confirmation" — password takes precedence
    expect(classifier.classify('user password confirmation')).toBe('password');
  });
});
