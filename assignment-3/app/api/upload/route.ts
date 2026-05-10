import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { parseUploadedFile } from "@/lib/documents";
import { indexDocument } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a PDF or plain text file." }, { status: 400 });
    }

    const parsedDocument = await parseUploadedFile(file);
    const indexed = await indexDocument(randomUUID(), parsedDocument);

    return NextResponse.json(indexed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process this document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
