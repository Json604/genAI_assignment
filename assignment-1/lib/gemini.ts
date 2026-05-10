import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage } from "./types";

/**
 * Streams a Gemini reply as a ReadableStream of UTF-8 text chunks.
 * The route handler pipes this directly back to the browser, so the
 * UI sees tokens land as they arrive.
 *
 * The Gemini API key is read from the GEMINI_API_KEY environment
 * variable on the server and is never exposed to the client.
 */
export async function streamGeminiReply(args: {
  systemPrompt: string;
  history: ChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: args.systemPrompt,
    generationConfig: {
      temperature: 0.75,
      topP: 0.95,
    },
  });

  // Gemini uses "model" instead of "assistant" for bot turns.
  const contents = args.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const result = await model.generateContentStream({ contents });
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const piece = chunk.text();
          if (piece) controller.enqueue(encoder.encode(piece));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
