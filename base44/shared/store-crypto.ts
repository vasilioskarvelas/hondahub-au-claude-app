/**
 * Honda Hub — store credential encryption at rest (ADR-046 Phase 1).
 *
 * BusinessStoreConnection documents its credential fields as "AES-GCM
 * CIPHERTEXT (encrypted with the STORE_TOKEN_ENC_KEY app secret)". This module
 * is that encryption. Applies to `shopify_access_token` and, in Section 3, the
 * WooCommerce consumer key/secret.
 *
 * Stored format: "v1:<base64 iv>:<base64 ciphertext+tag>". The version prefix
 * exists so a future key rotation can decrypt old values while writing new ones.
 *
 * The key is PASSED IN rather than read from `base44:runtime` here, so these
 * functions stay pure and unit-testable (see store-crypto.test.ts). Callers do
 * `secrets.get("STORE_TOKEN_ENC_KEY")` and pass the result.
 *
 * The secret is 32 raw bytes, base64-encoded — generate with
 *   openssl rand -base64 32
 * and set it in the Base44 app secrets. Never commit or log it.
 */

const VERSION = "v1";

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// Cached per isolate, keyed on the secret itself so a rotated STORE_TOKEN_ENC_KEY
// is picked up rather than serving a stale key for the life of the isolate.
let cached: { raw: string | null; key: CryptoKey | null } = { raw: null, key: null };

async function importKey(rawKey: string): Promise<CryptoKey> {
  if (!rawKey) throw new Error("STORE_TOKEN_ENC_KEY not configured");
  if (cached.raw === rawKey && cached.key) return cached.key;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = b64decode(rawKey.trim());
  } catch {
    throw new Error("STORE_TOKEN_ENC_KEY is not valid base64");
  }
  if (bytes.length !== 32) {
    throw new Error(`STORE_TOKEN_ENC_KEY must decode to 32 bytes, got ${bytes.length}`);
  }
  const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  cached = { raw: rawKey, key };
  return key;
}

/** True when a stored value is in the encrypted envelope format. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

/** Encrypt a plaintext credential for storage. Never store the raw value. */
export async function encryptToken(plaintext: string, rawKey: string): Promise<string> {
  if (!plaintext) throw new Error("nothing to encrypt");
  const key = await importKey(rawKey);
  // 96-bit IV is the AES-GCM standard; generated fresh per encryption, never reused.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${VERSION}:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

/**
 * Decrypt a stored credential. Deliberately strict: a plaintext value is
 * rejected rather than passed through, so a storage regression surfaces as a
 * loud failure instead of silently reintroducing plaintext credentials.
 */
export async function decryptToken(stored: string, rawKey: string): Promise<string> {
  if (!stored) throw new Error("nothing to decrypt");
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("stored credential is not in the expected encrypted format");
  }
  const key = await importKey(rawKey);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(parts[1]) },
      key,
      b64decode(parts[2]),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // GCM tag mismatch: wrong key, or the ciphertext was tampered with.
    throw new Error("failed to decrypt stored credential (wrong STORE_TOKEN_ENC_KEY or corrupt value)");
  }
}
