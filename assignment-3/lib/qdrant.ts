import { QdrantClient } from "@qdrant/js-client-rest";

import type { SourceChunk } from "@/lib/types";

const url = process.env.QDRANT_URL;
const apiKey = process.env.QDRANT_API_KEY;

if (!url) throw new Error("Missing QDRANT_URL.");
if (!apiKey) throw new Error("Missing QDRANT_API_KEY.");

export const collectionName = process.env.QDRANT_COLLECTION || "assignment_3_documents";

export const qdrant = new QdrantClient({ url, apiKey });

export async function ensureCollection(vectorSize: number) {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((collection) => collection.name === collectionName);
  if (!exists) {
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    });
  }

  await ensureDocumentIdIndex();
}

async function ensureDocumentIdIndex() {
  try {
    await qdrant.createPayloadIndex(collectionName, {
      wait: true,
      field_name: "documentId",
      field_schema: "keyword",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("already exists")) throw error;
  }
}

export async function storeChunks(chunks: SourceChunk[], vectors: number[][]) {
  await qdrant.upsert(collectionName, {
    wait: true,
    points: chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: vectors[index],
      payload: {
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
      },
    })),
  });
}

export async function searchChunks(documentIds: string[], vector: number[], limit = 8) {
  await ensureDocumentIdIndex();

  const ids = documentIds.filter(Boolean);
  if (!ids.length) return [];

  const results = await qdrant.search(collectionName, {
    vector,
    limit,
    with_payload: true,
    filter: {
      should: ids.map((documentId) => ({
        key: "documentId",
        match: { value: documentId },
      })),
    },
  });

  return results.map((result) => {
    const payload = result.payload || {};
    return {
      id: String(result.id),
      documentId: String(payload.documentId || ""),
      fileName: String(payload.fileName || "document"),
      pageNumber: typeof payload.pageNumber === "number" ? payload.pageNumber : null,
      chunkIndex: typeof payload.chunkIndex === "number" ? payload.chunkIndex : 0,
      text: String(payload.text || ""),
      score: result.score,
    };
  });
}
