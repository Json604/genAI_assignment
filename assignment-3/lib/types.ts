export type SourceChunk = {
  id: string;
  documentId: string;
  fileName: string;
  pageNumber: number | null;
  chunkIndex: number;
  text: string;
  score?: number;
};

export type UploadedDocument = {
  documentId: string;
  fileName: string;
  chunkCount: number;
  characterCount: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
};
