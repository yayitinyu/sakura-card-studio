import { z } from "zod";
export const bag = z.record(z.string(), z.unknown());
const text = z.string().default("");
export const entrySchema = z
  .object({
    keys: z.array(z.string()).default([]),
    secondary_keys: z.array(z.string()).default([]),
    content: text,
    extensions: bag.default({}),
    enabled: z.boolean().default(true),
    insertion_order: z.number().default(100),
    use_regex: z.boolean().default(false),
    name: text,
    id: z.union([z.number(), z.string()]).optional(),
    constant: z.boolean().default(false),
    selective: z.boolean().default(false),
    position: z.enum(["before_char", "after_char"]).default("after_char"),
  })
  .passthrough();
export const lorebookSchema = z
  .object({
    name: text,
    description: text,
    extensions: bag.default({}),
    entries: z.array(entrySchema).default([]),
  })
  .passthrough();
export const characterSchema = z
  .object({
    name: text,
    description: text,
    basic: text,
    appearance: text,
    personality: text,
    speechStyle: text,
    behavior: text,
    preferences: text,
    background: text,
    goals: text,
    motivations: text,
    secrets: text,
    relationships: text,
    userRelationship: text,
    rules: text,
    exampleDialogue: text,
    creatorNotes: text,
    tags: z.array(z.string()).default([]),
    creator: text,
    version: text,
    extensions: bag.default({}),
  })
  .passthrough();
export const worldSchema = z
  .object({
    id: z.string(),
    name: text,
    overview: text,
    locations: text,
    organizations: text,
    factions: text,
    races: text,
    powerSystem: text,
    history: text,
    culture: text,
    terminology: text,
    npcs: text,
    events: text,
    extensions: bag.default({}),
  })
  .passthrough();
export const canonicalSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    character: characterSchema,
    scenario: text,
    greetings: z.object({
      main: text,
      alternate: z.array(z.string()).default([]),
      group: z.array(z.string()).default([]),
    }),
    prompt: z.object({ system: text, postHistory: text }),
    worlds: z.array(worldSchema).default([]),
    lorebook: lorebookSchema,
    extensions: bag.default({}),
    passthrough: z
      .object({ root: bag.default({}), data: bag.default({}) })
      .default({ root: {}, data: {} }),
    author: z
      .object({
        format: z.enum(["markdown", "yaml", "json", "xml"]).default("markdown"),
        source: text,
      })
      .default({ format: "markdown", source: "" }),
  })
  .passthrough();
export type Canonical = z.infer<typeof canonicalSchema>;
export type LoreEntry = z.infer<typeof entrySchema>;
export function emptyCharacter(name = "未命名角色"): Canonical {
  return canonicalSchema.parse({
    character: { name },
    scenario: "",
    greetings: {},
    prompt: {},
    lorebook: {},
  });
}
export const estimateTokens = (value: unknown) =>
  Math.ceil(
    (typeof value === "string" ? value : JSON.stringify(value))
      .split("")
      .reduce((n, c) => n + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.28), 0),
  );
export function validateCharacter(c: Canonical) {
  const warnings: string[] = [];
  const importWarnings = c.extensions["sakura.importWarnings"];
  if (Array.isArray(importWarnings))
    warnings.push(
      ...importWarnings.filter((x): x is string => typeof x === "string"),
    );
  if (!c.character.name.trim()) warnings.push("缺少角色名称");
  if (!c.greetings.main.trim()) warnings.push("主开场白为空");
  for (const e of c.lorebook.entries) {
    if (!e.content.trim()) warnings.push(`世界书「${e.name}」内容为空`);
    if (!e.constant && !e.keys.length)
      warnings.push(`世界书「${e.name}」缺少触发关键词`);
  }
  if (Object.keys(c.character.extensions).length)
    warnings.push("第三方 extensions 已保留，其行为未在本应用执行");
  return warnings;
}
