import test from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, redact } from "../lib/server/crypto";
test("AES GCM uses unique nonce and authenticates ciphertext", () => {
  process.env.APP_SECRET =
    "test-only-secret-with-at-least-thirty-two-characters";
  const secret = "test-only-credential";
  const a = encrypt(secret),
    b = encrypt(secret);
  assert.notEqual(a, b);
  assert.equal(decrypt(a), secret);
  const bytes = Buffer.from(a, "base64");
  bytes[20] ^= 1;
  assert.throws(() => decrypt(bytes.toString("base64")));
  assert.ok(
    !redact(
      "Authorization: Bearer credential API_KEY=secret sk-example",
    ).includes("sk-example"),
  );
  assert.equal(redact("my test-only-credential", [secret]), "my [REDACTED]");
});
