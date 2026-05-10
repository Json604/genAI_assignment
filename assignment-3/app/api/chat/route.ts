import { NextResponse } from "next/server";

import { streamGroundedAnswer } from "@/lib/gemini";
import { getGrounding } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

type StreamEvent =
  | { type: "sources"; sources: unknown[] }
  | { type: "token"; token: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const documentIds = Array.isArray(body.documentIds)
      ? body.documentIds.filter((id: unknown): id is string => typeof id === "string")
      : typeof body.documentId === "string"
        ? [body.documentId]
        : [];
    const question = typeof body.question === "string" ? body.question : "";

    if (!documentIds.length) {
      return NextResponse.json({ error: "Select at least one source before asking questions." }, { status: 400 });
    }

    const grounding = await getGrounding(documentIds, question);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: StreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          send({ type: "sources", sources: grounding.sources });

          if (!grounding.sources.length) {
            send({ type: "token", token: "I could not find that in the uploaded document." });
            send({ type: "done" });
            controller.close();
            return;
          }

          for await (const token of streamGroundedAnswer(grounding.query, grounding.context)) {
            send({ type: "token", token });
          }

          send({ type: "done" });
          controller.close();
        } catch (streamError) {
          const message =
            streamError instanceof Error ? streamError.message : "Could not answer this question.";
          send({ type: "error", error: message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not answer this question.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
