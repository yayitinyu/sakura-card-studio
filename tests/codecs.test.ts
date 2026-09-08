import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { emptyCharacter, entrySchema } from "../lib/schema/character";
import { exportCard, normalizeImportedCard } from "../lib/codecs/card";
import { readPng, writePng, chunks } from "../lib/codecs/png";
import { parseAuthor, serializeAuthor } from "../lib/codecs/author";
const c = emptyCharacter("星野 澪");
Object.assign(c.character, {
  description: "雨夜档案管理员 {{user}}",
  personality: "温柔但固执",
  basic: "Age: 26",
  background: "寻找失踪的档案",
  exampleDialogue: "<START>\n{{char}}: 请保持安静。",
  extensions: { third_party: { nested: [1, "未知", true] } },
});
c.scenario = "雨夜";
c.greetings = {
  main: "你终于来了。",
  alternate: ["雨停了。"],
  group: ["大家好。"],
};
c.prompt = { system: "Stay in character.", postHistory: "{{original}}" };
c.lorebook.entries = [
  entrySchema.parse({
    id: 1,
    name: "档案馆",
    keys: ["档案"],
    content: "馆内时间静止",
    extensions: { probability: 75, unknown: { a: 1 } },
    unknown_future: "preserve",
  }),
];
test("V2/V3 JSON fixtures and round-trip key fields", () => {
  mkdirSync("tests/fixtures", { recursive: true });
  for (const v of [2, 3] as const) {
    const card = exportCard(c, v);
    writeFileSync(`tests/fixtures/ccv${v}.json`, JSON.stringify(card, null, 2));
    const imported = normalizeImportedCard(
      JSON.parse(readFileSync(`tests/fixtures/ccv${v}.json`, "utf8")),
    );
    for (const k of [
      "name",
      "description",
      "personality",
      "basic",
      "background",
      "exampleDialogue",
    ] as const)
      assert.equal(imported.character[k], c.character[k]);
    assert.deepEqual(imported.character.extensions, c.character.extensions);
    assert.deepEqual(imported.lorebook, c.lorebook);
    assert.deepEqual(imported.prompt, c.prompt);
    assert.equal(imported.scenario, c.scenario);
    assert.deepEqual(imported.greetings.alternate, c.greetings.alternate);
    assert.equal(imported.greetings.main, c.greetings.main);
    const second = normalizeImportedCard(exportCard(imported, v));
    assert.equal(second.character.description, c.character.description);
  }
});
test("independent standard cards retain unknown fields at all levels", () => {
  const data = {
    name: "Fixture",
    description: "desc",
    personality: "p",
    scenario: "s",
    first_mes: "g",
    mes_example: "d",
    creator_notes: "n",
    system_prompt: "sys",
    post_history_instructions: "post",
    alternate_greetings: ["a"],
    tags: ["t"],
    creator: "author",
    character_version: "1",
    extensions: { vendor: { keep: true } },
    future_field: { x: 2 },
    group_only_greetings: [],
  };
  const card = { spec: "chara_card_v3", spec_version: "3.1", extra: 9, data };
  writeFileSync(
    "tests/fixtures/unknown-extensions.json",
    JSON.stringify(card, null, 2),
  );
  const out = exportCard(normalizeImportedCard(card));
  assert.deepEqual(out.data.future_field, { x: 2 });
  assert.equal((out as Record<string, unknown>).extra, 9);
  assert.deepEqual((out.data.extensions as any).vendor, { keep: true });
});
test("PNG dual chunks prioritize V3; CRC corruption and truncation rejected", async () => {
  const png = await sharp({
    create: { width: 32, height: 48, channels: 4, background: "#e8deef" },
  })
    .png()
    .toBuffer();
  const out = writePng(png, c);
  writeFileSync("tests/fixtures/ccv3.png", out);
  const v2 = Buffer.concat([
    out.subarray(0, 8),
    ...chunks(out)
      .filter(
        (x) => !(x.type === "tEXt" && x.data.toString().startsWith("ccv3\0")),
      )
      .map((x) => x.raw),
  ]);
  writeFileSync("tests/fixtures/ccv2.png", v2);
  assert.equal(readPng(v2).character.name, c.character.name);
  const again = readPng(out);
  assert.deepEqual(again.greetings, c.greetings);
  assert.deepEqual(again.lorebook, c.lorebook);
  assert.equal(again.character.description, c.character.description);
  assert.deepEqual(readPng(writePng(out, again)).character, again.character);
  const bad = Buffer.from(out);
  bad[45] ^= 1;
  assert.throws(() => readPng(bad), /CRC/);
  assert.throws(() => readPng(out.subarray(0, 30)));
});
test("all author formats preserve full canonical semantics", () => {
  for (const format of ["json", "yaml", "markdown", "xml"] as const) {
    const out = parseAuthor(serializeAuthor(c, format), format);
    assert.deepEqual(out.character, c.character);
    assert.deepEqual(out.greetings, c.greetings);
    assert.deepEqual(out.lorebook, c.lorebook);
    assert.deepEqual(out.prompt, c.prompt);
  }
});
test("XML wrapped mixed author text, Unicode and unknown JSON", () => {
  const out = parseAuthor(
    '<Character>Character\n\nBasic Information\n- Name: "殷淑婉"\n- Age: 未知\n\nBackground\n- 留存的往事\n  - 子项目\n</Character>',
    "xml",
  );
  assert.equal(out.character.name, "殷淑婉");
  assert.match(out.character.background, /子项目/);
  assert.match(out.character.basic, /Age/);
  const unknown = parseAuthor('{"custom":{"x":1}}', "json");
  assert.deepEqual(unknown.extensions.authorUnknown, { custom: { x: 1 } });
  assert.throws(() => parseAuthor("name: [", "yaml"));
});
