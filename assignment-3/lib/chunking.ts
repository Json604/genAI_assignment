import type { SourceChunk } from "@/lib/types";
import { randomUUID } from "crypto";

const DEFAULT_CHUNK_SIZE = 1100;
const DEFAULT_OVERLAP = 180;

type RawPage = {
  text: string;
  pageNumber: number | null;
};

type ChunkInput = {
  documentId: string;
  fileName: string;
  pages: RawPage[];
  chunkSize?: number;
  overlap?: number;
};

export function chunkDocument({
  documentId,
  fileName,
  pages,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
}: ChunkInput): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  for (const page of pages) {
    const cleanText = normalizeWhitespace(page.text);
    if (!cleanText) continue;

    const pageChunks = splitText(cleanText, chunkSize, overlap);

    for (const text of pageChunks) {
      chunks.push({
        id: randomUUID(),
        documentId,
        fileName,
        pageNumber: page.pageNumber,
        chunkIndex: chunks.length,
        text,
      });
    }
  }

  return chunks;
}

export function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function splitText(text: string, chunkSize: number, overlap: number) {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + chunkSize, text.length);
    const end = findNaturalBreak(text, start, hardEnd);
    const chunk = text.slice(start, end).trim();

    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    start = Math.max(0, end - overlap);
    while (start < text.length && /\s/.test(text[start])) start += 1;
  }

  return chunks;
}

function findNaturalBreak(text: string, start: number, hardEnd: number) {
  if (hardEnd >= text.length) return text.length;

  const sentenceBreak = Math.max(
    text.lastIndexOf(". ", hardEnd),
    text.lastIndexOf("? ", hardEnd),
    text.lastIndexOf("! ", hardEnd)
  );

  if (sentenceBreak > start + 0.55 * (hardEnd - start)) {
    return sentenceBreak + 1;
  }

  const paragraphBreak = text.lastIndexOf("\n\n", hardEnd);
  if (paragraphBreak > start + 0.45 * (hardEnd - start)) return paragraphBreak;

  const wordBreak = text.lastIndexOf(" ", hardEnd);
  if (wordBreak > start + 0.65 * (hardEnd - start)) return wordBreak;

  return hardEnd;
}
