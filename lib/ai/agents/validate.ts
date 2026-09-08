import { patchSchema, type Patch } from "../patch";
import type { AgentName } from "../prompts";
export function validateAgentOutput(
  agent: AgentName,
  input: string,
  value: unknown,
): Patch {
  const result = patchSchema.parse(value);
  if (
    !result.operations.length &&
    !result.report.trim() &&
    !result.ideas.length &&
    ![
      result.confirmedFacts,
      result.userIntent,
      result.unknownInformation,
      result.contradictions,
      result.visibleFacts,
      result.possibleInterpretation,
      result.creativeSuggestions,
    ].some((a) => a.length)
  )
    throw new Error("AI 返回空结果");
  if (agent === "EvidenceExtraction" && result.operations.length)
    throw new Error("事实提取阶段不允许修改");
  if (agent === "GreetingDirector") {
    if (input.includes("SELECTED_IDEA:")) {
      if (
        !result.operations.some(
          (op) =>
            op.path === "/greetings/main" &&
            typeof op.value === "string" &&
            op.value.trim(),
        )
      )
        throw new Error("AI 未生成正式开场白");
    } else if (
      result.ideas.length < 3 ||
      result.ideas.length > 6 ||
      result.operations.length
    )
      throw new Error("开场构思需要 3 至 6 个方案，不允许直接修改");
  }
  if (agent === "ImageAnalyst" && !result.visibleFacts.length)
    throw new Error("图片分析缺少可见事实");
  return result;
}
