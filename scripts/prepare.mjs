import { mkdirSync } from "node:fs";
import { build } from "esbuild";
mkdirSync("public/editor", { recursive: true });
// Build from ESM so security overrides also reach the shipped browser code.
await build({
  entryPoints: ["scripts/monaco-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "SakuraMonaco",
  outfile: "public/editor/monaco.js",
  loader: { ".ttf": "file" },
  logLevel: "warning",
});
await build({
  entryPoints: {
    "editor.worker":
      "node_modules/monaco-editor/esm/vs/editor/editor.worker.js",
    "json.worker":
      "node_modules/monaco-editor/esm/vs/language/json/json.worker.js",
    "css.worker":
      "node_modules/monaco-editor/esm/vs/language/css/css.worker.js",
    "html.worker":
      "node_modules/monaco-editor/esm/vs/language/html/html.worker.js",
    "ts.worker":
      "node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js",
  },
  bundle: true,
  minify: true,
  format: "iife",
  outdir: "public/editor",
  logLevel: "warning",
});
