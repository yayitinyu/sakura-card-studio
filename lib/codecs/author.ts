import YAML from "yaml";
import {
  canonicalSchema,
  emptyCharacter,
  type Canonical,
} from "../schema/character";
import { normalizeImportedCard } from "./card";
export type Format = "markdown" | "yaml" | "json" | "xml";
const aliases: Record<string, string> = {
  "basic information": "basic",
  basic: "basic",
  appearance: "appearance",
  personality: "personality",
  background: "background",
  relationships: "relationships",
  "speech style": "speechStyle",
  behavior: "behavior",
  preferences: "preferences",
  goals: "goals",
  motivations: "motivations",
  secrets: "secrets",
  "user relationship": "userRelationship",
  "rules / constraints": "rules",
  rules: "rules",
  "example dialogue": "exampleDialogue",
  "creator notes": "creatorNotes",
  description: "description",
};
export function parseAuthor(
  source: string,
  format: Format,
  base: Canonical = emptyCharacter(),
): Canonical {
  let value: unknown;
  let body = source.replace(
    /^\s*<([\w:-]+)[^>]*>\s*(?:Character\s*\n)?([\s\S]*)<\/\1>\s*$/,
    "$2",
  );
  let structured = format === "json" || format === "yaml";
  if (format === "json") value = JSON.parse(body);
  else if (format === "yaml") value = YAML.parse(body, { maxAliasCount: 50 });
  else if (format === "xml" && /^\s*[A-Za-z_][\w ]*\s*:(?:\s|$)/.test(body)) {
    value = YAML.parse(body, { maxAliasCount: 50 });
    structured = true;
  } else {
    const embedded = body.match(/<!-- sakura-canonical:([A-Za-z0-9+/=]+) -->/);
    if (embedded) {
      value = JSON.parse(Buffer.from(embedded[1], "base64").toString("utf8"));
      body = body.replace(embedded[0], "");
    }
  }
  if (
    structured &&
    (value === null || typeof value !== "object" || Array.isArray(value))
  )
    throw new Error("作者 JSON/YAML 必须是对象");
  let c = structuredClone(base);
  if (value && typeof value === "object") {
    if ("spec" in value) c = normalizeImportedCard(value);
    else if ("schemaVersion" in value) c = canonicalSchema.parse(value);
    else {
      c.extensions.authorUnknown = value;
      const root = value as Record<string, unknown>;
      const obj =
        root.character &&
        typeof root.character === "object" &&
        !Array.isArray(root.character)
          ? (root.character as Record<string, unknown>)
          : root;
      for (const [key, val] of Object.entries(obj)) {
        const k =
          aliases[key.toLowerCase()] ??
          Object.values(aliases).find(
            (v) => v.toLowerCase() === key.toLowerCase(),
          );
        if (k)
          c.character[k] =
            typeof val === "string" ? val : YAML.stringify(val).trim();
        if (key.toLowerCase() === "name" && typeof val === "string")
          c.character.name = val;
        if (
          key.toLowerCase() === "basic information" &&
          val &&
          typeof val === "object" &&
          "Name" in val &&
          typeof val.Name === "string"
        )
          c.character.name = val.Name;
      }
      if (
        !Object.keys(obj).some(
          (k) => aliases[k.toLowerCase()] || k.toLowerCase() === "name",
        )
      )
        c.character.description = body;
    }
  }
  if (!structured && (format === "markdown" || format === "xml")) {
    for (const key of new Set(Object.values(aliases))) c.character[key] = "";
    const lines = body.split("\n");
    let section = "description";
    const sections: Record<string, string[]> = {};
    for (const [index, line] of lines.entries()) {
      if (index === 0 && /^\s*-?\s*Name\s*:/i.test(line)) continue;
      const title = line
        .replace(/^#{1,6}\s+/, "")
        .trim()
        .toLowerCase();
      const k = aliases[title];
      if (k) {
        section = k;
        sections[k] ??= [];
      } else {
        (sections[section] ??= []).push(line);
      }
    }
    for (const [k, lines] of Object.entries(sections))
      if (lines.join("\n").trim() || k !== "description")
        c.character[k] = lines.join("\n").trim();
    const name = body.match(
      /(?:^|\n)\s*(?:-\s*)?(?:\*\*)?(?:Name|姓名)(?:\*\*)?\s*[:：]\s*["']?([^\n"']+)/i,
    );
    if (name) c.character.name = name[1].trim();
  }
  c.author = { format, source };
  return canonicalSchema.parse(c);
}
export function serializeAuthor(c: Canonical, format: Format) {
  const clean = structuredClone(c);
  clean.author = { format, source: "" };
  if (format === "json") return JSON.stringify(clean, null, 2);
  if (format === "yaml") return YAML.stringify(clean);
  const body = [
    `- Name: "${c.character.name}"`,
    ...Object.entries(aliases)
      .filter(([k]) =>
        [
          "description",
          "basic information",
          "appearance",
          "personality",
          "speech style",
          "behavior",
          "preferences",
          "background",
          "goals",
          "motivations",
          "secrets",
          "relationships",
          "user relationship",
          "rules",
          "example dialogue",
          "creator notes",
        ].includes(k),
      )
      .filter(([, v]) => c.character[v])
      .map(
        ([k, v]) =>
          `## ${k.replace(/\b\w/g, (s) => s.toUpperCase())}\n\n${c.character[v]}`,
      ),
  ].join("\n\n");
  const payload = `<!-- sakura-canonical:${Buffer.from(JSON.stringify(clean), "utf8").toString("base64")} -->`;
  return format === "xml"
    ? `<Character>\n${body}\n${payload}\n</Character>`
    : `${body}\n\n${payload}`;
}
