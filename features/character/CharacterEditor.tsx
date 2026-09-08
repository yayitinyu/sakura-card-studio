"use client";
import TokenInput from "@/components/ui/TokenInput";
import type { Canonical } from "@/lib/schema/character";
export const characterFields: Record<string, string> = {
  basic: "基本信息",
  appearance: "外貌",
  personality: "性格",
  speechStyle: "语言风格",
  behavior: "行为逻辑",
  preferences: "偏好",
  background: "背景",
  goals: "目标",
  motivations: "动机",
  secrets: "秘密",
  relationships: "人物关系",
  userRelationship: "与 {{user}} 的关系",
  rules: "规则与约束",
  exampleDialogue: "示例对话",
  creatorNotes: "作者备注",
};
export default function CharacterEditor({
  character,
  onChange,
}: {
  character: Canonical["character"];
  onChange: (value: Canonical["character"]) => void;
}) {
  const set = (key: string, value: unknown) =>
    onChange({ ...character, [key]: value });
  return (
    <div className="document">
      <input
        className="character-name"
        aria-label="角色姓名"
        value={character.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <div className="title-rule" />
      <label className="writing-field">
        <span>人物概述</span>
        <textarea
          aria-label="人物概述"
          rows={Math.max(3, character.description.split("\n").length)}
          value={character.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      {Object.entries(characterFields).map(([key, label]) => (
        <details
          className="character-section"
          id={"field-" + key}
          key={key}
          open={Boolean(character[key]) || key === "basic"}
        >
          <summary>{label}</summary>
          <textarea
            aria-label={label}
            rows={Math.max(3, String(character[key] ?? "").split("\n").length)}
            value={String(character[key] ?? "")}
            onChange={(e) => set(key, e.target.value)}
          />
        </details>
      ))}
      <label>
        标签
        <TokenInput
          value={character.tags}
          onChange={(tags) => set("tags", tags)}
        />
      </label>
      <div className="two-col">
        <label>
          作者
          <input
            value={character.creator}
            onChange={(e) => set("creator", e.target.value)}
          />
        </label>
        <label>
          角色版本
          <input
            value={character.version}
            onChange={(e) => set("version", e.target.value)}
          />
        </label>
      </div>
      <details>
        <summary>第三方 Extensions</summary>
        <pre>{JSON.stringify(character.extensions, null, 2)}</pre>
      </details>
    </div>
  );
}
