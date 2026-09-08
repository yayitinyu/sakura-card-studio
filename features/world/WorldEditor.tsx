"use client";
import { Plus } from "lucide-react";
import { worldSchema, type Canonical } from "@/lib/schema/character";
export default function WorldEditor({
  worlds,
  onChange,
}: {
  worlds: Canonical["worlds"];
  onChange: (v: Canonical["worlds"]) => void;
}) {
  return (
    <div className="document">
      <div className="button-row">
        <h1>世界观</h1>
        <button
          onClick={() =>
            onChange([
              ...worlds,
              worldSchema.parse({ id: crypto.randomUUID(), name: "新世界" }),
            ])
          }
        >
          <Plus />
          添加世界
        </button>
      </div>
      {worlds.map((w, i) => (
        <section key={w.id}>
          <label>
            世界名称
            <input
              value={w.name}
              onChange={(e) =>
                onChange(
                  worlds.map((x, n) =>
                    n === i ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          {Object.entries({
            overview: "概览",
            locations: "地点",
            organizations: "组织",
            factions: "阵营",
            races: "种族",
            powerSystem: "力量体系",
            history: "历史",
            culture: "文化",
            terminology: "术语",
            npcs: "NPC",
            events: "事件",
          }).map(([k, label]) => (
            <label className="writing-field" key={k}>
              <span>{label}</span>
              <textarea
                rows={4}
                value={String(w[k] ?? "")}
                onChange={(e) =>
                  onChange(
                    worlds.map((x, n) =>
                      n === i ? { ...x, [k]: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
