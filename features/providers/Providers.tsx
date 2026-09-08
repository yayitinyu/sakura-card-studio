"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Star, X } from "lucide-react";
import { api } from "@/lib/client";
import {
  providerSchema,
  type Provider,
} from "@/lib/ai/providers/openai-compatible";
import { ModelIcon } from "./ModelIcon";
export default function Providers({
  onClose,
  onChange,
}: {
  onClose: () => void;
  onChange: () => void;
}) {
  const [all, setAll] = useState<(Provider & { keyMask: string })[]>([]);
  const [config, setConfig] = useState<Provider>(
    providerSchema.parse({
      name: "OpenAI Compatible",
      baseUrl: "https://api.openai.com/v1",
    }),
  );
  const [key, setKey] = useState("");
  const [mask, setMask] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("providers")
      .then(setAll)
      .catch((e) => setStatus(e.message));
  }, []);
  function field(k: keyof Provider, v: unknown) {
    setConfig({ ...config, [k]: v });
  }
  async function save(deleteKey = false) {
    const saved = await api("providers", "POST", {
      config,
      apiKey: key || undefined,
      deleteKey,
    });
    setConfig(saved);
    setMask(saved.keyMask);
    setKey("");
    setAll(await api("providers"));
    onChange();
    return saved;
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal provider-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI Providers"
      >
        <header>
          <div>
            <h2>AI Providers</h2>
            <p>模型连接与偏好</p>
          </div>
          <button aria-label="关闭设置" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="provider-layout">
          <nav>
            {all.map((p) => (
              <button
                className={p.id === config.id ? "active" : ""}
                key={p.id}
                onClick={() => {
                  setConfig(p);
                  setMask(p.keyMask);
                  setKey("");
                  setModels([]);
                }}
              >
                <ModelIcon model={p.model} provider={p.name} />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => {
                setConfig(
                  providerSchema.parse({
                    name: "新 Provider",
                    baseUrl: "http://localhost:11434/v1",
                  }),
                );
                setMask("");
                setKey("");
                setModels([]);
              }}
            >
              <Plus />
              添加 Provider
            </button>
          </nav>
          <div className="provider-fields">
            <div className="two-col">
              <label>
                名称
                <input
                  value={config.name}
                  onChange={(e) => field("name", e.target.value)}
                />
              </label>
              <label>
                Base URL
                <input
                  value={config.baseUrl}
                  onChange={(e) => field("baseUrl", e.target.value)}
                />
              </label>
            </div>
            <label>
              API Key {mask && <span className="muted">{mask}</span>}
              <input
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  mask ? "更新密钥" : "输入 API Key（本地 Ollama 可留空）"
                }
              />
            </label>
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await save(true);
                    setStatus("密钥已删除");
                  })
                }
              >
                删除密钥
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const p = await save();
                    await api(`providers/${p.id}/test`, "POST");
                    setStatus("连接成功");
                  })
                }
              >
                测试连接
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const p = await save();
                    setModels(await api(`providers/${p.id}/models`));
                  })
                }
              >
                <RefreshCw />
                获取模型
              </button>
            </div>
            <div className="two-col">
              <label>
                模型 / 默认模型
                <input
                  value={config.defaultModel || config.model}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      model: e.target.value,
                      defaultModel: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Temperature
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => field("temperature", Number(e.target.value))}
                />
              </label>
              <label>
                Max Tokens
                <input
                  type="number"
                  min="256"
                  max="65536"
                  value={config.maxTokens}
                  onChange={(e) => field("maxTokens", Number(e.target.value))}
                />
              </label>
            </div>
            <div className="button-row">
              {(["vision", "tools", "structuredOutput"] as const).map((k) => (
                <label className="check" key={k}>
                  <input
                    type="checkbox"
                    checked={config[k]}
                    onChange={(e) => field(k, e.target.checked)}
                  />
                  {k === "structuredOutput" ? "JSON mode" : k}
                </label>
              ))}
            </div>
            <input
              aria-label="搜索模型"
              placeholder="搜索模型"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="models">
              {[...new Set([...config.favorites, ...config.recent, ...models])]
                .filter((m) => m.toLowerCase().includes(query.toLowerCase()))
                .map((m) => (
                  <div key={m}>
                    <button
                      onClick={() =>
                        setConfig({ ...config, model: m, defaultModel: m })
                      }
                    >
                      <ModelIcon model={m} />
                      <span>{m}</span>
                      {config.defaultModel === m && <small>默认</small>}
                    </button>
                    <button
                      aria-label={`收藏 ${m}`}
                      onClick={() =>
                        field(
                          "favorites",
                          config.favorites.includes(m)
                            ? config.favorites.filter((x) => x !== m)
                            : [...config.favorites, m],
                        )
                      }
                    >
                      <Star
                        size={15}
                        fill={
                          config.favorites.includes(m) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                ))}
            </div>
            <p role="status">{busy ? "连接中…" : status}</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await save();
                  setStatus("已保存");
                })
              }
            >
              保存 Provider
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
