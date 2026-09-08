"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Flower2,
  Plus,
  Upload,
  Download,
  Eye,
  Settings2,
  BookOpen,
  UserRound,
  Globe2,
  History as HistoryIcon,
  MessageSquare,
  Terminal,
  Image as ImageIcon,
  ChevronLeft,
  Check,
  Sun,
  Moon,
  Monitor,
  Search,
  Files,
  Archive,
  MoreHorizontal,
  PanelLeft,
  Code2,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/client";
import { DialogProvider, useDialog } from "@/components/ui/Dialog";
import {
  emptyCharacter,
  worldSchema,
  estimateTokens,
  validateCharacter,
  type Canonical,
} from "@/lib/schema/character";
import type { Project } from "@/lib/server/db";
import type { Format } from "@/lib/codecs/author";
import { compileDescription } from "@/lib/codecs/card";
import Providers from "@/features/providers/Providers";
import Copilot from "@/features/agent/Copilot";
import Lorebook from "@/features/lorebook/Lorebook";
import History from "@/features/history/History";
import CharacterEditor, {
  characterFields as fields,
} from "@/features/character/CharacterEditor";
import WorldEditor from "@/features/world/WorldEditor";
import GreetingsEditor from "@/features/character/GreetingsEditor";
const CodeEditor = dynamic(
  () => import("./CodeEditor").then((m) => m.CodeEditor),
  { ssr: false },
);
const sections = [
  ["character", "人物设定", UserRound],
  ["scenario", "情境", Globe2],
  ["greetings", "开场白", MessageSquare],
  ["world", "世界观", Globe2],
  ["lorebook", "世界书", BookOpen],
  ["prompt", "Prompt", Terminal],
  ["assets", "资源", ImageIcon],
  ["history", "历史记录", HistoryIcon],
] as const;

