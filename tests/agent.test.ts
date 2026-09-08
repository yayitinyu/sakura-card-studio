import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../lib/schema/character";
import { applyPatch, patchSchema } from "../lib/ai/patch";
import { buildContext } from "../lib/ai/agents/context";
import { roles, systemPrompt, type AgentName } from "../lib/ai/prompts";
test("patches immutable, constrained, atomic and schema validated", () => {
  const c = emptyCharacter("A");
  const p = patchSchema.parse({
    operations: [
      { op: "replace", path: "/character/personality", value: "Quiet" },
    ],
  });
  assert.equal(applyPatch(c, p.operations).character.personality, "Quiet");
  assert.equal(c.character.personality, "");
  for (const path of [
    "/character/__proto__/polluted",
    "/passthrough/data",
    "/character/name/a",
    "/greetings/alternate/99",
  ])
    assert.throws(() =>
      applyPatch(c, [{ op: "replace", path, value: "x", reason: "" }]),
    );
  assert.throws(() =>
    applyPatch(c, [
      { op: "replace", path: "/character/name", value: 13, reason: "" },
    ]),
  );
});
test("agent roles are separate and context is scoped", () => {
  const c = emptyCharacter("A");
  c.prompt.system = "PRIVATE_UNUSED";
  c.character.creatorNotes = "not a prompt";
  for (const role of Object.keys(roles) as AgentName[])
    assert.ok(systemPrompt(role).includes(roles[role]));
  assert.equal("worlds" in buildContext(c, "ImageAnalyst"), false);
  assert.equal("prompt" in buildContext(c, "GreetingDirector"), false);
  assert.equal("prompt" in buildContext(c, "ConsistencyReviewer"), true);
  assert.throws(() => patchSchema.parse({ ideas: [{ title: "incomplete" }] }));
});
