"use client";
import { useEffect, useState } from "react";
export default function TokenInput({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(value.join(", "));
  const [focused, setFocused] = useState(false);
  const serialized = value.join(", ");
  useEffect(() => {
    if (!focused) setDraft(serialized);
  }, [serialized, focused]);
  return (
    <input
      aria-label={label}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(
          e.target.value
            .split(/[,，;；\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
