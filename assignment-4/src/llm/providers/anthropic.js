import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider } from "../provider.js";

export class AnthropicProvider extends LLMProvider {
  /** @param {{ apiKey: string }} options */
  constructor({ apiKey }) {
    super();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for anthropic provider");
    this.client = new Anthropic({ apiKey });
  }

  supportsVision() {
    return true;
  }

  /** @param {import('../provider.js').ChatOptions} options */
  async chat({ messages, tools = [], model }) {
    const system = messages.find((m) => m.role === "system")?.content;
    const chatMessages = toAnthropicMessages(messages.filter((m) => m.role !== "system"));

    const response = await this.client.messages.create({
      model,
      max_tokens: 8192,
      system: system || undefined,
      messages: chatMessages,
      ...(tools.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    });

    const toolCalls = [];
    let text = "";

    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        });
      }
    }

    return {
      content: text || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: toolCalls.length ? "tool_calls" : "stop",
    };
  }
}

/** @param {import('../provider.js').ChatMessage[]} messages */
function toAnthropicMessages(messages) {
  /** @type {import('@anthropic-ai/sdk').MessageParam[]} */
  const out = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content || "" });
      continue;
    }

    if (msg.role === "assistant") {
      /** @type {import('@anthropic-ai/sdk').ContentBlockParam[]} */
      const content = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      for (const tc of msg.toolCalls || []) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      out.push({ role: "assistant", content });
      continue;
    }

    if (msg.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId || "",
            content: msg.content || "",
          },
        ],
      });
    }
  }

  return out;
}