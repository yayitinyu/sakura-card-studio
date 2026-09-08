"use client";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";
let ready: Promise<void> | undefined;
function setup() {
  return (ready ??= new Promise<void>((resolve, reject) => {
    const w = window as unknown as {
      MonacoEnvironment: unknown;
      SakuraMonaco: typeof import("monaco-editor");
    };
    w.MonacoEnvironment = {
      getWorkerUrl: (_: string, label: string) =>
        `/editor/${label === "json" ? "json" : label === "css" || label === "scss" || label === "less" ? "css" : label === "html" || label === "handlebars" || label === "razor" ? "html" : label === "typescript" || label === "javascript" ? "ts" : "editor"}.worker.js`,
    };
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/editor/monaco.css";
    document.head.append(link);
    const script = document.createElement("script");
    script.src = "/editor/monaco.js";
    script.onload = () => {
      loader.config({ monaco: w.SakuraMonaco });
      resolve();
    };
    script.onerror = () =>
      reject(new Error("Monaco 资源加载失败，请重新加载页面"));
    document.head.append(script);
  }));
}
function useMonaco() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    setup()
      .then(() => setState("ready"))
      .catch((e) => setState(e.message));
  }, []);
  return state;
}
export function CodeEditor({
  value,
  onChange,
  language = "markdown",
  theme = "light",
}: {
  value: string;
  onChange: (s: string) => void;
  language?: string;
  theme?: string;
}) {
  const state = useMonaco();
  return state !== "ready" ? (
    <p role="status">{state === "loading" ? "加载编辑器…" : state}</p>
  ) : (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme={theme === "dark" ? "vs-dark" : "light"}
      onChange={(v) => onChange(v ?? "")}
      options={{
        fontFamily: '"Cascadia Code", "Noto Sans Mono", Consolas, monospace',
        fontSize: 14,
        lineHeight: 25,
        minimap: { enabled: false },
        wordWrap: "on",
        padding: { top: 22, bottom: 30 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderLineHighlight: "gutter",
        tabSize: 2,
      }}
    />
  );
}
export function CodeDiff({ before, after }: { before: string; after: string }) {
  const state = useMonaco();
  return state !== "ready" ? (
    <p>{state === "loading" ? "加载 Diff…" : state}</p>
  ) : (
    <DiffEditor
      height="330px"
      language="json"
      original={before}
      modified={after}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        renderSideBySide: false,
        automaticLayout: true,
        wordWrap: "on",
      }}
    />
  );
}
