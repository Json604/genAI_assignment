import OpenAI from "openai";
import { LLMProvider } from "../provider.js";

export class OpenAIProvider extends LLMProvider {
  /** @param {{ apiKey: string; baseURL?: string; defaultHeaders?: Record<string, string> }} options */
  constructor({ apiKey, baseURL, defaultHeaders }) {
    super();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for openai provider");
    this.client = new OpenAI({ apiKey, baseURL, defaultHeaders });
  }

  supportsVision() {
    return true;
  }

  /** @param {import('../provider.js').ChatOptions} options */
  async chat({ messages, tools = [], model }) {
    const response = await this.client.chat.completions.create({
      model,
      messages: toOpenAIMessages(messages),
      ...(tools.length
        ? {
            tools: tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          }
        : {}),
    });

    const choice = response.choices[0];
    const msg = choice.message;
    const toolCalls = (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParseJson(tc.function.arguments),
    }));

    return {
      content: msg.content || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: toolCalls.length ? "tool_calls" : "stop",
    };
  }
}

/** @param {import('../provider.js').ChatMessage[]} messages */
function toOpenAIMessages(messages) {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content || "",
      };
    }
    if (msg.role === "assistant" && msg.toolCalls?.length) {
      return {
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return { role: msg.role, content: toOpenAIContent(msg.content) };
  });
}

/** @param {import('../provider.js').ChatMessage['content']} content */
function toOpenAIContent(content) {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part.type === "image") {
        return {
          type: "image_url",
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        };
      }
      return { type: "text", text: part.text || "" };
    });
  }
  return content || "";
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { _raw: raw };
  }
}