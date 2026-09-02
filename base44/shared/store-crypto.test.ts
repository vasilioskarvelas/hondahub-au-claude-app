/**
 * Honda Hub — store-crypto tests (ADR-046 Phase 1).
 *
 * Runtime: the Base44 backend is Deno, so these are Deno tests over the pure
 * helpers (the key is a parameter, so no `base44:runtime` import is needed).
 *
 *   Run:  deno test base44/shared/store-crypto.test.ts
 *
 * Covers: AES-256-GCM round-trip, fresh IV per encryption, wrong-key and
 * tampered-ciphertext rejection, plaintext rejection, key-rotation cache
 * correctness, and explicit key-configuration errors.
 */

import { encryptToken, decryptToken, isEncrypted } from "./store-crypto.ts";

// --- tiny dependency-free assert (keeps the file self-contained) --------------
function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
async function throws(fn: () => Promise<unknown>, match: string, msg?: string) {
  try {
    await fn();
  } catch (e) {
    const m = String((e as Error).message);
    if (!m.includes(match)) {
      throw new Error(`${msg || "wrong error"}: expected message containing ${JSON.stringify(match)}, got ${JSON.stringify(m)}`);
    }
    return;
  }
  throw new Error(`${msg || "expected a throw"}: none thrown`);
}

// Test-only keys. Deterministic and obviously fake — never reuse these anywhere.
// Each is a 32-char ASCII string, so base64 of it decodes to exactly 32 bytes.
const KEY_A = btoa("0123456789abcdef0123456789abcdef");
const KEY_B = btoa("ffffffffffffffffffffffffffffffff");

const SHOPIFY_TOKEN = "shpat_exampleaccesstoken0123456789";

Deno.test("encrypt/decrypt round-trips a Shopify access token", async () => {
  eq(await decryptToken(await encryptToken(SHOPIFY_TOKEN, KEY_A), KEY_A), SHOPIFY_TOKEN);
});

Deno.test("ciphertext is versioned, three-part, and detectable", async () => {
  const enc = await encryptToken(SHOPIFY_TOKEN, KEY_A);
  eq(enc.split(":").length, 3, "part count");
  eq(enc.split(":")[0], "v1", "version prefix");
  eq(isEncrypted(enc), true, "isEncrypted(ciphertext)");
  eq(isEncrypted(SHOPIFY_TOKEN), false, "isEncrypted(plaintext token)");
  eq(isEncrypted(null), false, "isEncrypted(null)");
  // The plaintext token must not appear anywhere in the stored envelope.
  eq(enc.includes(SHOPIFY_TOKEN), false, "plaintext leaked into ciphertext");
});

Deno.test("a fresh IV is used per encryption (same input, different ciphertext)", async () => {
  const a = await encryptToken(SHOPIFY_TOKEN, KEY_A);
  const b = await encryptToken(SHOPIFY_TOKEN, KEY_A);
  eq(a === b, false, "IV reuse would make these identical");
  eq(await decryptToken(a, KEY_A), await decryptToken(b, KEY_A), "both still decrypt");
});

Deno.test("a value encrypted under one key does not decrypt under another", async () => {
  const enc = await encryptToken(SHOPIFY_TOKEN, KEY_A);
  await throws(() => decryptToken(enc, KEY_B), "failed to decrypt", "wrong key must be rejected");
  // The rotation-aware cache must not serve KEY_B's key back for KEY_A.
  eq(await decryptToken(enc, KEY_A), SHOPIFY_TOKEN, "original key still works after a different key was used");
});

Deno.test("tampered ciphertext is rejected by the GCM tag", async () => {
  const [v, iv, ct] = (await encryptToken(SHOPIFY_TOKEN, KEY_A)).split(":");
  const flipped = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
  await throws(() => decryptToken(`${v}:${iv}:${flipped}`, KEY_A), "failed to decrypt", "tamper must be caught");
});

Deno.test("plaintext is never silently accepted by decryptToken", async () => {
  await throws(() => decryptToken(SHOPIFY_TOKEN, KEY_A), "not in the expected encrypted format");
});

Deno.test("key configuration errors are explicit", async () => {
  await throws(() => encryptToken(SHOPIFY_TOKEN, ""), "STORE_TOKEN_ENC_KEY not configured", "missing key");
  await throws(() => encryptToken(SHOPIFY_TOKEN, btoa("too-short")), "must decode to 32 bytes", "wrong key length");
});
