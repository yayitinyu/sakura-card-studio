import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import {
  db,
  orm,
  projects,
  createProject,
  getProject,
  saveProject,
  revision,
  saveModelPreference,
} from "@/lib/server/db";
import { readJson, readUpload } from "@/lib/server/http";
import {
  canonicalSchema,
  emptyCharacter,
  validateCharacter,
} from "@/lib/schema/character";
import { encrypt, decrypt, mask } from "@/lib/server/crypto";
import {
  providerSchema,
  OpenAICompatible,
  type Provider,
} from "@/lib/ai/providers/openai-compatible";
import { roles, systemPrompt, type AgentName } from "@/lib/ai/prompts";
import { buildContext } from "@/lib/ai/agents/context";
import { validateAgentOutput } from "@/lib/ai/agents/validate";
import { applyPatch, patchSchema } from "@/lib/ai/patch";
import { exportCard, normalizeImportedCard } from "@/lib/codecs/card";
import { parseAuthor, serializeAuthor, type Format } from "@/lib/codecs/author";
import { readPng, writePng } from "@/lib/codecs/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) => NextResponse.json(v, { status });
function provider(id: string) {
  const row = db().prepare("SELECT * FROM providers WHERE id=?").get(id) as
    { config: string; credential: string } | undefined;
  if (!row) throw new Error("Provider 不存在");
  return {
    config: providerSchema.parse(JSON.parse(row.config)),
    key: row.credential ? decrypt(row.credential) : "",
  };
}
const body = readJson;
type RouteContext = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, context: RouteContext) {
  try {
    const parts = (await context.params).path;
    const [resource, id, action] = parts;
    const method = req.method;
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.headers.get("host"))
        return json({ error: "跨站请求被拒绝" }, 403);
    }
    if (resource === "health")
      return json({ ok: db().prepare("SELECT 1").get() != null });
    if ((resource === "characters" || resource === "lorebooks") && id) {
      const p = getProject(id);
      const field = resource === "characters" ? "character" : "lorebook";
      if (method === "GET")
        return json({ version: p.version, data: p.canonical[field] });
      if (method === "PUT") {
        const b = z
          .object({ version: z.number(), data: z.unknown() })
          .parse(await body(req));
        const c = canonicalSchema.parse({ ...p.canonical, [field]: b.data });
        return json(
          saveProject(
            id,
            c,
            b.version,
            resource === "characters" ? "Character edit" : "Lorebook edit",
          ),
        );
      }
    }
    if (resource === "projects") {
      if (method === "GET" && !id)
        return json(
          orm()
            .select({
              id: projects.id,
              name: projects.name,
              version: projects.version,
              archived: projects.archived,
              updated_at: projects.updatedAt,
            })
            .from(projects)
            .all()
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        );
      if (method === "POST" && !id) {
        const b = z
          .object({
            name: z.string().min(1).max(200),
            canonical: canonicalSchema.optional(),
          })
          .parse(await body(req));
        return json(
          createProject(b.name, b.canonical ?? emptyCharacter(b.name)),
        );
      }
      if (method === "GET" && id && !action) return json(getProject(id));
      if (method === "PUT" && id) {
        const b = z
          .object({
            canonical: canonicalSchema,
            version: z.number().int(),
            source: z.string().max(120).default("Manual edit"),
          })
          .parse(await body(req));
        return json(saveProject(id, b.canonical, b.version, b.source));
      }
      if (method === "PATCH" && id) {
        const b = z
          .object({
            name: z.string().min(1).max(200).optional(),
            archived: z.boolean().optional(),
          })
          .parse(await body(req));
        getProject(id);
        if (b.name)
          db().prepare("UPDATE projects SET name=? WHERE id=?").run(b.name, id);
        if (b.archived !== undefined)
          db()
            .prepare("UPDATE projects SET archived=? WHERE id=?")
            .run(+b.archived, id);
        return json(getProject(id));
      }
      if (method === "DELETE" && id) {
        db().prepare("DELETE FROM projects WHERE id=?").run(id);
        return json({ ok: true });
      }
      if (method === "POST" && action === "duplicate") {
        const p = getProject(id);
        const copy = db().transaction(() => {
          const next = createProject(p.name + " 副本", p.canonical);
          for (const a of db()
            .prepare("SELECT name,mime,data FROM assets WHERE project_id=?")
            .all(id) as { name: string; mime: string; data: Buffer }[])
            db()
              .prepare("INSERT INTO assets VALUES(?,?,?,?,?)")
              .run(crypto.randomUUID(), next.id, a.name, a.mime, a.data);
          return next;
        })();
        return json(copy);
      }
    }
    if (resource === "providers") {
      if (method === "GET" && !id) {
        const rows = db().prepare("SELECT * FROM providers").all() as {
          config: string;
          credential: string;
        }[];
        return json(
          rows.map((r) => ({
            ...JSON.parse(r.config),
            keyMask: r.credential ? mask(decrypt(r.credential)) : "",
          })),
        );
      }
      if (method === "POST" && !id) {
        const input = z
          .object({
            config: providerSchema,
            apiKey: z.string().max(4096).optional(),
            deleteKey: z.boolean().optional(),
          })
          .parse(await body(req));
        const config = input.config;
        config.id ||= crypto.randomUUID();
        const old = db()
          .prepare("SELECT credential FROM providers WHERE id=?")
          .get(config.id) as { credential: string } | undefined;
        const credential = input.deleteKey
          ? ""
          : input.apiKey
            ? encrypt(input.apiKey)
            : (old?.credential ?? "");
        db()
          .prepare(
            "INSERT INTO providers VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,credential=excluded.credential",
          )
          .run(config.id, JSON.stringify(config), credential);
        saveModelPreference(config);
        return json({
          ...config,
          keyMask: credential ? mask(decrypt(credential)) : "",
        });
      }
      if (id && action === "models") {
        const p = provider(id);
        return json(await new OpenAICompatible(p.config, p.key).listModels());
      }
      if (id && action === "test") {
        const p = provider(id);
        return json({
          ok: await new OpenAICompatible(p.config, p.key).testConnection(),
        });
      }
    }
    if (resource === "history" && id) {
      getProject(id);
      if (method === "GET")
        return json(
          db()
            .prepare(
              "SELECT * FROM revisions WHERE project_id=? ORDER BY created_at DESC",
            )
            .all(id),
        );
      if (method === "POST") {
        const b = z
          .object({ revisionId: z.string(), version: z.number() })
          .parse(await body(req));
        const r = db()
          .prepare(
            "SELECT canonical FROM revisions WHERE id=? AND project_id=?",
          )
          .get(b.revisionId, id) as { canonical: string } | undefined;
        if (!r) throw new Error("Revision 不存在");
        return json(
          saveProject(
            id,
            canonicalSchema.parse(JSON.parse(r.canonical)),
            b.version,
            "Restore",
          ),
        );
      }
    }
    if (resource === "codec" && method === "POST") {
      const b = z
        .object({
          canonical: canonicalSchema,
          format: z.enum(["markdown", "yaml", "json", "xml"]),
          source: z.string().optional(),
        })
        .parse(await body(req));
      return json(
        b.source === undefined
          ? { source: serializeAuthor(b.canonical, b.format) }
          : { canonical: parseAuthor(b.source, b.format, b.canonical) },
      );
    }
    if (resource === "import" && method === "POST") {
      if (Number(req.headers.get("content-length")) > 20 * 1024 * 1024)
        throw new Error("文件超过 20 MB");
      const data = await readUpload(req, 20 * 1024 * 1024);
      const file = data.get("file");
      if (!(file instanceof File) || file.size > 20 * 1024 * 1024)
        throw new Error("请选择小于 20 MB 的文件");
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (
        ![
          "png",
          "json",
          "md",
          "markdown",
          "yaml",
          "yml",
          "xml",
          "txt",
        ].includes(ext ?? "")
      )
        throw new Error("不支持的文件格式");
      const buf = Buffer.from(await file.arrayBuffer());
      let c;
      if (ext === "png") c = readPng(buf);
      else if (ext === "json") {
        const o = JSON.parse(buf.toString("utf8"));
        c = o.spec
          ? normalizeImportedCard(o)
          : parseAuthor(buf.toString("utf8"), "json");
      } else
        c = parseAuthor(
          buf.toString("utf8"),
          (ext === "yml"
            ? "yaml"
            : ext === "md" || ext === "txt"
              ? "markdown"
              : ext) as Format,
        );
      const p = createProject(c.character.name || file.name, c);
      revision(p.id, c, "Import");
      if (ext === "png")
        db()
          .prepare("INSERT INTO assets VALUES(?,?,?,?,?)")
          .run(crypto.randomUUID(), p.id, file.name, "image/png", buf);
      return json({ project: p, warnings: validateCharacter(c) });
    }
    if (resource === "export" && id) {
      const c = getProject(id).canonical;
      const format = req.nextUrl.searchParams.get("format") ?? "json";
      const version = req.nextUrl.searchParams.get("version") === "2" ? 2 : 3;
      let output: Buffer;
      let mime = "application/json";
      if (format === "png") {
        const asset = db()
          .prepare(
            "SELECT data FROM assets WHERE project_id=? ORDER BY rowid LIMIT 1",
          )
          .get(id) as { data: Buffer } | undefined;
        const png = asset
          ? await sharp(asset.data, { limitInputPixels: 40_000_000 })
              .png()
              .toBuffer()
          : await sharp({
              create: {
                width: 512,
                height: 768,
                channels: 4,
                background: "#e8deef",
              },
            })
              .png()
              .toBuffer();
        output = writePng(png, c);
        mime = "image/png";
      } else if (format === "json")
        output = Buffer.from(JSON.stringify(exportCard(c, version), null, 2));
      else {
        if (!["markdown", "yaml", "xml"].includes(format))
          throw new Error("不支持的格式");
        output = Buffer.from(serializeAuthor(c, format as Format));
        mime = "text/plain; charset=utf-8";
      }
      return new Response(new Uint8Array(output), {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="character.${format === "markdown" ? "md" : format}"`,
          "X-Compatibility-Warnings": encodeURIComponent(
            JSON.stringify(
              validateCharacter(c).concat(
                version === 2
                  ? [
                      "V3 专用字段不能由 V2 客户端解释，已保留在 Studio extension",
                    ]
                  : [],
              ),
            ),
          ),
        },
      });
    }
    if (resource === "assets" && id) {
      getProject(id);
      if (method === "GET" && action) {
        const asset = db()
          .prepare("SELECT mime,data FROM assets WHERE id=? AND project_id=?")
          .get(action, id) as { mime: string; data: Buffer } | undefined;
        if (!asset) throw new Error("资源不存在");
        return new Response(new Uint8Array(asset.data), {
          headers: {
            "Content-Type": asset.mime,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "GET")
        return json(
          db()
            .prepare("SELECT id,name,mime FROM assets WHERE project_id=?")
            .all(id),
        );
      if (method === "POST") {
        const form = await readUpload(req, 10 * 1024 * 1024);
        const file = form.get("file");
        if (
          !(file instanceof File) ||
          file.size > 10 * 1024 * 1024 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw new Error("仅支持 10 MB 以内 PNG / JPEG / WebP");
        const data = await sharp(Buffer.from(await file.arrayBuffer()), {
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .resize({
            width: 2048,
            height: 2048,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        const assetId = crypto.randomUUID();
        db()
          .prepare("INSERT INTO assets VALUES(?,?,?,?,?)")
          .run(assetId, id, file.name, "image/png", data);
        return json({ id: assetId });
      }
    }
    if (resource === "agent" && method === "POST") {
      const b = z
        .object({
          projectId: z.string(),
          version: z.number(),
          providerId: z.string(),
          model: z.string().min(1),
          agent: z.enum(Object.keys(roles) as [AgentName, ...AgentName[]]),
          input: z.string().max(40000),
          assetId: z.string().optional(),
        })
        .parse(await body(req));
      const project = getProject(b.projectId);
      if (project.version !== b.version)
        throw new Error("项目已更改，请保存后重试");
      const p = provider(b.providerId);
      const adapter = new OpenAICompatible(p.config, p.key);
      let content: any = JSON.stringify({
        context: buildContext(project.canonical, b.agent, b.input),
        input: b.input,
      });
      if (b.assetId) {
        if (!adapter.supportsVision())
          throw new Error("请先在 Provider 设置确认当前模型支持 Vision");
        const a = db()
          .prepare("SELECT data,mime FROM assets WHERE id=? AND project_id=?")
          .get(b.assetId, b.projectId) as
          { data: Buffer; mime: string } | undefined;
        if (!a) throw new Error("图片不存在");
        content = [
          { type: "text", text: content },
          {
            type: "image_url",
            image_url: {
              url: `data:${a.mime};base64,${a.data.toString("base64")}`,
            },
          },
        ];
      }
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) =>
            controller.enqueue(
              new TextEncoder().encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          try {
            send("status", { message: "正在构思…" });
            let result = "";
            for await (const delta of adapter.stream(
              [
                { role: "system", content: systemPrompt(b.agent) },
                { role: "user", content },
              ],
              b.model,
            )) {
              result += delta;
              if (result.length > 300000) throw new Error("AI 输出超过限制");
            }
            const patch = validateAgentOutput(
              b.agent,
              b.input,
              JSON.parse(
                result
                  .replace(/^\s*```(?:json)?\s*/, "")
                  .replace(/\s*```\s*$/, ""),
              ),
            );
            applyPatch(project.canonical, patch.operations);
            const runId = crypto.randomUUID();
            db()
              .prepare("INSERT INTO agent_runs VALUES(?,?,?,?,?,?)")
              .run(
                runId,
                b.projectId,
                b.agent,
                b.model,
                JSON.stringify({ patch, version: b.version }),
                new Date().toISOString(),
              );
            p.config.recent = [
              b.model,
              ...p.config.recent.filter((m) => m !== b.model),
            ].slice(0, 12);
            db()
              .prepare("UPDATE providers SET config=? WHERE id=?")
              .run(JSON.stringify(p.config), p.config.id);
            saveModelPreference(p.config);
            const insertSuggestion = db().prepare(
              "INSERT INTO agent_suggestions VALUES(?,?,?,?,?)",
            );
            patch.operations.forEach((op, i) =>
              insertSuggestion.run(
                crypto.randomUUID(),
                runId,
                i,
                JSON.stringify(op),
                "pending",
              ),
            );
            send("result", { patch, runId });
          } catch {
            send("error", {
              error:
                "AI 请求失败或返回了无效结构，请检查 Provider / 模型设置后重试。项目未修改。",
            });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (resource === "patch" && method === "POST") {
      const b = z
        .object({
          projectId: z.string(),
          version: z.number(),
          runId: z.string(),
          action: z.enum(["apply", "reject"]).default("apply"),
          indices: z.array(z.number().int().min(0)).min(1),
          edits: z.record(z.string(), z.unknown()).optional(),
          greetingTarget: z.enum(["main", "alternate"]).optional(),
        })
        .parse(await body(req));
      const run = db()
        .prepare("SELECT * FROM agent_runs WHERE id=? AND project_id=?")
        .get(b.runId, b.projectId) as
        { result: string; agent: string; model: string } | undefined;
      if (!run) throw new Error("Agent run 不存在");
      const stored = JSON.parse(run.result);
      if (stored.version !== b.version)
        throw new Error("建议已过期，请重新生成");
      const patch = patchSchema.parse(stored.patch);
      if (b.indices.some((i) => !patch.operations[i]))
        throw new Error("无效 operation");
      if (b.action === "reject") {
        const remainingIndices = patch.operations
          .map((_, i) => i)
          .filter((i) => !b.indices.includes(i));
        const remainingPatch = remainingIndices.length
          ? {
              ...patch,
              operations: remainingIndices.map((i) => patch.operations[i]),
            }
          : undefined;
        db().transaction(() => {
          for (const i of b.indices)
            db()
              .prepare(
                "UPDATE agent_suggestions SET status='rejected' WHERE run_id=? AND operation_index=?",
              )
              .run(b.runId, stored.originalIndices?.[i] ?? i);
          db()
            .prepare("UPDATE agent_runs SET result=? WHERE id=?")
            .run(
              JSON.stringify({
                ...stored,
                patch: remainingPatch ?? { ...patch, operations: [] },
                originalIndices: remainingIndices.map(
                  (i) => stored.originalIndices?.[i] ?? i,
                ),
              }),
              b.runId,
            );
        })();
        return json({ remainingPatch });
      }
      const ops = [...new Set(b.indices)]
        .sort((a, b) => a - b)
        .map((i) => {
          if (!patch.operations[i]) throw new Error("无效 operation");
          const original = patch.operations[i];
          const op = {
            ...original,
            ...(b.edits && Object.hasOwn(b.edits, String(i))
              ? { value: b.edits[String(i)] }
              : {}),
          };
          if (
            b.greetingTarget === "alternate" &&
            op.path === "/greetings/main" &&
            op.op === "replace"
          )
            return {
              ...op,
              op: "add" as const,
              path: "/greetings/alternate/-",
            };
          return op;
        });
      const applied = db().transaction(() => {
        const c = applyPatch(getProject(b.projectId).canonical, ops);
        const saved = saveProject(
          b.projectId,
          c,
          b.version,
          `AI ${run.agent} · ${run.model}`,
        );
        for (const i of b.indices)
          db()
            .prepare(
              "UPDATE agent_suggestions SET status='accepted' WHERE run_id=? AND operation_index=?",
            )
            .run(b.runId, stored.originalIndices?.[i] ?? i);
        const remainingIndices = patch.operations
          .map((_, i) => i)
          .filter((i) => !b.indices.includes(i));
        const independent = ops.every(
          (op) =>
            op.op === "replace" &&
            !remainingIndices.some(
              (i) =>
                patch.operations[i].path === op.path ||
                patch.operations[i].path.startsWith(op.path + "/") ||
                op.path.startsWith(patch.operations[i].path + "/"),
            ),
        );
        const remainingPatch =
          independent && remainingIndices.length
            ? {
                ...patch,
                operations: remainingIndices.map((i) => patch.operations[i]),
                ideas: [],
              }
            : undefined;
        db()
          .prepare("UPDATE agent_runs SET result=? WHERE id=?")
          .run(
            JSON.stringify({
              patch: remainingPatch ?? { ...patch, operations: [] },
              version: saved.version,
              originalIndices: remainingIndices.map(
                (i) => stored.originalIndices?.[i] ?? i,
              ),
            }),
            b.runId,
          );
        return { ...saved, remainingPatch };
      })();
      return json(applied);
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    const message =
      error instanceof Error && error.name.startsWith("YAML")
        ? "作者文本解析失败，请检查 YAML 语法"
        : error instanceof z.ZodError
          ? "输入数据不符合 Schema"
          : error instanceof SyntaxError
            ? "无效 JSON"
            : error instanceof Error
              ? error.message
              : "请求失败";
    const safe =
      /Provider HTTP|Provider 连接|APP_SECRET|项目|版本|Patch|PNG|metadata|格式|文件|导出|请选择|不支持|超过|仅支持|建议|Revision|资源|图片|Agent run|operation|Schema|JSON|缺少/.test(
        message,
      )
        ? message
        : "请求失败，请检查输入与服务配置";
    return json(
      { error: safe },
      message.includes("冲突") || message.includes("过期") ? 409 : 400,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
