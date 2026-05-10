# Assignment 03 — Google NotebookLM RAG

**Student:** Kartikey · **Roll No.** 24BCS10121 · **Course:** GenAI / Prompt Engineering, Scaler Academy

A NotebookLM-style RAG application where a user uploads a PDF or text document, the app indexes it in Qdrant, and then answers questions using only retrieved document context.

## Live demo

Add the deployed Vercel URL here after deployment.

## What it does

- Uploads a new PDF, TXT, or Markdown document
- Extracts readable text from the file
- Chunks the document into retrieval-friendly passages
- Embeds chunks with Gemini `gemini-embedding-001`
- Stores embeddings and chunk metadata in Qdrant
- Retrieves the most relevant chunks for each user question
- Streams an answer from Gemini using only retrieved context
- Shows retrieved source chunks under each answer
- Refuses unsupported questions with: `I could not find that in the uploaded document.`

## Stack

- Next.js 14 App Router + TypeScript
- Gemini API for embeddings and answer generation
- Qdrant Cloud for vector storage and similarity search
- `pdf-parse` for PDF text extraction
- Tailwind CSS for the web UI

## RAG pipeline

```txt
Upload
  -> Parse PDF/TXT
  -> Normalize text
  -> Chunk document
  -> Embed chunks with Gemini
  -> Store vectors + metadata in Qdrant
  -> Embed user question
  -> Search Qdrant filtered by documentId
  -> Send retrieved chunks to Gemini
  -> Stream grounded answer + return sources
```

## Chunking strategy

This project uses a recursive character chunking strategy implemented in [`lib/chunking.ts`](./lib/chunking.ts).

- Default chunk size: `1100` characters
- Default overlap: `180` characters
- Preferred split points: sentence endings first, then paragraph breaks, then word boundaries
- Metadata retained per chunk:
  - `documentId`
  - `fileName`
  - `pageNumber` when available
  - `chunkIndex`

The overlap keeps nearby context available during retrieval, while the chunk size keeps each retrieved passage focused enough for grounded answers.

## Environment variables

Create `.env` locally and configure these values:

```env
GEMINI_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
QDRANT_COLLECTION=assignment_3_documents
```

Optional:

```env
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_GENERATION_MODEL=gemini-2.5-flash
```

Do not commit `.env`.

## Local setup

```bash
cd assignment-3
npm install
npm run dev
```

Open <http://localhost:3000>.

## Deploying to Vercel

1. Push this repository to GitHub and make it public.
2. Import the project in Vercel.
3. If deploying from the monorepo root, set **Root Directory** to `assignment-3`.
4. Add the same environment variables from `.env`.
5. Deploy and paste the live URL in this README.

## Submission checklist

- [x] Working web UI
- [x] PDF and text upload
- [x] End-to-end RAG pipeline
- [x] Document chunking documented
- [x] Gemini embeddings
- [x] Qdrant vector database
- [x] Retrieval-filtered answering by uploaded document
- [x] Source chunks shown with answers
- [x] Deployment-ready README
- [ ] Public GitHub repository link submitted
- [ ] Live Vercel project link submitted

## Notes

The app creates a new `documentId` for every upload and filters Qdrant searches by that ID, so answers are grounded in the currently uploaded file rather than unrelated documents in the same collection.
