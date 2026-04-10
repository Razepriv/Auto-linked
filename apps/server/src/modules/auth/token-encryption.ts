import type { webcrypto } from 'node:crypto';
import { config } from '../../lib/config.js';

/**
 * AES-256-GCM token encryption using Web Crypto API (available in Node 22+).
 *
 * The encryption key is derived from the OAUTH_ENCRYPTION_KEY env var,
 * which should be a 64-character hex string (32 bytes).
 *
 * Each encryption produces a unique IV and auth tag, so the same plaintext
 * encrypted twice will produce different ciphertexts.
 *
 * Storage format: base64(iv + authTag + ciphertext)
 * - iv: 12 bytes
 * - authTag: 16 bytes
 * - ciphertext: variable length
 */

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'AES-GCM';

let cachedKey: webcrypto.CryptoKey | null = null;

async function getEncryptionKey(): Promise<webcrypto.CryptoKey> {
  if (cachedKey !== null) {
    return cachedKey;
  }

  const keyHex = config.OAUTH_ENCRYPTION_KEY;
  const keyBytes = hexToBytes(keyHex.slice(0, 64)); // Take first 32 bytes (64 hex chars)

  if (keyBytes.length < 32) {
    throw new Error(
      `OAUTH_ENCRYPTION_KEY must be at least 64 hex characters (32 bytes). Got ${keyBytes.length} bytes.`,
    );
  }

  cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.slice(0, 32),
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'],
  );

  return cachedKey;
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/\s/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const hexByte = cleanHex.slice(i * 2, i * 2 + 2);
    const parsed = parseInt(hexByte, 16);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid hex character at position ${i * 2}: "${hexByte}"`);
    }
    bytes[i] = parsed;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Encrypt a plaintext token string.
 * Returns a base64-encoded string containing iv + authTag + ciphertext.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: AUTH_TAG_LENGTH * 8, // bits
    },
    key,
    data,
  );

  // Web Crypto API appends the auth tag to the ciphertext
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - AUTH_TAG_LENGTH);
  const authTag = encryptedBytes.slice(encryptedBytes.length - AUTH_TAG_LENGTH);

  // Pack: iv (12) + authTag (16) + ciphertext (variable)
  const packed = new Uint8Array(IV_LENGTH + AUTH_TAG_LENGTH + ciphertext.length);
  packed.set(iv, 0);
  packed.set(authTag, IV_LENGTH);
  packed.set(ciphertext, IV_LENGTH + AUTH_TAG_LENGTH);

  return bytesToBase64(packed);
}

/**
 * Decrypt a base64-encoded encrypted token string.
 * Expects the format produced by encryptToken().
 */
export async function decryptToken(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const packed = base64ToBytes(encrypted);

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted token: too short');
  }

  const iv = packed.slice(0, IV_LENGTH);
  const authTag = packed.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  // Web Crypto API expects ciphertext + authTag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertext.length + AUTH_TAG_LENGTH);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: AUTH_TAG_LENGTH * 8,
    },
    key,
    ciphertextWithTag,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Clear the cached encryption key (useful for testing or key rotation).
 */
export function clearKeyCache(): void {
  cachedKey = null;
}
