import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter, entrySchema } from "../lib/schema/character";
import { exportCard, normalizeImportedCard } from "../lib/codecs/card";
import { serializeAuthor, parseAuthor } from "../lib/codecs/author";
import { redactLog, registerSecret } from "../lib/server/logging";
import { readLimited } from "../lib/server/http";
import {resolveModelIcon} from '../lib/ai/model-icons';
import {validateAgentOutput} from '../lib/ai/agents/validate';
test('model family wins over OpenAI-compatible provider name',()=>{assert.equal(resolveModelIcon('anthropic/claude-sonnet','OpenAI Compatible'),'claude');assert.equal(resolveModelIcon('o3-mini'),'openai');assert.equal(resolveModelIcon('qwen3'),'qwen');assert.equal(resolveModelIcon('custom','DeepSeek'),'deepseek');assert.equal(resolveModelIcon('unrecognized'),null);});
test('agent stages enforce preview and reject empty model responses',()=>{assert.throws(()=>validateAgentOutput('CharacterArchitect','',{}));assert.throws(()=>validateAgentOutput('EvidenceExtraction','',{operations:[{op:'replace',path:'/character/name',value:'invented'}]}));assert.throws(()=>validateAgentOutput('GreetingDirector','',{report:'only one idea'}));assert.throws(()=>validateAgentOutput('ImageAnalyst','',{possibleInterpretation:['noble']}));});
test('removing a source section clears that section instead of reviving old state',()=>{const c=emptyCharacter('A');c.character.personality='old';const parsed=parseAuthor('- Name: "A"\n\n## Background\nNew background','markdown',c);assert.equal(parsed.character.personality,'');assert.equal(parsed.character.background,'New background');});
test("external description edits are authoritative over embedded Studio state", () => {
  const c = emptyCharacter("Example");
  c.character.basic = "Age: 25";
  c.character.description = "Original";
  const card = exportCard(c);
  card.data.description = "Edited in another application";
  const imported = normalizeImportedCard(card);
  assert.equal(imported.character.description, "Edited in another application");
  assert.equal(imported.character.basic, "");
  assert.equal(
    exportCard(imported).data.description,
    "Edited in another application",
  );
  assert.ok(imported.extensions["sakura.previousSections"]);
});
test("V2 string lore IDs and V3 assets survive downgrade and return", () => {
  const c = emptyCharacter("Example");
  c.lorebook.entries = [
    entrySchema.parse({ id: "uuid-string", content: "Lore" }),
  ];
  c.greetings.group = ["Group greeting"];
  c.passthrough.data.assets = [
    {
      type: "icon",
      uri: "https://example.com/icon.png",
      name: "main",
      ext: "png",
    },
  ];
  const v2 = exportCard(c, 2);
  assert.equal(typeof (v2.data.character_book as any).entries[0].id, "number");
  const reimport = normalizeImportedCard(v2);
  assert.equal(reimport.lorebook.entries[0].id, "uuid-string");
  assert.deepEqual(reimport.greetings.group, c.greetings.group);
  assert.deepEqual(exportCard(reimport).data.assets, c.passthrough.data.assets);
});
test("source conversion retains Name lines inside Basic Information", () => {
  const c = emptyCharacter("A");
  c.character.basic = "- Name: A\n- Age: 26";
  const round = parseAuthor(serializeAuthor(c, "markdown"), "markdown");
  assert.equal(round.character.basic, c.character.basic);
  const wrapped = parseAuthor(
    "<Character>\nname: Sakura\npersonality: Calm\n</Character>",
    "xml",
  );
  assert.equal(wrapped.character.name, "Sakura");
  assert.equal(wrapped.character.personality, "Calm");
});
test("log redaction removes whole authorization values and registered credentials", () => {
  const secret = "local-test-credential-value";
  registerSecret(secret);
  for (const text of [
    "Authorization: Bearer token-value",
    '{"api_key":"token-value"}',
    "Bearer token-value",
    secret,
  ]) {
    const safe = redactLog(text);
    assert.ok(!safe.includes("token-value"));
    assert.ok(!safe.includes(secret));
    assert.match(safe, /REDACTED/);
  }
});
test("streaming upload cap rejects missing Content-Length before full allocation", async () => {
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i++ < 10) controller.enqueue(new Uint8Array(1024));
      else controller.close();
    },
  });
  const req = new Request("http://localhost", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readLimited(req, 2048), /超过/);
  assert.ok(i < 10);
});
