import { formatWithOptions } from "node:util";
const secrets = new Set<string>();
export function registerSecret(secret: string) {
  if (secret) secrets.add(secret);
}
export function redactLog(message: string) {
  let output = message
    .replace(
      /(authorization\s*["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\r\n"',}]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(api[_ -]?key\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[\w-]+/g, "[REDACTED]");
  for (const secret of secrets)
    output = output.split(secret).join("[REDACTED]");
  return output;
}
let installed = false;
export function installRedaction() {
  if (installed) return;
  installed = true;
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) =>
      original(
        redactLog(formatWithOptions({ colors: false, depth: 5 }, ...args)),
      );
  }
}
