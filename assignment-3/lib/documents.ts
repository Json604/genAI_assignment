import pdf from "pdf-parse";

import { normalizeWhitespace } from "@/lib/chunking";

export type ParsedDocument = {
  fileName: string;
  pages: Array<{ text: string; pageNumber: number | null }>;
  characterCount: number;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function parseUploadedFile(file: File): Promise<ParsedDocument> {
  if (!file) throw new Error("Upload a PDF or plain text file.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large. Upload a file under 8 MB.");

  const fileName = file.name || "uploaded-document";
  const extension = fileName.split(".").pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "application/pdf" || extension === "pdf") {
    const parsed = await pdf(buffer);
    const text = normalizeWhitespace(parsed.text);
    if (!text) throw new Error("No readable text was found in this PDF.");

    return {
      fileName,
      pages: splitPdfPages(parsed.text),
      characterCount: text.length,
    };
  }

  if (file.type.startsWith("text/") || extension === "txt" || extension === "md") {
    const text = normalizeWhitespace(buffer.toString("utf8"));
    if (!text) throw new Error("This text file is empty.");

    return {
      fileName,
      pages: [{ text, pageNumber: null }],
      characterCount: text.length,
    };
  }

  throw new Error("Unsupported file type. Upload a PDF, TXT, or Markdown file.");
}

function splitPdfPages(rawText: string) {
  const normalized = rawText.replace(/\r/g, "");
  const pageSeparator = "\n\n";
  const pageLikeParts = normalized
    .split(/\n\s*\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (pageLikeParts.length > 1) {
    return pageLikeParts.map((text, index) => ({ text, pageNumber: index + 1 }));
  }

  return normalized
    .split(pageSeparator)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ text, pageNumber: index + 1 }));
}
