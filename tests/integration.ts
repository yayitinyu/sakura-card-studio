import { createFixtureProvider } from "./fixture-provider";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3101";
// Deterministic protocol fixture, isolated from the shipped app and external AI services.
const transport = createFixtureProvider();

async function main() {
  await new Promise<void>((r) => transport.listen(3199, "127.0.0.1", r));
  async function request(path: string, method = "GET", body?: unknown) {
    const res = await fetch(base + "/api/" + path, {
      method,
      headers:
        body instanceof FormData ? {} : { "content-type": "application/json" },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res;
  }
  let checks = 0;
  function check(value: unknown) {
    assert.ok(value);
    checks++;
  }
  try {
    const created = await (
      await request("projects", "POST", {
        name: "Integration transport fixture",
      })
    ).json();
    let p = created;
    check(p.version === 1);
    p.canonical.character.description = "Unicode 中文 {{user}}";
    p.canonical.greetings.main = "你好";
    p = await (
      await request("projects/" + p.id, "PUT", {
        canonical: p.canonical,
        version: p.version,
      })
    ).json();
    check(p.version === 2);
    const conflict = await fetch(base + "/api/projects/" + p.id, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canonical: p.canonical, version: 1 }),
    });
    check(conflict.status === 409);
    const secret = "integration-only-not-a-real-key";
    const provider = await (
      await request("providers", "POST", {
        config: {
          name: "Protocol fixture",
          baseUrl: "http://127.0.0.1:3199/v1",
          model: "fixture-model",
          vision: true,
        },
        apiKey: secret,
      })
    ).json();
    check(!JSON.stringify(provider).includes(secret));
    const providers = await (await request("providers")).json();
    check(!JSON.stringify(providers).includes(secret));
    check(
      (await (await request(`providers/${provider.id}/models`)).json())[0] ===
        "fixture-model",
    );
    check(
      (await (await request(`providers/${provider.id}/test`, "POST")).json())
        .ok,
    );
    async function run(agent: string, input: string, assetId?: string) {
      const text = await (
        await request("agent", "POST", {
          projectId: p.id,
          version: p.version,
          providerId: provider.id,
          model: "fixture-model",
          agent,
          input,
          assetId,
        })
      ).text();
      const event = text
        .split("\n\n")
        .find((e) => e.startsWith("event: result"));
      assert.ok(event, text);
      return JSON.parse(event.split("\ndata: ")[1]);
    }
    const character = await run("CharacterArchitect", "一位档案管理员");
    check(
      (await (await request("projects/" + p.id)).json()).canonical.character
        .personality === "",
    );
    p = await (
      await request("patch", "POST", {
        projectId: p.id,
        version: p.version,
        runId: character.runId,
        indices: [0],
      })
    ).json();
    check(p.canonical.character.personality === "安静、耐心、执着于真相");
    check(p.remainingPatch.operations.length === 1);
    const rejected = await (
      await request("patch", "POST", {
        projectId: p.id,
        version: p.version,
        runId: character.runId,
        indices: [0],
        action: "reject",
      })
    ).json();
    check(!rejected.remainingPatch);
    check(
      (await (await request("projects/" + p.id)).json()).version === p.version,
    );
    const rejectedApply = await fetch(base + "/api/patch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: p.id,
        version: p.version,
        runId: character.runId,
        indices: [0],
      }),
    });
    check(!rejectedApply.ok);
    const ideas = await run("GreetingDirector", "悬疑开场");
    check(ideas.patch.ideas.length === 3);
    const greeting = await run(
      "GreetingDirector",
      "SELECTED_IDEA: " + JSON.stringify(ideas.patch.ideas[0]),
    );
    p = await (
      await request("patch", "POST", {
        projectId: p.id,
        version: p.version,
        runId: greeting.runId,
        indices: [0],
      })
    ).json();
    check(p.canonical.greetings.main.includes("{{user}}"));
    const form = new FormData();
    form.set(
      "file",
      new File([readFileSync("tests/fixtures/ccv3.png")], "portrait.png", {
        type: "image/png",
      }),
    );
    const asset = await (await request("assets/" + p.id, "POST", form)).json();
    check(Boolean(asset.id));
    const image = await run("ImageAnalyst", "分析图片", asset.id);
    check(image.patch.visibleFacts.length === 1);
    p.canonical.lorebook.entries = [
      {
        name: "档案馆",
        keys: ["档案"],
        content: "午夜开门",
        extensions: { probability: 60, custom: { preserve: true } },
        enabled: true,
        insertion_order: 100,
        use_regex: false,
      },
    ];
    p = await (
      await request("projects/" + p.id, "PUT", {
        version: p.version,
        canonical: p.canonical,
      })
    ).json();
    const exported = await (
      await request("export/" + p.id + "?format=png")
    ).arrayBuffer();
    const reimport = new FormData();
    reimport.set(
      "file",
      new File([exported], "roundtrip.png", { type: "image/png" }),
    );
    const imported = await (await request("import", "POST", reimport)).json();
    check(
      imported.project.canonical.character.name === p.canonical.character.name,
    );
    assert.deepEqual(imported.project.canonical.lorebook, p.canonical.lorebook);
    checks++;
    assert.deepEqual(
      imported.project.canonical.greetings,
      p.canonical.greetings,
    );
    checks++;
    const json = await (
      await request("export/" + p.id + "?format=json")
    ).json();
    check(json.spec === "chara_card_v3");
    check(!JSON.stringify(json).includes(secret));
    const history = await (await request("history/" + p.id)).json();
    check(history.some((r: any) => r.source.includes("GreetingDirector")));
    p = await (
      await request("history/" + p.id, "POST", {
        revisionId: history.at(-1).id,
        version: p.version,
      })
    ).json();
    check(p.canonical.character.personality === "");
    const duplicate = await (
      await request(`projects/${p.id}/duplicate`, "POST")
    ).json();
    check(duplicate.id !== p.id);
    const bad = await fetch(base + "/api/projects", {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "blocked" }),
    });
    check(bad.status === 403);
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/integration.json",
      JSON.stringify(
        {
          checks,
          base,
          projectId: p.id,
          providerId: provider.id,
          passed: true,
          note: "Deterministic local protocol fixture; no live model claim",
        },
        null,
        2,
      ),
    );
    console.log(`${checks} integration assertions passed`);
  } finally {
    transport.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
