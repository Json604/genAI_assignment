import { GoogleGenerativeAI } from "@google/generative-ai";
import { LLMProvider } from "../provider.js";
import { sanitizeGeminiSchema } from "../gemini-schema.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

export class GeminiProvider extends LLMProvider {
  /** @param {{ apiKey: string }} options */
  constructor({ apiKey }) {
    super();
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for gemini provider");
    this.client = new GoogleGenerativeAI(apiKey.trim());
  }

  supportsVision() {
    return true;
  }

  /** @param {import('../provider.js').ChatOptions} options */
  async chat({ messages, tools = [], model }) {
    const genModel = this.client.getGenerativeModel({
      model,
      ...(tools.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: sanitizeGeminiSchema(t.parameters),
                })),
              },
            ],
          }
        : {}),
    });

    const { systemInstruction, contents } = toGeminiContents(messages);

    const result = await withRetries(async () => {
      try {
        return await genModel.generateContent({ systemInstruction, contents });
      } catch (err) {
        throw normalizeGeminiError(err);
      }
    });

    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const toolCalls = [];
    let text = "";

    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${toolCalls.length + 1}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
          thoughtSignature: part.thoughtSignature || undefined,
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
function toGeminiContents(messages) {
  let systemInstruction;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = msg.content;
      continue;
    }

    if (msg.role === "user") {
      contents.push({ role: "user", parts: toGeminiParts(msg.content) });
      continue;
    }

    if (msg.role === "assistant") {
      const parts = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.toolCalls || []) {
        /** @type {Record<string, unknown>} */
        const part = {
          functionCall: { name: tc.name, args: tc.arguments },
        };
        if (tc.thoughtSignature) {
          part.thoughtSignature = tc.thoughtSignature;
        }
        parts.push(part);
      }
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "tool") {
      // Gemini expects function responses as user-role parts with parsed JSON.
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name || "tool",
              response: parseToolResponse(msg.content),
            },
          },
        ],
      });
    }
  }

  return { systemInstruction, contents };
}

/** @param {string | undefined} content */
function parseToolResponse(content) {
  const text = content || "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return { output: text };
}

async function withRetries(fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      if (!retryable || attempt === MAX_RETRIES) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function isRetryable(err) {
  const status = err?.status ?? err?.statusCode;
  if (status === 429 || status === 503) return true;
  if (status === 400) {
    const msg = String(err?.message || "");
    return msg.includes("API key expired") || msg.includes("API_KEY_INVALID");
  }
  return false;
}

function normalizeGeminiError(err) {
  const message = String(err?.message || err);
  if (message.includes("API key expired") || message.includes("API_KEY_INVALID")) {
    const wrapped = new Error(
      `Gemini API rejected the request on a follow-up turn. This often happens when tool-call context is malformed — retrying usually fixes it. (Google message: ${message.split("\n")[0]})`,
    );
    wrapped.status = err?.status;
    wrapped.cause = err;
    return wrapped;
  }
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {import('../provider.js').ChatMessage['content']} content */
function toGeminiParts(content) {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part.type === "image") {
        return { inlineData: { mimeType: part.mimeType, data: part.data } };
      }
      return { text: part.text || "" };
    });
  }
  return [{ text: content || "" }];
}