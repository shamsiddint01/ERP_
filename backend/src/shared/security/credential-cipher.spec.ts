import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential } from './credential-cipher.js';

const KEY_A = 'a'.repeat(40);
const KEY_B = 'b'.repeat(40);

describe('credential cipher', () => {
  const original = process.env.CREDENTIALS_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_A;
  });
  afterEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  });

  it('round-trips a password and never stores it in plain form', () => {
    const stored = encryptCredential('Parol-2026!');
    expect(stored).not.toContain('Parol-2026!');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptCredential(stored)).toBe('Parol-2026!');
  });

  it('uses a fresh IV every time (same password → different ciphertext)', () => {
    expect(encryptCredential('same')).not.toBe(encryptCredential('same'));
  });

  it('returns null for a different key, a tampered value, a legacy plaintext value or nothing', () => {
    const stored = encryptCredential('secret123');
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_B;
    expect(decryptCredential(stored)).toBeNull();

    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_A;
    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(decryptCredential(parts.join(':'))).toBeNull();
    expect(decryptCredential('123456')).toBeNull();
    expect(decryptCredential(null)).toBeNull();
  });

  it('refuses to run with a missing or short key', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'short';
    expect(() => encryptCredential('x')).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });
});
