import { chunkDocument } from "@/lib/chunking";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import { ensureCollection, searchChunks, storeChunks } from "@/lib/qdrant";
import type { ParsedDocument } from "@/lib/documents";

export async function indexDocument(documentId: string, document: ParsedDocument) {
  const chunks = chunkDocument({
    documentId,
    fileName: document.fileName,
    pages: document.pages,
  });

  if (!chunks.length) throw new Error("No indexable text chunks were produced.");

  const vectors: number[][] = [];
  for (const chunk of chunks) {
    vectors.push(await embedText(chunk.text));
  }

  await ensureCollection(vectors[0].length);
  await storeChunks(chunks, vectors);

  return {
    documentId,
    fileName: document.fileName,
    chunkCount: chunks.length,
    characterCount: document.characterCount,
  };
}

export async function answerQuestion(documentId: string, question: string) {
  const grounding = await getGrounding([documentId], question);

  if (!grounding.sources.length) {
    return {
      answer: "I could not find that in the uploaded document.",
      sources: [],
    };
  }

  return {
    answer: await generateGroundedAnswer(grounding.query, grounding.context),
    sources: grounding.sources,
  };
}

export async function getGrounding(documentIds: string[], question: string) {
  const query = question.trim();
  if (!query) throw new Error("Ask a question about the uploaded document.");

  const queryVector = await embedText(query);
  const chunks = await searchChunks(documentIds, queryVector, 8);
  const usefulChunks = chunks.filter((chunk) => chunk.text.trim().length > 0);

  if (!usefulChunks.length) {
    return {
      query,
      context: "",
      sources: [],
    };
  }

  const context = usefulChunks
    .map((chunk) => {
      const location = chunk.pageNumber ? `page ${chunk.pageNumber}` : `chunk ${chunk.chunkIndex + 1}`;
      return `[${chunk.fileName}, ${location}, score ${chunk.score?.toFixed(3) ?? "n/a"}]\n${chunk.text}`;
    })
    .join("\n\n---\n\n");

  return { query, context, sources: usefulChunks };
}
