import { z } from "zod";
import {
  canonicalSchema,
  emptyCharacter,
  lorebookSchema,
  type Canonical,
  bag,
} from "../schema/character";
const strings = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "creator",
  "character_version",
] as const;
export const cardDataSchema = z
  .object(
    Object.fromEntries(strings.map((k) => [k, z.string()])) as Record<
      (typeof strings)[number],
      z.ZodString
    >,
  )
  .extend({
    alternate_greetings: z.array(z.string()),
    tags: z.array(z.string()),
    extensions: bag,
    character_book: lorebookSchema.optional(),
    group_only_greetings: z.array(z.string()).optional(),
    assets: z
      .array(
        z
          .object({
            type: z.string(),
            uri: z.string(),
            name: z.string(),
            ext: z.string(),
          })
          .passthrough(),
      )
      .optional(),
    nickname: z.string().optional(),
    source: z.array(z.string()).optional(),
    creator_notes_multilingual: z.record(z.string(), z.string()).optional(),
    creation_date: z.number().optional(),
    modification_date: z.number().optional(),
  })
  .passthrough();
export function importCard(input: unknown): Canonical {
  const envelope = z
    .object({
      spec: z.enum(["chara_card_v2", "chara_card_v3"]),
      spec_version: z.string(),
      data: cardDataSchema,
    })
    .passthrough()
    .parse(input);
  const d = envelope.data;
  if (envelope.spec === "chara_card_v3" && !d.group_only_greetings)
    throw new Error("V3 缺少 group_only_greetings");
  const c = emptyCharacter(d.name);
  const studio = d.extensions["sakura.card-studio"];
  if (studio && typeof studio === "object") {
    const parsed = canonicalSchema.safeParse(studio);
    if (parsed.success) Object.assign(c, parsed.data);
  }
  Object.assign(c.character, {
    name: d.name,
    description: d.description,
    personality: d.personality,
    exampleDialogue: d.mes_example,
    creatorNotes: d.creator_notes,
    creator: d.creator,
    version: d.character_version,
    tags: d.tags,
    extensions: { ...d.extensions },
  });
  delete c.character.extensions["sakura.card-studio"];
  c.scenario = d.scenario;
  c.greetings = {
    main: d.first_mes,
    alternate: d.alternate_greetings,
    group: d.group_only_greetings ?? c.greetings.group,
  };
  c.prompt = {
    system: d.system_prompt,
    postHistory: d.post_history_instructions,
  };
  c.lorebook = d.character_book ?? lorebookSchema.parse({});
  c.passthrough = {
    root: { ...c.passthrough.root, ...envelope },
    data: { ...c.passthrough.data, ...d },
  };
  delete c.passthrough.root.data;
  return canonicalSchema.parse(c);
}
export function compileDescription(c: Canonical) {
  return [
    c.character.description,
    ...[
      "basic",
      "appearance",
      "speechStyle",
      "behavior",
      "preferences",
      "background",
      "goals",
      "motivations",
      "secrets",
      "relationships",
      "userRelationship",
      "rules",
    ]
      .filter((k) => c.character[k])
      .map((k) => `## ${k}\n${c.character[k]}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function exportCard(c: Canonical, version: 2 | 3 = 3) {
  canonicalSchema.parse(c);
  if (!c.character.name.trim()) throw new Error("导出需要角色名称");
  const stored = structuredClone(c);
  stored.passthrough = {
    root: { ...c.passthrough.root },
    data: { ...c.passthrough.data },
  };
  delete stored.passthrough.root.data;
  delete stored.passthrough.data.extensions;
  delete stored.passthrough.data.character_book;
  stored.author = { format: "markdown", source: "" };
  const d: Record<string, unknown> = {
    ...c.passthrough.data,
    name: c.character.name,
    description: compileDescription(c),
    personality: c.character.personality,
    scenario: c.scenario,
    first_mes: c.greetings.main,
    mes_example: c.character.exampleDialogue,
    creator_notes: c.character.creatorNotes,
    system_prompt: c.prompt.system,
    post_history_instructions: c.prompt.postHistory,
    alternate_greetings: c.greetings.alternate,
    tags: c.character.tags,
    creator: c.character.creator,
    character_version: c.character.version,
    extensions: { ...c.character.extensions, "sakura.card-studio": stored },
    character_book: c.lorebook,
  };
  // Preserve structured author sections without duplicating them on re-import.
  (d.extensions as Record<string, unknown>)["sakura.description"] =
    c.character.description;
  if (version === 3) {
    d.group_only_greetings = c.greetings.group;
  } else {
    d.character_book = {
      ...c.lorebook,
      entries: c.lorebook.entries.map((entry, index) => ({
        ...entry,
        id: typeof entry.id === "string" ? index : entry.id,
        extensions: {
          ...entry.extensions,
          ...(typeof entry.id === "string"
            ? { "sakura.original_id": entry.id }
            : {}),
        },
      })),
    };
    for (const k of [
      "assets",
      "nickname",
      "creator_notes_multilingual",
      "source",
      "group_only_greetings",
      "creation_date",
      "modification_date",
    ])
      delete d[k];
  }
  return {
    ...c.passthrough.root,
    spec: `chara_card_v${version}`,
    spec_version: `${version}.0`,
    data: d,
  };
}
export function normalizeImportedCard(input: unknown) {
  const c = importCard(input);
  const envelope = input as {
    spec_version: string;
    data: { description: string; extensions: Record<string, unknown> };
  };
  const studio = canonicalSchema.safeParse(
    envelope.data.extensions["sakura.card-studio"],
  );
  if (studio.success) {
    if (envelope.data.description === compileDescription(studio.data))
      c.character.description = studio.data.character.description;
    else {
      c.extensions["sakura.previousSections"] = studio.data.character;
      c.extensions["sakura.importWarnings"] = [
        "外部软件修改了 description：以外部文本为准，原结构化章节保留在扩展中",
      ];
      for (const key of [
        "basic",
        "appearance",
        "speechStyle",
        "behavior",
        "preferences",
        "background",
        "goals",
        "motivations",
        "secrets",
        "relationships",
        "userRelationship",
        "rules",
      ])
        c.character[key] = "";
    }
  }
  c.lorebook.entries = c.lorebook.entries.map((entry) => {
    const original = entry.extensions["sakura.original_id"];
    if (typeof original !== "string") return entry;
    const ext = { ...entry.extensions };
    delete ext["sakura.original_id"];
    return { ...entry, id: original, extensions: ext };
  });
  if (parseFloat(envelope.spec_version) > 3)
    c.extensions["sakura.importWarnings"] = [
      "此卡片来自较新规范版本，未知字段已保留，但未解释其行为",
    ];
  delete c.character.extensions["sakura.description"];
  return c;
}