export default function StudioRoot() {
  return (
    <DialogProvider>
      <Studio />
    </DialogProvider>
  );
}
function Studio() {
  const dialog = useDialog();
  const [list, setList] = useState<any[]>([]);
  const [project, setProject] = useState<Project>();
  const [c, setC] = useState<Canonical>(emptyCharacter());
  const [section, setSection] = useState("character");
  const [view, setView] = useState("structured");
  const [format, setFormat] = useState<Format>("markdown");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [providerVersion, setProviderVersion] = useState(0);
  const [theme, setTheme] = useState("system");
  const [effectiveTheme, setEffectiveTheme] = useState("light");
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [tab, setTab] = useState("editor");
  const [assets, setAssets] = useState<any[]>([]);
  const [exportFormat, setExportFormat] = useState("json");
  const [exportVersion, setExportVersion] = useState("3");
  const current = useRef<{
    project?: Project;
    c: Canonical;
    dirty: boolean;
    sourceDirty: boolean;
    source: string;
    format: Format;
  }>({ c, dirty: false, sourceDirty: false, source: "", format: "markdown" });
  const saving = useRef<Promise<Project> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = () =>
    api("projects")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
    setTheme(localStorage.getItem("sakura.theme") ?? "system");
  }, []);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const t = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = t;
      setEffectiveTheme(t);
    };
    update();
    mq.addEventListener("change", update);
    localStorage.setItem("sakura.theme", theme);
    return () => mq.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (current.current.dirty || current.current.sourceDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function loaded(p: Project) {
    current.current = {
      project: p,
      c: p.canonical,
      dirty: false,
      sourceDirty: false,
      source: p.canonical.author.source,
      format: p.canonical.author.format,
    };
    setProject(p);
    setC(p.canonical);
    setSource(p.canonical.author.source);
    setFormat(p.canonical.author.format);
    setStatus("Saved");
    setView("structured");
    setError("");
    api(`assets/${p.id}`)
      .then(setAssets)
      .catch((e) => setError(e.message));
  }
  function schedule() {
    setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      ensureSaved().catch((e) => setError(e.message));
    }, 800);
  }
  function change(value: Canonical) {
    current.current.c = value;
    current.current.dirty = true;
    setC(value);
    schedule();
  }
  async function ensureSaved(): Promise<Project> {
    if (saving.current) {
      await saving.current;
      return ensureSaved();
    }
    const state = current.current;
    if (!state.project) throw new Error("未选择项目");
    if (!state.dirty && !state.sourceDirty) return state.project;
    const task = (async () => {
      try {
        const snapshot = state.c;
        let next = snapshot;
        const sourceSnapshot = state.source;
        const sourceDirty = state.sourceDirty;
        if (sourceDirty) {
          next = (
            await api("codec", "POST", {
              canonical: next,
              format: state.format,
              source: sourceSnapshot,
            })
          ).canonical;
        }
        const saved = await api<Project>(
          `projects/${state.project!.id}`,
          "PUT",
          {
            canonical: next,
            version: state.project!.version,
            source: sourceDirty ? "Author source edit" : "Manual edit",
          },
        );
        current.current.project = saved;
        setProject(saved);
        if (
          current.current.c === snapshot &&
          current.current.source === sourceSnapshot
        ) {
          current.current.c = saved.canonical;
          current.current.dirty = false;
          current.current.sourceDirty = false;
          setC(saved.canonical);
          setStatus("Saved");
        } else setStatus("Saving…");
        return saved;
      } catch (e) {
        setStatus("Save failed");
        throw e;
      }
    })();
    saving.current = task;
    try {
      await task;
    } finally {
      saving.current = null;
    }
    if (current.current.dirty || current.current.sourceDirty)
      return ensureSaved();
    return current.current.project!;
  }
  async function perform(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function open(id: string) {
    await perform(async () => {
      if (current.current.project) await ensureSaved();
      loaded(await api(`projects/${id}`));
      setSection("character");
      setTab("editor");
    });
  }
  async function newProject() {
    const name = await dialog.ask("新建项目", "未命名角色");
    if (!name?.trim()) return;
    await perform(async () => {
      if (current.current.project) await ensureSaved();
      loaded(await api("projects", "POST", { name }));
      refresh();
    });
  }
  async function importFile(file: File) {
    await perform(async () => {
      if (current.current.project) await ensureSaved();
      const form = new FormData();
      form.set("file", file);
      const data = await api("import", "POST", form);
      loaded(data.project);
      setError(data.warnings.join("；"));
      refresh();
    });
  }
  async function switchView(next: string) {
    await perform(async () => {
      const p = await ensureSaved();
      if (next === "source") {
        const result = await api("codec", "POST", {
          canonical: p.canonical,
          format,
        });
        current.current.source = result.source;
        setSource(result.source);
      }
      setView(next);
    });
  }
  async function switchFormat(next: Format) {
    await perform(async () => {
      const p = await ensureSaved();
      const result = await api("codec", "POST", {
        canonical: p.canonical,
        format: next,
      });
      current.current.format = next;
      current.current.source = result.source;
      setFormat(next);
      setSource(result.source);
      const value = {
        ...p.canonical,
        author: { format: next, source: result.source },
      };
      const saved = await api<Project>(`projects/${p.id}`, "PUT", {
        canonical: value,
        version: p.version,
        source: "Format Conversion",
      });
      current.current.project = saved;
      current.current.c = value;
      setProject(saved);
      setC(value);
    });
  }
  function charField(k: string, v: unknown) {
    change({ ...c, character: { ...c.character, [k]: v } });
  }
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    rows = 5,
  ) => (
    <label className="writing-field" key={label}>
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  async function download() {
    await perform(async () => {
      const p = await ensureSaved();
      const r = await fetch(
        `/api/export/${p.id}?format=${exportFormat}&version=${exportVersion}`,
      );
      if (!r.ok) throw new Error((await r.json()).error);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.canonical.character.name}.${exportFormat === "markdown" ? "md" : exportFormat}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }
  const preview = (
    <div className="document preview">
      <h1>Prompt 组成预览</h1>
      <p className="muted">Estimate · 不模拟 SillyTavern 完整激活引擎</p>
      {[
        ["常驻人物", compileDescription(c) + "\n" + c.character.personality],
        ["情境", c.scenario],
        ["开场白", c.greetings.main],
        ["示例对话", c.character.exampleDialogue],
        ["System Prompt", c.prompt.system],
        ["Post History Instructions", c.prompt.postHistory],
        [
          "动态世界书",
          c.lorebook.entries
            .filter((e) => e.enabled)
            .map((e) => `[${e.name}] ${e.keys.join(", ")}\n${e.content}`)
            .join("\n\n"),
        ],
      ].map(([name, value]) => (
        <section key={name}>
          <h3>
            {name}
            <small>≈ {estimateTokens(value)} tokens</small>
          </h3>
          <pre>{value || "—"}</pre>
        </section>
      ))}
      <h3>兼容检查</h3>
      {validateCharacter(c).map((w, i) => (
        <p key={i}>{w}</p>
      ))}
      <div className="export-controls">
        <select
          aria-label="导出格式"
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
        >
          <option value="json">Character Card JSON</option>
          <option value="png">Character Card PNG</option>
          <option value="markdown">Markdown</option>
          <option value="yaml">YAML</option>
          <option value="xml">XML wrapped Markdown</option>
        </select>
        <select
          aria-label="卡片版本"
          value={exportVersion}
          onChange={(e) => setExportVersion(e.target.value)}
        >
          <option value="3">CC V3</option>
          <option value="2">CC V2（PNG 始终双版本）</option>
        </select>
        <button className="primary" onClick={download}>
          <Download />
          导出文件
        </button>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() =>
            perform(async () => {
              if (current.current.project) await ensureSaved();
              setProject(undefined);
              current.current.project = undefined;
              refresh();
            })
          }
        >
          <Flower2 />
          <span>Sakura Card Studio</span>
        </button>
        {project && (
          <>
            <span className="divider" />
            <button
              className="project-title"
              onClick={() =>
                perform(async () => {
                  await ensureSaved();
                  const name = await dialog.ask("重命名项目", project.name);
                  if (name?.trim()) {
                    const p = await api(`projects/${project.id}`, "PATCH", {
                      name,
                    });
                    current.current.project = p;
                    setProject(p);
                    refresh();
                  }
                })
              }
            >
              {project.name}
            </button>
            <span className="saved">
              <Check size={14} />
              {status}
            </span>
            <div className="top-actions">
              <button
                onClick={() => {
                  setSection("preview");
                  setTab("editor");
                }}
              >
                <Eye />
                预览
              </button>
              <button
                className="accent"
                onClick={() => {
                  setSection("preview");
                  setTab("editor");
                }}
              >
                <Download />
                导出
              </button>
            </div>
          </>
        )}
        <button
          className="theme"
          aria-label="切换主题"
          onClick={() =>
            setTheme(
              theme === "light"
                ? "dark"
                : theme === "dark"
                  ? "system"
                  : "light",
            )
          }
        >
          {theme === "light" ? (
            <Sun />
          ) : theme === "dark" ? (
            <Moon />
          ) : (
            <Monitor />
          )}
        </button>
        <button aria-label="设置" onClick={() => setSettings(true)}>
          <Settings2 />
        </button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {!project ? (
        <main className="library">
          <div className="library-heading">
            <div>
              <p className="muted">你的创作空间</p>
              <h1>故事，从一个人开始。</h1>
            </div>
            <button className="primary" onClick={newProject}>
              <Plus />
              新建项目
            </button>
          </div>
          <div className="library-tools">
            <div className="search">
              <Search />
              <input
                placeholder="搜索项目"
                aria-label="搜索项目"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className={archived ? "active" : ""}
              onClick={() => setArchived(!archived)}
            >
              <Archive />
              {archived ? "已归档" : "最近项目"}
            </button>
            <label className="button">
              <Upload />
              导入角色卡
              <input
                hidden
                type="file"
                accept=".png,.json,.md,.yaml,.yml,.xml,.txt"
                onChange={(e) => {
                  if (e.target.files?.[0]) importFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="projects-list">
            {list
              .filter(
                (p) =>
                  Boolean(p.archived) === archived &&
                  p.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((p) => (
                <article key={p.id}>
                  <button className="project-open" onClick={() => open(p.id)}>
                    <div className="project-monogram">{p.name.slice(0, 1)}</div>
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {new Date(p.updated_at).toLocaleString()} · Revision{" "}
                        {p.version}
                      </p>
                    </div>
                  </button>
                  <details className="project-menu">
                    <summary aria-label={`${p.name} 项目操作`}>
                      <MoreHorizontal />
                    </summary>
                    <div>
                      <button
                        onClick={() =>
                          perform(async () => {
                            await api(`projects/${p.id}/duplicate`, "POST");
                            refresh();
                          })
                        }
                      >
                        <Files />
                        复制
                      </button>
                      <button
                        onClick={() =>
                          perform(async () => {
                            await api(`projects/${p.id}`, "PATCH", {
                              archived: !p.archived,
                            });
                            refresh();
                          })
                        }
                      >
                        <Archive />
                        {p.archived ? "取消归档" : "归档"}
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          if (
                            await dialog.confirm(
                              `永久删除「${p.name}」及历史和资源？`,
                            )
                          )
                            perform(async () => {
                              await api(`projects/${p.id}`, "DELETE");
                              refresh();
                            });
                        }}
                      >
                        删除项目
                      </button>
                    </div>
                  </details>
                </article>
              ))}
          </div>
          {!list.length && (
            <div className="library-empty">
              <NotebookPen size={42} />
              <h2>把零散灵感，写成鲜活角色。</h2>
              <p>自由书写 · AI 共创 · 世界书 · SillyTavern 角色卡</p>
              <button onClick={newProject}>创建第一个项目</button>
            </div>
          )}
          <footer>
            SAKURA CARD STUDIO{" "}
            <span>Made for the stories only you can tell.</span>
          </footer>
        </main>
      ) : (
        <>
          <div className={`workspace mobile-${tab}`}>
            <nav className="outline">
              <button
                className="back"
                onClick={() =>
                  perform(async () => {
                    await ensureSaved();
                    setProject(undefined);
                    current.current.project = undefined;
                    refresh();
                  })
                }
              >
                <ChevronLeft />
                所有项目
              </button>
              <div className="section-label">项目大纲</div>
              {sections.map(([id, label, Icon]) => (
                <div key={id}>
                  <button
                    className={section === id ? "active" : ""}
                    onClick={() =>
                      perform(async () => {
                        await ensureSaved();
                        setSection(id);
                        setTab("editor");
                      })
                    }
                  >
                    <Icon />
                    {label}
                    {id === "lorebook" && (
                      <small>{c.lorebook.entries.length}</small>
                    )}
                  </button>
                  {id === "character" && section === "character" && (
                    <div className="sub-outline">
                      {Object.entries(fields)
                        .filter(([k]) =>
                          [
                            "basic",
                            "appearance",
                            "personality",
                            "background",
                            "relationships",
                            "exampleDialogue",
                            "rules",
                          ].includes(k),
                        )
                        .map(([k, v]) => (
                          <button
                            key={k}
                            onClick={async () => {
                              await switchView("structured");
                              setTab("editor");
                              setTimeout(() => {
                                const element = document.getElementById(
                                  "field-" + k,
                                ) as HTMLDetailsElement | null;
                                if (element) {
                                  element.open = true;
                                  element.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                                }
                              }, 0);
                            }}
                          >
                            {v}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="outline-bottom">
                <label className="button">
                  <Upload />
                  导入
                  <input
                    hidden
                    type="file"
                    accept=".png,.json,.md,.yaml,.yml,.xml,.txt"
                    onChange={(e) => {
                      if (e.target.files?.[0]) importFile(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button onClick={() => setSettings(true)}>
                  <Settings2 />
                  设置
                </button>
              </div>
            </nav>
            <main className="editor-pane">
              <div className="editor-header">
                <div>
                  <h2>
                    {section === "preview"
                      ? "预览与导出"
                      : sections.find((s) => s[0] === section)?.[1]}
                  </h2>
                  <p>
                    {project.name} / {section}
                  </p>
                </div>
                {section === "character" && (
                  <select
                    aria-label="编辑格式"
                    value={format}
                    onChange={(e) => switchFormat(e.target.value as Format)}
                  >
                    {["markdown", "yaml", "json", "xml"].map((f) => (
                      <option key={f} value={f}>
                        {f === "xml" ? "XML + Markdown" : f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {section === "character" && (
                <div className="editor-tabs">
                  <button
                    className={view === "structured" ? "selected" : ""}
                    onClick={() => switchView("structured")}
                  >
                    <NotebookPen />
                    结构化
                  </button>
                  <button
                    className={view === "source" ? "selected" : ""}
                    onClick={() => switchView("source")}
                  >
                    <Code2 />
                    源码
                  </button>
                  <span>Character Card V3</span>
                </div>
              )}
              <div className="editor-content">
                {section === "character" ? (
                  view === "source" ? (
                    <CodeEditor
                      language={format === "xml" ? "xml" : format}
                      theme={effectiveTheme}
                      value={source}
                      onChange={(v) => {
                        current.current.source = v;
                        current.current.sourceDirty = true;
                        setSource(v);
                        schedule();
                      }}
                    />
                  ) : (
                    <CharacterEditor
                      character={c.character}
                      onChange={(character) => change({ ...c, character })}
                    />
                  )
                ) : section === "scenario" ? (
                  <div className="document">
                    <h1>此刻，故事发生在…</h1>
                    {field(
                      "情境",
                      c.scenario,
                      (v) => change({ ...c, scenario: v }),
                      20,
                    )}
                  </div>
                ) : section === "greetings" ? (
                  <GreetingsEditor
                    greetings={c.greetings}
                    onChange={(greetings) => change({ ...c, greetings })}
                  />
                ) : section === "world" ? (
                  <WorldEditor
                    worlds={c.worlds}
                    onChange={(worlds) => change({ ...c, worlds })}
                  />
                ) : section === "lorebook" ? (
                  <Lorebook
                    value={c.lorebook}
                    onChange={(l) => change({ ...c, lorebook: l })}
                  />
                ) : section === "prompt" ? (
                  <div className="document">
                    <h1>Prompt</h1>
                    {field(
                      "System Prompt",
                      c.prompt.system,
                      (v) =>
                        change({ ...c, prompt: { ...c.prompt, system: v } }),
                      10,
                    )}
                    {field(
                      "Post History Instructions",
                      c.prompt.postHistory,
                      (v) =>
                        change({
                          ...c,
                          prompt: { ...c.prompt, postHistory: v },
                        }),
                      10,
                    )}
                  </div>
                ) : section === "history" ? (
                  <History project={project} onRestore={loaded} />
                ) : section === "assets" ? (
                  <div className="document">
                    <h1>人物资源</h1>
                    <label className="button">
                      <Upload />
                      上传图片
                      <input
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            perform(async () => {
                              const form = new FormData();
                              form.set("file", f);
                              await api(`assets/${project.id}`, "POST", form);
                              setAssets(await api(`assets/${project.id}`));
                            });
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <div className="assets">
                      {assets.map((a) => (
                        <figure key={a.id}>
                          <img
                            src={`/api/assets/${project.id}/${a.id}`}
                            alt={a.name}
                          />
                          <figcaption>{a.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                    <p className="muted">
                      第一张图片用于 PNG 封面。图片分析在 AI Copilot 中进行。
                    </p>
                  </div>
                ) : (
                  preview
                )}
              </div>
            </main>
            <Copilot
              key={project.id}
              project={project}
              canonical={c}
              ensureSaved={ensureSaved}
              onApply={loaded}
              onSettings={() => setSettings(true)}
              providerVersion={providerVersion}
            />
          </div>
          <nav className="mobile-tabs">
            <button
              className={tab === "project" ? "active" : ""}
              onClick={() => setTab("project")}
            >
              <PanelLeft />
              项目
            </button>
            <button
              className={tab === "editor" && section !== "preview" ? "active" : ""}
              onClick={() => {
                if (section === "preview") setSection("character");
                setTab("editor");
              }}
            >
              <NotebookPen />
              编辑
            </button>
            <button
              className={tab === "ai" ? "active" : ""}
              onClick={() => setTab("ai")}
            >
              <Sparkles />
              AI
            </button>
            <button
              className={tab === "editor" && section === "preview" ? "active" : ""}
              onClick={() => {
                setSection("preview");
                setTab("editor");
              }}
            >
              <Eye />
              预览
            </button>
          </nav>
          <footer className="statusbar">
            <span>
              {section} · {status}
            </span>
            <span>
              {format.toUpperCase()} <i /> UTF-8 <i /> ≈{" "}
              {estimateTokens(compileDescription(c)) +
                estimateTokens(c.character.personality)}{" "}
              character tokens <i /> {validateCharacter(c).length} warnings
            </span>
          </footer>
        </>
      )}
      {settings && (
        <Providers
          onClose={() => setSettings(false)}
          onChange={() => setProviderVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
