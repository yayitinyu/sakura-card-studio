"use client";
import { Plus } from "lucide-react";
import type { Canonical } from "@/lib/schema/character";
export default function GreetingsEditor({
  greetings,
  onChange,
}: {
  greetings: Canonical["greetings"];
  onChange: (v: Canonical["greetings"]) => void;
}) {
  return (
    <div className="document">
      <h1>第一句话，打开一个世界。</h1>
      <label className="writing-field">
        <span>主开场白</span>
        <textarea
          rows={12}
          value={greetings.main}
          onChange={(e) => onChange({ ...greetings, main: e.target.value })}
        />
      </label>
      <div className="button-row">
        <button
          onClick={() =>
            onChange({ ...greetings, alternate: [...greetings.alternate, ""] })
          }
        >
          <Plus />
          备用开场白
        </button>
        <button
          onClick={() =>
            onChange({
              ...greetings,
              alternate: [...greetings.alternate, greetings.main],
            })
          }
        >
          将主开场白复制为备用
        </button>
      </div>
      {greetings.alternate.map((s, i) => (
        <div key={i}>
          <label className="writing-field">
            <span>备用开场白 {i + 1}</span>
            <textarea
              rows={8}
              value={s}
              onChange={(e) =>
                onChange({
                  ...greetings,
                  alternate: greetings.alternate.map((x, n) =>
                    n === i ? e.target.value : x,
                  ),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              onChange({
                ...greetings,
                main: s,
                alternate: greetings.alternate.map((x, n) =>
                  n === i ? greetings.main : x,
                ),
              })
            }
          >
            设为主开场白
          </button>
        </div>
      ))}
    </div>
  );
}
