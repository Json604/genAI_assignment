import { PERSONA_PROMPTS } from "@/lib/personas";
import { streamGeminiReply } from "@/lib/gemini";
import type { ChatMessage, PersonaId } from "@/lib/types";

// This file is the entire "backend" for the app — Vercel deploys it as a
// Node.js serverless function. The browser never holds the Gemini key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  messages: ChatMessage[];
  persona: PersonaId;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return jsonError(
      "Server is missing GEMINI_API_KEY. Set it in your environment.",
      500
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return jsonError("Request body was not valid JSON.", 400);
  }

  const { messages, persona } = body;

  if (!persona || !PERSONA_PROMPTS[persona]) {
    return jsonError("Unrecognised persona id.", 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError("At least one message is required.", 400);
  }

  try {
    const stream = await streamGeminiReply({
      systemPrompt: PERSONA_PROMPTS[persona],
      history: messages,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error("[/api/chat] gemini call failed:", reason);
    return jsonError(
      "The model is unreachable right now. Try again in a moment.",
      502
    );
  }
}
