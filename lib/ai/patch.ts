import { z } from "zod";
import { canonicalSchema, type Canonical } from "../schema/character";
export const operationSchema = z.object({
  op: z.enum(["add", "replace", "remove"]),
  path: z.string().max(300),
  value: z.unknown().optional(),
  reason: z.string().default(""),
});
export const patchSchema = z.object({
  operations: z.array(operationSchema).max(60).default([]),
  report: z.string().default(""),
  confirmedFacts: z.array(z.string()).default([]),
  userIntent: z.array(z.string()).default([]),
  unknownInformation: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  visibleFacts: z.array(z.string()).default([]),
  possibleInterpretation: z.array(z.string()).default([]),
  creativeSuggestions: z.array(z.string()).default([]),
  ideas: z
    .array(
      z.object({
        title: z.string(),
        situation: z.string(),
        mood: z.string(),
        hook: z.string(),
        userPosition: z.string(),
        whyItWorks: z.string(),
      }),
    )
    .max(6)
    .default([]),
});
export type Patch = z.infer<typeof patchSchema>;
export function applyPatch(
  base: Canonical,
  ops: Patch["operations"],
): Canonical {
  const c = structuredClone(base);
  for (const op of ops) {
    const parts = op.path
      .split("/")
      .slice(1)
      .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (
      !op.path.startsWith("/") ||
      (parts.length === 1 &&
        ["character", "lorebook", "greetings", "prompt"].includes(parts[0])) ||
      (parts[0] === "character" && parts[1] === "extensions") ||
      ![
        "character",
        "worlds",
        "lorebook",
        "scenario",
        "greetings",
        "prompt",
      ].includes(parts[0]) ||
      parts.some((p) => ["__proto__", "constructor", "prototype"].includes(p))
    )
      throw new Error("不允许的 Patch 路径");
    let obj: any = c;
    for (const p of parts.slice(0, -1)) {
      if (!obj || !Object.hasOwn(obj, p)) throw new Error("Patch 父路径不存在");
      obj = obj[p];
    }
    const key = parts.at(-1)!;
    if (Array.isArray(obj)) {
      const n = key === "-" ? obj.length : Number(key);
      if (
        !Number.isInteger(n) ||
        n < 0 ||
        n > obj.length ||
        (op.op !== "add" && n === obj.length)
      )
        throw new Error("Patch 数组索引无效");
      if (op.op === "add") obj.splice(n, 0, op.value);
      else if (op.op === "remove") obj.splice(n, 1);
      else obj[n] = op.value;
    } else {
      if (!obj || typeof obj !== "object") throw new Error("Patch 目标无效");
      if (op.op !== "add" && !Object.hasOwn(obj, key))
        throw new Error("Patch 路径不存在");
      if (op.op === "remove") delete obj[key];
      else obj[key] = op.value;
    }
  }
  return canonicalSchema.parse(c);
}
