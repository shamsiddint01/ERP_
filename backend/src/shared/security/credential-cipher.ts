import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Reversible encryption for the one secret this app deliberately keeps
 * readable: the password a staff member last set for a login, so an admin can
 * look it up (User.temporaryPassword). AES-256-GCM, so a tampered value fails
 * to decrypt instead of returning garbage.
 *
 * The key comes from CREDENTIALS_ENCRYPTION_KEY (any long random string; it is
 * hashed to 32 bytes). Keep it out of the database and its backups — with only
 * a DB dump the stored values stay unreadable. Changing the key makes every
 * stored password unreadable (admins then set new ones).
 */
const PREFIX = 'v1';

function key(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be set to a random string of at least 32 characters');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptCredential(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

/** null when there is nothing stored, the value is not in our format (e.g. a legacy plaintext value) or the key no longer matches. */
export function decryptCredential(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [prefix, iv, tag, ciphertext] = stored.split(':');
  if (prefix !== PREFIX || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
