"use client";
import { Component, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { resolveModelIcon } from "@/lib/ai/model-icons";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono";
import Qwen from "@lobehub/icons/es/Qwen/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono";
import Grok from "@lobehub/icons/es/Grok/components/Mono";
import Mistral from "@lobehub/icons/es/Mistral/components/Mono";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Sparkles size={16} /> : this.props.children;
  }
}
export function ModelIcon({
  model,
  provider = "",
}: {
  model: string;
  provider?: string;
}) {
  const family = resolveModelIcon(model, provider);
  const Icon = family
    ? {
        openai: OpenAI,
        claude: Claude,
        gemini: Gemini,
        deepseek: DeepSeek,
        qwen: Qwen,
        glm: Zhipu,
        grok: Grok,
        mistral: Mistral,
      }[family]
    : null;
  return (
    <Boundary>{Icon ? <Icon size={18} /> : <Sparkles size={18} />}</Boundary>
  );
}
