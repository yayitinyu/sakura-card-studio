"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CodeDiff } from "@/features/editor/CodeEditor";
import type { Project } from "@/lib/server/db";
export default function History({
  project,
  onRestore,
}: {
  project: Project;
  onRestore: (p: Project) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    api(`history/${project.id}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [project.id, project.version]);
  return (
    <div className="history">
      <h2>版本历史</h2>
      <p role="alert">{error}</p>
      {selected && (
        <>
          <CodeDiff
            before={JSON.stringify(project.canonical, null, 2)}
            after={JSON.stringify(JSON.parse(selected.canonical), null, 2)}
          />
          <button
            className="primary"
            onClick={async () => {
              try {
                onRestore(
                  await api(`history/${project.id}`, "POST", {
                    revisionId: selected.id,
                    version: project.version,
                  }),
                );
                setSelected(undefined);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            恢复此版本
          </button>
        </>
      )}
      <div className="revision-list">
        {rows.map((r) => (
          <button
            className={r.id === selected?.id ? "active" : ""}
            key={r.id}
            onClick={() => setSelected(r)}
          >
            <time>{new Date(r.created_at).toLocaleString()}</time>
            <span>{r.source}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
