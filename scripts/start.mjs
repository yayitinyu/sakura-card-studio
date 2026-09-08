import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd();
if (!existsSync(".next/standalone/server.js"))
  throw new Error("Run npm run build before npm start.");
mkdirSync(".next/standalone/.next", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
process.env.DATABASE_URL =
  "file:" +
  path.resolve(
    root,
    (process.env.DATABASE_URL ?? "file:./data/app.db").replace(/^file:/, ""),
  );
process.env.HOSTNAME = process.env.APP_HOST ?? "127.0.0.1";
process.env.NEXT_TELEMETRY_DISABLED = "1";
await import(pathToFileURL(path.join(root, ".next/standalone/server.js")).href);
