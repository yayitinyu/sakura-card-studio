export type ModelFamily =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "glm"
  | "grok"
  | "mistral";
export function resolveModelIcon(
  model: string,
  provider = "",
): ModelFamily | null {
  const families: [ModelFamily, RegExp][] = [
    ["openai", /(?:^|[/\s-])(?:gpt|o[134](?:[-\s]|$))|openai/i],
    ["claude", /claude|anthropic/i],
    ["gemini", /gemini|google/i],
    ["deepseek", /deepseek/i],
    ["qwen", /qwen/i],
    ["glm", /glm|zhipu/i],
    ["grok", /grok|xai/i],
    ["mistral", /mistral/i],
  ];
  return (
    families.find(([, pattern]) => pattern.test(model))?.[0] ??
    families.find(([, pattern]) => pattern.test(provider))?.[0] ??
    null
  );
}
