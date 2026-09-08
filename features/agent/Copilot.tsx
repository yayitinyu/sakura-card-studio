"use client";
import { useEffect, useState } from "react";
import { Sparkles, Check, X, Settings2, FileSearch } from "lucide-react";
import { api } from "@/lib/client";
import { roles, type AgentName } from "@/lib/ai/prompts";
import { buildContext } from "@/lib/ai/agents/context";
import { estimateTokens, type Canonical } from "@/lib/schema/character";
import type { Patch } from "@/lib/ai/patch";
import type { Provider } from "@/lib/ai/providers/openai-compatible";
import type { Project } from "@/lib/server/db";
import { ModelIcon } from "@/features/providers/ModelIcon";
const names: Record<AgentName, string> = {
  EvidenceExtraction: "事实提取",
  CharacterArchitect: "人物架构师",
  WorldArchitect: "世界架构师",
  LorebookArchitect: "世界书架构师",
  GreetingDirector: "开场导演",
  DialogueDesigner: "对话设计师",
  ConsistencyReviewer: "一致性审阅",
  ImageAnalyst: "图片分析",
};
export default function Copilot({
  project,
  canonical,
  ensureSaved,
  onApply,
  onSettings,
  providerVersion,
}: {
  project: Project;
  canonical: Canonical;
  ensureSaved: () => Promise<Project>;
  onApply: (p: Project) => void;
  onSettings: () => void;
  providerVersion: number;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [agent, setAgent] = useState<AgentName>("CharacterArchitect");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [patch, setPatch] = useState<Patch>();
  const [runId, setRunId] = useState("");
  const [version, setVersion] = useState(0);
  const [accepted, setAccepted] = useState<number[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [rawModels, setRawModels] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  useEffect(() => {
    api<Provider[]>("providers")
      .then((p) => {
        setProviders(p);
        if (p.length) {
          const selected = p.find((x) => x.id === providerId) ?? p[0];
          setProviderId(selected.id);
          setModel(selected.defaultModel || selected.model);
        }
      })
      .catch((e) => setError(e.message));
  }, [providerVersion]);
  useEffect(() => {
    setPatch(undefined);
    api(`assets/${project.id}`)
      .then(setAssets)
      .catch((e) => setError(e.message));
  }, [project.id, agent]);
  const context = buildContext(canonical, agent, input);
  const provider = providers.find((p) => p.id === providerId);
  async function run(text = input) {
    setBusy(true);
    setError("");
    setPatch(undefined);
    setEdits({});
    try {
      const saved = await ensureSaved();
      setVersion(saved.version);
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          version: saved.version,
          providerId,
          model,
          agent,
          input: text,
          assetId: agent === "ImageAnalyst" ? assetId || undefined : undefined,
        }),
      });
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.error);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        let i;
        while ((i = pending.indexOf("\n\n")) !== -1) {
          const event = pending.slice(0, i);
          pending = pending.slice(i + 2);
          const line = event.split("\n").find((s) => s.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (event.startsWith("event: error")) throw new Error(data.error);
          if (event.startsWith("event: result")) {
            setPatch(data.patch);
            setRunId(data.runId);
            setAccepted(
              data.patch.operations.map((_: unknown, i: number) => i),
            );
          }
        }
        if (done) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply(
    indices = accepted,
    greetingTarget: "main" | "alternate" = "main",
  ) {
    setBusy(true);
    try {
      const saved = await ensureSaved();
      if (saved.version !== version)
        throw new Error("内容已改变，请重新生成建议以避免覆盖新编辑");
      const result = await api("patch", "POST", {
        projectId: project.id,
        version,
        runId,
        indices,
        edits,
        greetingTarget,
      });
      onApply(result);
      setVersion(result.version);
      setEdits({});
      setPatch(result.remainingPatch);
      setAccepted(
        result.remainingPatch?.operations.map((_: unknown, i: number) => i) ??
          [],
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reject(indices: number[]) {
    setBusy(true);
    setError("");
    try {
      const result = await api("patch", "POST", {
        projectId: project.id,
        version,
        runId,
        indices,
        action: "reject",
      });
      setPatch(result.remainingPatch);
      setAccepted(
        result.remainingPatch?.operations.map((_: unknown, i: number) => i) ??
          [],
      );
      setEdits({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="copilot">
      <div className="inspector-tabs">
        <span className="selected">
          <Sparkles />
          AI Copilot
        </span>
        <button aria-label="AI 设置" onClick={onSettings}>
          <Settings2 />
        </button>
      </div>
      <div className="copilot-body">
        <label>
          创作阶段
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value as AgentName)}
          >
            {Object.keys(roles).map((k) => (
              <option key={k} value={k}>
                {names[k as AgentName]}
              </option>
            ))}
          </select>
        </label>
        {agent === "LorebookArchitect" && (
          <details>
            <summary>世界书操作</summary>
            <div className="button-row">
              {[
                "创建条目",
                "拆分条目",
                "合并条目",
                "优化关键词",
                "压缩内容",
                "检查重复设定",
                "将人物设定移入世界书",
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => setInput(action + "。" + input)}
                >
                  {action}
                </button>
              ))}
            </div>
          </details>
        )}
        <label>
          Provider
          <select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              const p = providers.find((p) => p.id === e.target.value);
              setModel(p?.defaultModel || p?.model || "");
              setRawModels([]);
            }}
          >
            <option value="">选择 Provider</option>
            {providers.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型
          <div className="model-input">
            <ModelIcon model={model} provider={provider?.name} />
            <input
              aria-label="AI 模型"
              list="agent-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <datalist id="agent-models">
            {[
              ...new Set([
                ...(provider?.favorites ?? []),
                ...(provider?.recent ?? []),
                ...rawModels,
              ]),
            ].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        {provider && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                setRawModels(await api(`providers/${provider.id}/models`));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            刷新模型列表
          </button>
        )}
        <label>
          {agent === "GreetingDirector" ? "开场要求" : "人物灵感 / 创作要求"}
          <textarea
            rows={5}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="一段灵感，让故事从这里开始。"
          />
        </label>
        {agent === "ImageAnalyst" && (
          <label>
            人物图片
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">选择已上传的图片</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="primary full"
          disabled={
            busy ||
            !providerId ||
            !model ||
            (agent === "ImageAnalyst" && !assetId)
          }
          onClick={() => run()}
        >
          <Sparkles />
          {busy ? "正在构思…" : "生成建议"}
        </button>
        {!providers.length && (
          <button className="text-button" onClick={onSettings}>
            配置第一个 AI Provider
          </button>
        )}
        <p className="error" role="alert">
          {error}
        </p>
        <details className="context-preview">
          <summary>
            <FileSearch />
            上下文预览{" "}
            <small>
              ≈ {estimateTokens(context) + estimateTokens(input)} tokens
            </small>
          </summary>
          <pre>{JSON.stringify({ context, input }, null, 2)}</pre>
        </details>
        {patch ? (
          <div className="suggestions">
            <div className="section-label">建议与审阅</div>
            {patch.report && <p className="report">{patch.report}</p>}
            {(
              [
                "confirmedFacts",
                "userIntent",
                "unknownInformation",
                "contradictions",
                "visibleFacts",
                "possibleInterpretation",
                "creativeSuggestions",
              ] as const
            ).map(
              (k) =>
                patch[k]?.length > 0 && (
                  <details open key={k}>
                    <summary>
                      {
                        {
                          confirmedFacts: "已确认事实",
                          userIntent: "作者意图",
                          unknownInformation: "未知信息",
                          contradictions: "可能矛盾",
                          visibleFacts: "可见事实",
                          possibleInterpretation: "可能解读",
                          creativeSuggestions: "创作建议",
                        }[k]
                      }
                    </summary>
                    <ul>
                      {patch[k].map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </details>
                ),
            )}
            {patch.ideas.map((idea, i) => (
              <section className="idea" key={i}>
                <h3>{idea.title}</h3>
                <p>{idea.situation}</p>
                <dl>
                  {Object.entries(idea)
                    .filter(([k]) => !["title", "situation"].includes(k))
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(input + "\nSELECTED_IDEA: " + JSON.stringify(idea))
                  }
                >
                  使用此构思
                </button>
              </section>
            ))}
            {patch.operations.map((op, i) => (
              <section className="patch-operation" key={i}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={accepted.includes(i)}
                    onChange={(e) =>
                      setAccepted(
                        e.target.checked
                          ? [...accepted, i]
                          : accepted.filter((n) => n !== i),
                      )
                    }
                  />
                  <code>{op.path}</code>
                </label>
                <p>{op.reason}</p>
                <details open>
                  <summary>Before / After</summary>
                  <pre className="before">
                    {JSON.stringify(
                      op.path
                        .split("/")
                        .slice(1)
                        .reduce((v: any, k) => v?.[k], canonical),
                      null,
                      2,
                    ) ?? "∅"}
                  </pre>
                  <pre className="after">
                    {JSON.stringify(
                      Object.hasOwn(edits, String(i))
                        ? edits[String(i)]
                        : op.value,
                      null,
                      2,
                    ) ?? "移除"}
                  </pre>
                  {typeof op.value === "string" && (
                    <label>
                      编辑建议
                      <textarea
                        rows={5}
                        value={String(edits[String(i)] ?? op.value)}
                        onChange={(e) =>
                          setEdits({ ...edits, [String(i)]: e.target.value })
                        }
                      />
                    </label>
                  )}
                </details>
                <div className="button-row">
                  <button disabled={busy} onClick={() => apply([i])}>
                    <Check />
                    应用
                  </button>
                  {op.path === "/greetings/main" && (
                    <button
                      disabled={busy}
                      onClick={() => apply([i], "alternate")}
                    >
                      添加为备用开场白
                    </button>
                  )}
                  <button disabled={busy} onClick={() => reject([i])}>
                    <X />
                    拒绝
                  </button>
                </div>
              </section>
            ))}
            {patch.operations.length > 0 && (
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !accepted.length}
                  onClick={() => apply()}
                >
                  应用所选 ({accepted.length})
                </button>
                <button
                  onClick={() => setAccepted(patch.operations.map((_, i) => i))}
                >
                  全选
                </button>
                <button
                  disabled={busy}
                  onClick={() => reject(patch.operations.map((_, i) => i))}
                >
                  全部拒绝
                </button>
              </div>
            )}
            <button disabled={busy} onClick={() => run()}>
              重新生成
            </button>
          </div>
        ) : (
          !busy && (
            <div className="copilot-empty">
              <Sparkles size={32} />
              <h3>为灵感留一点空间</h3>
              <p>建议先预览，由你决定写入。</p>
            </div>
          )
        )}
      </div>
    </aside>
  );
}
