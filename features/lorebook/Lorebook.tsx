"use client";
import { useState } from "react";
import { useDialog } from "@/components/ui/Dialog";
import { Plus, BookOpen, Search } from "lucide-react";
import TokenInput from "@/components/ui/TokenInput";
import {
  entrySchema,
  estimateTokens,
  type Canonical,
} from "@/lib/schema/character";
export default function Lorebook({
  value,
  onChange,
}: {
  value: Canonical["lorebook"];
  onChange: (v: Canonical["lorebook"]) => void;
}) {
  const dialog = useDialog();
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const e = value.entries[selected];
  const update = (k: string, v: unknown) =>
    onChange({
      ...value,
      entries: value.entries.map((e, i) =>
        i === selected ? { ...e, [k]: v } : e,
      ),
    });
  return (
    <div className="lore-layout">
      <div className="lore-list">
        <div className="search">
          <Search />
          <input
            aria-label="搜索世界书"
            placeholder="搜索条目 / 标签"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
        </div>
        <button
          onClick={() => {
            onChange({
              ...value,
              entries: [
                ...value.entries,
                entrySchema.parse({ id: crypto.randomUUID(), name: "新条目" }),
              ],
            });
            setSelected(value.entries.length);
          }}
        >
          <Plus />
          新条目
        </button>
        {value.entries.map(
          (entry, i) =>
            (
              entry.name +
              " " +
              entry.keys.join(" ") +
              " " +
              entry.content +
              " " +
              JSON.stringify(entry.extensions.tags ?? "")
            )
              .toLowerCase()
              .includes(search.toLowerCase()) && (
              <button
                className={selected === i ? "active" : ""}
                key={i}
                onClick={() => setSelected(i)}
              >
                <BookOpen />
                <span>{entry.name || `条目 ${i + 1}`}</span>
                <small>{entry.enabled ? "" : "停用"}</small>
              </button>
            ),
        )}
      </div>
      {e ? (
        <div className="lore-editor">
          <div className="two-col">
            <label>
              条目名称
              <input
                value={e.name}
                onChange={(ev) => update("name", ev.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={e.enabled}
                onChange={(ev) => update("enabled", ev.target.checked)}
              />
              启用
            </label>
          </div>
          <label>
            关键词
            <TokenInput
              value={e.keys}
              onChange={(keys) => update("keys", keys)}
            />
          </label>
          <label>
            次要关键词
            <TokenInput
              value={e.secondary_keys}
              onChange={(keys) => update("secondary_keys", keys)}
            />
          </label>
          <div className="two-col">
            <label>
              插入位置
              <select
                value={Number(
                  e.extensions.position ??
                    (e.position === "before_char" ? 0 : 1),
                )}
                onChange={(ev) =>
                  onChange({
                    ...value,
                    entries: value.entries.map((entry, i) =>
                      i === selected
                        ? {
                            ...entry,
                            position:
                              Number(ev.target.value) === 0
                                ? "before_char"
                                : "after_char",
                            extensions: {
                              ...entry.extensions,
                              position: Number(ev.target.value),
                            },
                          }
                        : entry,
                    ),
                  })
                }
              >
                {[
                  "角色定义之前",
                  "角色定义之后",
                  "Author Note 之前",
                  "Author Note 之后",
                  "聊天深度",
                  "示例对话之前",
                  "示例对话之后",
                  "Outlet",
                ].map((label, i) => (
                  <option value={i} key={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              顺序
              <input
                type="number"
                value={e.insertion_order}
                onChange={(ev) =>
                  update("insertion_order", Number(ev.target.value))
                }
              />
            </label>
            <label>
              概率 %
              <input
                type="number"
                min="0"
                max="100"
                value={Number(e.extensions.probability ?? 100)}
                onChange={(ev) =>
                  update("extensions", {
                    ...e.extensions,
                    probability: Math.max(
                      0,
                      Math.min(100, Number(ev.target.value)),
                    ),
                    useProbability: true,
                  })
                }
              />
            </label>
            <label>
              次要关键词逻辑
              <select
                value={Number(e.extensions.selectiveLogic ?? 0)}
                onChange={(ev) =>
                  update("extensions", {
                    ...e.extensions,
                    selectiveLogic: Number(ev.target.value),
                  })
                }
              >
                <option value="0">AND ANY</option>
                <option value="1">NOT ALL</option>
                <option value="2">NOT ANY</option>
                <option value="3">AND ALL</option>
              </select>
            </label>
          </div>
          <details>
            <summary>高级插入设置</summary>
            <label>
              深度
              <input
                type="number"
                min="0"
                value={Number(e.extensions.depth ?? 4)}
                onChange={(ev) =>
                  update("extensions", {
                    ...e.extensions,
                    depth: Number(ev.target.value),
                  })
                }
              />
            </label>
            <label>
              Outlet
              <input
                value={String(e.extensions.outlet_name ?? "")}
                onChange={(ev) =>
                  update("extensions", {
                    ...e.extensions,
                    outlet_name: ev.target.value,
                  })
                }
              />
            </label>
          </details>
          <div className="button-row">
            {(["constant", "selective", "use_regex"] as const).map((k) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={e[k]}
                  onChange={(ev) => update(k, ev.target.checked)}
                />
                {k}
              </label>
            ))}
          </div>
          <label>
            标签
            <TokenInput
              value={
                Array.isArray(e.extensions.tags)
                  ? e.extensions.tags.filter(
                      (v): v is string => typeof v === "string",
                    )
                  : []
              }
              onChange={(tags) =>
                update("extensions", { ...e.extensions, tags })
              }
            />
          </label>
          <label>
            内容 <small>≈ {estimateTokens(e.content)} tokens</small>
            <textarea
              rows={13}
              value={e.content}
              onChange={(ev) => update("content", ev.target.value)}
            />
          </label>
          <details>
            <summary>原始扩展</summary>
            <pre>{JSON.stringify(e.extensions, null, 2)}</pre>
          </details>
          <button
            className="danger"
            onClick={async () => {
              if (await dialog.confirm("删除此世界书条目？可从历史恢复。")) {
                onChange({
                  ...value,
                  entries: value.entries.filter((_, i) => i !== selected),
                });
                setSelected(0);
              }
            }}
          >
            删除条目
          </button>
        </div>
      ) : (
        <div className="empty">
          <BookOpen size={32} />
          <h3>让世界随故事展开</h3>
          <p>创建第一条动态设定</p>
        </div>
      )}
    </div>
  );
}
