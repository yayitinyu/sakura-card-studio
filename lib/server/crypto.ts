import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registerSecret } from "./logging";
export function encryptionKey() {
  let secret = process.env.APP_SECRET;
  if (!secret) {
    const dir = path.dirname(
      (process.env.DATABASE_URL ?? "file:./data/app.db").replace(/^file:/, ""),
    );
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, ".app-secret");
    if (!existsSync(file)) {
      try {
        writeFileSync(file, randomBytes(48).toString("hex"), {
          mode: 0o600,
          flag: "wx",
        });
      } catch (e) {
        if (!existsSync(file)) throw e;
      }
    }
    secret = readFileSync(file, "utf8");
  }
  if (secret.length < 32)
    throw new Error("APP_SECRET must contain at least 32 characters");
  return scryptSync(secret, "sakura-card-studio.credentials.v1", 32);
}
export function encrypt(secret: string) {
  registerSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    b.subarray(0, 12),
  );
  cipher.setAuthTag(b.subarray(12, 28));
  const plain = Buffer.concat([
    cipher.update(b.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
  registerSecret(plain);
  return plain;
}
export const mask = (value: string) =>
  value ? "••••••••" + (value.length > 8 ? value.slice(-4) : "") : "";
export function redact(value: string, secrets: string[] = []) {
  let out = value
    .replace(
      /(authorization|api[_ -]?key|bearer)[\s"':=]+[^\s,}\n]+/gi,
      "$1 [REDACTED]",
    )
    .replace(/sk-[\w-]+/g, "[REDACTED]");
  for (const secret of secrets)
    if (secret) out = out.split(secret).join("[REDACTED]");
  return out;
}
