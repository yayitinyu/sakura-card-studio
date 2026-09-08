import { createServer } from "node:http";
import { strict as assert } from "node:assert";
export function createFixtureProvider() {
  return createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = body.messages[0].content as string;
    const input = JSON.stringify(body.messages[1].content);
    let result: unknown = {
      operations: [
        {
          op: "replace",
          path: "/character/personality",
          value: "安静、耐心、执着于真相",
          reason: "Transport fixture",
        },
        {
          op: "replace",
          path: "/character/speechStyle",
          value: "简洁、温和",
          reason: "Independent suggestion",
        },
      ],
      report: "Fixture report",
    };
    if (prompt.startsWith("Produce 3"))
      result = input.includes("SELECTED_IDEA")
        ? {
            operations: [
              {
                op: "replace",
                path: "/greetings/main",
                value: "雨夜，档案馆的门为 {{user}} 打开。",
                reason: "Selected idea",
              },
            ],
          }
        : {
            ideas: ["日常", "悬疑", "重逢"].map((title) => ({
              title,
              situation: "雨夜档案馆",
              mood: "安静",
              hook: "一封来信",
              userPosition: "访客",
              whyItWorks: "推动相遇",
            })),
          };
    if (prompt.startsWith("Describe visibleFacts")) {
      assert.ok(input.includes("image_url"));
      result = {
        visibleFacts: ["淡紫色图像"],
        possibleInterpretation: ["可能是封面"],
        creativeSuggestions: ["可用于角色卡"],
        operations: [],
      };
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const text = JSON.stringify(result);
    for (let i = 0; i < text.length; i += 7)
      res.write(
        "data: " +
          JSON.stringify({
            choices: [{ delta: { content: text.slice(i, i + 7) } }],
          }) +
          "\n\n",
      );
    res.end("data: [DONE]\n\n");
  });
}
