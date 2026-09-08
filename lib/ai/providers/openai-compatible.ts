import { z } from "zod";
export const providerSchema = z.object({
  id: z.string().default(""),
  name: z.string().min(1).max(100),
  baseUrl: z
    .string()
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      );
    }, "Base URL 必须是无凭据的 HTTP(S) URL"),
  model: z.string().default(""),
  defaultModel: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.8),
  maxTokens: z.number().int().min(256).max(65536).default(4096),
  vision: z.boolean().default(false),
  tools: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  favorites: z.array(z.string()).default([]),
  recent: z.array(z.string()).default([]),
});
export type Provider = z.infer<typeof providerSchema>;
export type Message = {
  role: "system" | "user" | "assistant";
  content:
    string | { type: string; text?: string; image_url?: { url: string } }[];
};
export interface AIProviderAdapter {
  testConnection(): Promise<boolean>;
  listModels(): Promise<string[]>;
  chat(messages: Message[], model: string): Promise<string>;
  stream(messages: Message[], model: string): AsyncIterable<string>;
  supportsVision(): boolean;
  supportsTools(): boolean;
  supportsStructuredOutput(): boolean;
}
export class OpenAICompatible implements AIProviderAdapter {
  constructor(
    private config: Provider,
    private key: string,
  ) {}
  supportsVision() {
    return this.config.vision;
  }
  supportsTools() {
    return this.config.tools;
  }
  supportsStructuredOutput() {
    return this.config.structuredOutput;
  }
  private async request(endpoint: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetch(
        this.config.baseUrl.replace(/\/$/, "") + endpoint,
        {
          method: body ? "POST" : "GET",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(120000),
        },
      );
    } catch {
      throw new Error("Provider 连接失败或超时，请检查地址与网络");
    }
    if (!response.ok)
      throw new Error(`Provider HTTP ${response.status}，请检查配置`);
    return response;
  }
  async listModels() {
    const r = await (await this.request("/models")).json();
    return z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(r)
      .data.map((x) => x.id);
  }
  async testConnection() {
    await this.listModels();
    return true;
  }
  private body(messages: Message[], model: string, stream = false) {
    return {
      model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream,
      ...(this.config.structuredOutput
        ? { response_format: { type: "json_object" } }
        : {}),
    };
  }
  async chat(messages: Message[], model: string) {
    const r = await (
      await this.request("/chat/completions", this.body(messages, model))
    ).json();
    return z
      .object({
        choices: z
          .array(z.object({ message: z.object({ content: z.string() }) }))
          .min(1),
      })
      .parse(r).choices[0].message.content;
  }
  async *stream(messages: Message[], model: string) {
    const r = await this.request(
      "/chat/completions",
      this.body(messages, model, true),
    );
    if (!r.body) throw new Error("Provider 无响应流");
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          if (data) {
            const json = JSON.parse(data);
            if (json.error) throw new Error("Provider streaming error");
            const content = json.choices?.[0]?.delta?.content;
            if (typeof content === "string") yield content;
          }
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
