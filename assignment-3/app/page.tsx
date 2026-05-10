"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  MessageSquareText,
  ScanText,
  Send,
  Upload,
  User,
} from "lucide-react";
import { DragEvent, FormEvent, useMemo, useRef, useState } from "react";

import type { ChatMessage, UploadedDocument } from "@/lib/types";

const SAMPLE_QUESTIONS = [
  "Summarize the document in five bullet points.",
  "What are the most important facts or claims?",
  "Which details support the main argument?",
  "What should I remember from this document?",
];

type ChatStreamEvent =
  | { type: "sources"; sources: ChatMessage["sources"] }
  | { type: "token"; token: string }
  | { type: "done" }
  | { type: "error"; error: string };

type UploadStage = "idle" | "reading" | "extracting" | "indexing" | "ready" | "error";

const UPLOAD_STEPS: Array<{ stage: Exclude<UploadStage, "idle" | "ready" | "error">; label: string }> = [
  { stage: "reading", label: "Reading file" },
  { stage: "extracting", label: "Extracting text" },
  { stage: "indexing", label: "Embedding and indexing" },
];

export default function Page() {
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = uploading || asking;
  const canAsk = Boolean(document) && !busy;

  const documentStats = useMemo(() => {
    if (!document) return null;
    return [
      `${document.chunkCount} chunks`,
      `${document.characterCount.toLocaleString()} characters`,
    ].join(" · ");
  }, [document]);

  async function uploadDocument(file: File | undefined) {
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    setUploadError(null);
    setSelectedFileName(file.name);
    setUploadStage("reading");
    setStatus(null);

    const extractionTimer = window.setTimeout(() => {
      setUploadStage("extracting");
    }, 900);
    const indexingTimer = window.setTimeout(() => {
      setUploadStage("indexing");
    }, 2800);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Upload failed.");

      setDocument(data);
      setMessages([]);
      setUploadStage("ready");
      setStatus("Document indexed. Ask a question grounded in its content.");
    } catch (uploadError) {
      setDocument(null);
      setUploadStage("error");
      setStatus(null);
      setUploadError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      window.clearTimeout(extractionTimer);
      window.clearTimeout(indexingTimer);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function askQuestion(nextQuestion?: string) {
    const text = (nextQuestion || question).trim();
    if (!text || !document || asking) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion("");
    setAsking(true);
    setError(null);
    setStatus("Retrieving relevant chunks and generating a grounded answer...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.documentId, question: text }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Could not answer.");
      }

      await readChatStream(response.body);
      setStatus("Answer streamed from retrieved document chunks.");
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Could not answer.");
      removeEmptyAssistantMessage();
    } finally {
      setAsking(false);
    }
  }

  async function readChatStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        applyChatStreamEvent(JSON.parse(line) as ChatStreamEvent);
      }
    }

    if (buffered.trim()) {
      applyChatStreamEvent(JSON.parse(buffered) as ChatStreamEvent);
    }
  }

  function applyChatStreamEvent(event: ChatStreamEvent) {
    if (event.type === "sources") {
      updateLastAssistantMessage({ sources: event.sources || [] });
      return;
    }

    if (event.type === "token") {
      appendToLastAssistantMessage(event.token);
      return;
    }

    if (event.type === "error") {
      throw new Error(event.error);
    }
  }

  function updateLastAssistantMessage(patch: Partial<ChatMessage>) {
    setMessages((current) => {
      const next = current.slice();
      const lastIndex = next.length - 1;
      const last = next[lastIndex];

      if (!last || last.role !== "assistant") return current;

      next[lastIndex] = { ...last, ...patch };
      return next;
    });
  }

  function appendToLastAssistantMessage(token: string) {
    setMessages((current) => {
      const next = current.slice();
      const lastIndex = next.length - 1;
      const last = next[lastIndex];

      if (!last || last.role !== "assistant") return current;

      next[lastIndex] = { ...last, content: `${last.content}${token}` };
      return next;
    });
  }

  function removeEmptyAssistantMessage() {
    setMessages((current) => {
      const next = current.slice();
      const last = next[next.length - 1];

      if (last?.role === "assistant" && !last.content.trim()) {
        next.pop();
      }

      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion();
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    void uploadDocument(event.dataTransfer.files?.[0]);
  }

  function getUploadStepState(stage: UploadStage) {
    const activeIndex = UPLOAD_STEPS.findIndex((step) => step.stage === stage);

    return UPLOAD_STEPS.map((step, index) => ({
      ...step,
      done: stage === "ready" || activeIndex > index,
      active: activeIndex === index,
    }));
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#191816]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-[#d8d5cc] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#6f6a60]">
              Assignment 03 · Google NotebookLM RAG
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#191816]">
              Document-grounded notebook chat
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#5e5a52]">
            <span className="h-2 w-2 rounded-full bg-[#1f8a70]" />
            Gemini embeddings · Qdrant retrieval · grounded answers
          </div>
        </header>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#d8d5cc] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-[#ecf4f1] text-[#1f8a70]">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Upload source</h2>
                  <p className="text-sm text-[#6f6a60]">PDF, TXT, or Markdown up to 8 MB</p>
                </div>
              </div>

              <label
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center transition ${
                  dragActive
                    ? "border-[#1f8a70] bg-[#ecf4f1]"
                    : "border-[#b9b3a6] bg-[#fbfaf7] hover:border-[#1f8a70] hover:bg-[#f1f7f4]"
                } ${uploading ? "cursor-wait opacity-80" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <Loader2 className="mb-3 animate-spin text-[#1f8a70]" size={28} />
                ) : (
                  <FileText className="mb-3 text-[#736d62]" size={28} />
                )}
                <span className="text-sm font-medium">
                  {uploading ? "Processing document" : "Choose or drop a document"}
                </span>
                <span className="mt-1 max-w-[260px] truncate text-xs text-[#777168]">
                  {selectedFileName || "PDF, TXT, and Markdown supported"}
                </span>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  disabled={uploading}
                  onChange={(event) => void uploadDocument(event.target.files?.[0])}
                />
              </label>

              {(uploading || uploadStage === "ready" || uploadStage === "error") && (
                <div className="mt-4 rounded-md border border-[#e2ded5] bg-[#fbfaf7] p-3">
                  <div className="space-y-2">
                    {getUploadStepState(uploadStage).map((step) => (
                      <div key={step.stage} className="flex items-center gap-2 text-sm">
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full ${
                            step.done
                              ? "bg-[#1f8a70] text-white"
                              : step.active
                                ? "bg-[#ecf4f1] text-[#1f8a70]"
                                : "bg-[#e8e4db] text-[#8b857b]"
                          }`}
                        >
                          {step.done ? (
                            <CheckCircle2 size={13} />
                          ) : step.active ? (
                            <Loader2 className="animate-spin" size={13} />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          )}
                        </span>
                        <span
                          className={
                            step.done || step.active ? "text-[#2f2b26]" : "text-[#8a8479]"
                          }
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {uploadStage === "extracting" && (
                    <p className="mt-3 text-xs leading-5 text-[#6f6a60]">
                      Scanned PDFs can take longer because the app falls back to Gemini text
                      extraction when no text layer is available.
                    </p>
                  )}

                  {uploadError && (
                    <div className="mt-3 flex gap-2 rounded-md border border-[#f3b7ae] bg-[#fff6f4] p-2 text-xs leading-5 text-[#b42318]">
                      <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#d8d5cc] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Active document</h2>
              {document ? (
                <div className="mt-3 rounded-md bg-[#f7f6f2] p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-[#1f8a70]" size={16} />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{document.fileName}</p>
                      <p className="mt-1 text-xs text-[#6f6a60]">{documentStats}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#6f6a60]">
                  Upload a document to create a Qdrant index for this chat. Scanned PDFs are
                  handled with a Gemini extraction fallback.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[#d8d5cc] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Try asking</h2>
              <div className="mt-3 flex flex-col gap-2">
                {SAMPLE_QUESTIONS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="rounded-md border border-[#dedbd2] px-3 py-2 text-left text-sm text-[#4d4942] transition hover:border-[#1f8a70] hover:bg-[#f1f7f4] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAsk}
                    onClick={() => void askQuestion(sample)}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col rounded-lg border border-[#d8d5cc] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e5e1d8] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-[#f2eee3] text-[#7b5e24]">
                  <MessageSquareText size={19} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Notebook chat</h2>
                  <p className="text-xs text-[#6f6a60]">Answers are restricted to retrieved chunks.</p>
                </div>
              </div>
              {busy && <Loader2 className="animate-spin text-[#1f8a70]" size={20} />}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {!messages.length ? (
                <div className="grid h-full min-h-[360px] place-items-center text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#ecf4f1] text-[#1f8a70]">
                      {uploading ? <ScanText size={24} /> : document ? <Database size={24} /> : <Bot size={24} />}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {uploading
                        ? "Preparing your document"
                        : document
                          ? "Document ready for questions"
                          : "Upload, then ask from the source"}
                    </h3>
                    <p className="mt-2 text-sm text-[#6f6a60]">
                      {uploading
                        ? "The app is extracting text, creating chunks, embedding them, and storing them in Qdrant."
                        : document
                          ? "Ask a question below or use one of the prompts on the left."
                          : "The assistant will retrieve matching chunks from Qdrant and refuse questions that are not supported by the uploaded document."}
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => <Message key={index} message={message} />)
              )}
            </div>

            {(status || error) && (
              <div className="border-t border-[#ece8df] px-4 py-2 text-xs">
                {error ? <span className="text-[#b42318]">{error}</span> : <span>{status}</span>}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[#e5e1d8] p-3">
              <input
                className="min-w-0 flex-1 rounded-md border border-[#d6d1c7] bg-[#fbfaf7] px-3 py-3 text-sm outline-none transition placeholder:text-[#8d867a] focus:border-[#1f8a70] focus:bg-white"
                placeholder={document ? "Ask a question about the uploaded document..." : "Upload a document first..."}
                value={question}
                disabled={!canAsk}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button
                type="submit"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#1f8a70] text-white transition hover:bg-[#176c58] disabled:cursor-not-allowed disabled:bg-[#a9b9b4]"
                disabled={!question.trim() || !canAsk}
                title="Send question"
              >
                <Send size={18} />
              </button>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#ecf4f1] text-[#1f8a70]">
          <Bot size={17} />
        </div>
      )}
      <div
        className={`max-w-[820px] rounded-lg px-4 py-3 text-sm leading-6 ${
          isUser ? "bg-[#191816] text-white" : "border border-[#dedbd2] bg-[#fbfaf7] text-[#26231f]"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.sources?.length ? (
          <div className="mt-4 border-t border-[#e2ded5] pt-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6a60]">
              Retrieved sources
            </p>
            <div className="space-y-2">
              {message.sources.map((source) => (
                <details key={source.id} className="rounded-md border border-[#e2ded5] bg-white p-2">
                  <summary className="cursor-pointer text-xs font-medium text-[#4d4942]">
                    {source.pageNumber ? `Page ${source.pageNumber}` : `Chunk ${source.chunkIndex + 1}`}
                    {typeof source.score === "number" ? ` · score ${source.score.toFixed(3)}` : ""}
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-[#5f5a52]">{source.text}</p>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {isUser && (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#f2eee3] text-[#7b5e24]">
          <User size={17} />
        </div>
      )}
    </article>
  );
}
