"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  MessageSquareText,
  Plus,
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
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
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
  const canAsk = selectedDocumentIds.length > 0 && !busy;

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedDocumentIds.includes(document.documentId)),
    [documents, selectedDocumentIds]
  );

  const sourceStats = useMemo(() => {
    const chunkCount = selectedDocuments.reduce((total, document) => total + document.chunkCount, 0);
    const characterCount = selectedDocuments.reduce(
      (total, document) => total + document.characterCount,
      0
    );

    return `${selectedDocuments.length} selected · ${chunkCount} chunks · ${characterCount.toLocaleString()} characters`;
  }, [selectedDocuments]);

  async function uploadDocuments(files: FileList | File[] | undefined) {
    const filesToUpload = Array.from(files || []);
    if (!filesToUpload.length || uploading) return;

    setUploading(true);
    setError(null);
    setUploadError(null);
    setSelectedFileName(
      filesToUpload.length === 1 ? filesToUpload[0].name : `${filesToUpload.length} files selected`
    );
    setUploadStage("reading");
    setStatus(null);

    const extractionTimer = window.setTimeout(() => {
      setUploadStage("extracting");
    }, 900);
    const indexingTimer = window.setTimeout(() => {
      setUploadStage("indexing");
    }, 2800);

    try {
      const uploadedDocuments: UploadedDocument[] = [];

      for (const file of filesToUpload) {
        setSelectedFileName(file.name);
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || `Upload failed for ${file.name}.`);
        uploadedDocuments.push(data);
      }

      setDocuments((current) => [...current, ...uploadedDocuments]);
      setSelectedDocumentIds((current) => [
        ...new Set([...current, ...uploadedDocuments.map((document) => document.documentId)]),
      ]);
      setMessages([]);
      setUploadStage("ready");
      setStatus(
        uploadedDocuments.length === 1
          ? "Source indexed. Ask a question grounded in its content."
          : `${uploadedDocuments.length} sources indexed. Ask across the selected sources.`
      );
    } catch (uploadError) {
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
    const activeDocumentIds = selectedDocumentIds.filter((id) =>
      documents.some((document) => document.documentId === id)
    );
    if (!text || !activeDocumentIds.length || asking) return;

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
        body: JSON.stringify({ documentIds: activeDocumentIds, question: text }),
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

  function openFilePicker() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void uploadDocuments(event.dataTransfer.files);
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) => {
      if (current.includes(documentId)) {
        return current.filter((id) => id !== documentId);
      }

      return [...current, documentId];
    });
  }

  function getUploadStepState(stage: UploadStage) {
    const activeIndex = UPLOAD_STEPS.findIndex((step) => step.stage === stage);

    return UPLOAD_STEPS.map((step, index) => ({
      ...step,
      done: stage === "ready" || activeIndex > index,
      active: activeIndex === index,
    }));
  }

  const uploadPanel = (
    <div className="rounded-2xl border border-[#dedbd2] bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-[#202124]">Add sources</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#5f6368]">
            Sources let this notebook base its responses on the information that matters most
            to you.
          </p>
        </div>
        <div className="rounded-full bg-[#f1f3f4] px-3 py-1 text-xs font-medium text-[#5f6368]">
          {documents.length} / 50
        </div>
      </div>

      <div
        className={`mt-6 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition ${
          dragActive
            ? "border-[#1a73e8] bg-[#f1f7ff]"
            : "border-[#c7c9cc] bg-[#fafafa] hover:border-[#1a73e8] hover:bg-[#f8fbff]"
        } ${uploading ? "cursor-wait opacity-90" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") openFilePicker();
        }}
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">
          {uploading ? <Loader2 className="animate-spin" size={26} /> : <Upload size={26} />}
        </span>
        <span className="mt-5 text-base font-medium text-[#202124]">
          {uploading ? "Uploading and processing source" : "Upload sources"}
        </span>
        <span className="mt-2 max-w-md text-sm leading-6 text-[#5f6368]">
          {uploading
            ? selectedFileName || "Preparing your document..."
            : "Drag and drop or choose PDF, TXT, or Markdown files to start your notebook."}
        </span>
        {!uploading && (
          <button
            type="button"
            className="mt-5 rounded-full bg-[#0b57d0] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#0842a0]"
            onClick={(event) => {
              event.stopPropagation();
              openFilePicker();
            }}
          >
            Choose files
          </button>
        )}
      </div>

      {(uploading || uploadStage === "ready" || uploadStage === "error") && (
        <div className="mt-5 rounded-2xl border border-[#e3e3e3] bg-[#fafafa] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {getUploadStepState(uploadStage).map((step) => (
              <div key={step.stage} className="flex items-center gap-2 text-sm">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full ${
                    step.done
                      ? "bg-[#188038] text-white"
                      : step.active
                        ? "bg-[#e8f0fe] text-[#1a73e8]"
                        : "bg-[#edf0f2] text-[#7b8085]"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 size={14} />
                  ) : step.active ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className={step.done || step.active ? "text-[#202124]" : "text-[#6f7377]"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {uploadStage === "extracting" && (
            <p className="mt-4 text-sm leading-6 text-[#5f6368]">
              Scanned PDFs can take longer. If no text layer is found, Gemini extracts the
              readable text before indexing.
            </p>
          )}

          {uploadError && (
            <div className="mt-4 flex gap-2 rounded-xl border border-[#f3b7ae] bg-[#fff6f4] p-3 text-sm leading-6 text-[#b42318]">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!documents.length) {
    return (
      <main className="min-h-screen bg-[#f8fafd] text-[#202124]">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">
              <FileText size={19} />
            </div>
            <div>
              <p className="text-sm font-medium text-[#202124]">Notebook RAG</p>
              <p className="text-xs text-[#5f6368]">Assignment 03</p>
            </div>
          </div>
          <div className="rounded-full border border-[#dadce0] bg-white px-3 py-1.5 text-xs text-[#5f6368]">
            Gemini · Qdrant
          </div>
        </header>

        <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-4xl place-items-center px-5 pb-12">
          <div className="w-full">
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              disabled={uploading}
              multiple
              onChange={(event) => void uploadDocuments(event.target.files || undefined)}
            />
            {uploadPanel}
            <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-5 text-[#6f7377]">
              Uploading creates a private vector index for this notebook. Answers become available
              after the source finishes processing.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafd] text-[#202124]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex h-14 items-center justify-between border-b border-[#dadce0]">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">
              <FileText size={17} />
            </div>
            <h1 className="text-base font-medium">Notebook RAG</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5f6368]">
            <span className="h-2 w-2 rounded-full bg-[#188038]" />
            Source grounded
          </div>
        </header>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-[#dadce0] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Sources</h2>
                  <p className="mt-1 text-xs text-[#5f6368]">{sourceStats}</p>
                </div>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#dadce0] text-[#1a73e8] transition hover:bg-[#f8fbff] disabled:cursor-wait disabled:opacity-60"
                  title="Add sources"
                  disabled={uploading}
                  onClick={openFilePicker}
                >
                  {uploading ? <Loader2 className="animate-spin" size={17} /> : <Plus size={18} />}
                </button>
              </div>

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                disabled={uploading}
                multiple
                onChange={(event) => void uploadDocuments(event.target.files || undefined)}
              />

              <div className="mt-3 space-y-2">
                {documents.map((document) => {
                  const selected = selectedDocumentIds.includes(document.documentId);
                  return (
                    <label
                      key={document.documentId}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        selected
                          ? "border-[#1a73e8] bg-[#f8fbff]"
                          : "border-[#e8eaed] bg-[#f8fafd] hover:border-[#b9c7e8]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[#1a73e8]"
                        checked={selected}
                        onChange={() => toggleDocument(document.documentId)}
                      />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{document.fileName}</p>
                        <p className="mt-1 text-xs text-[#5f6368]">
                          {document.chunkCount} chunks · {document.characterCount.toLocaleString()} characters
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {uploadError && (
                <div className="mt-3 flex gap-2 rounded-xl border border-[#f3b7ae] bg-[#fff6f4] p-3 text-xs leading-5 text-[#b42318]">
                  <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#dadce0] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Try asking</h2>
              <div className="mt-3 flex flex-col gap-2">
                {SAMPLE_QUESTIONS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="rounded-xl border border-[#dadce0] px-3 py-2 text-left text-sm text-[#3c4043] transition hover:border-[#1a73e8] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAsk}
                    onClick={() => void askQuestion(sample)}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col rounded-2xl border border-[#dadce0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[#fef7e0] text-[#b06000]">
                  <MessageSquareText size={19} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Notebook chat</h2>
                  <p className="text-xs text-[#5f6368]">Answers are restricted to retrieved chunks.</p>
                </div>
              </div>
              {busy && <Loader2 className="animate-spin text-[#1a73e8]" size={20} />}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {!messages.length ? (
                <div className="grid h-full min-h-[360px] place-items-center text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#ecf4f1] text-[#1f8a70]">
                      {uploading ? <ScanText size={24} /> : <Database size={24} />}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {uploading
                        ? "Preparing your document"
                        : selectedDocumentIds.length
                          ? "Sources ready for questions"
                          : "Select a source to begin"}
                    </h3>
                    <p className="mt-2 text-sm text-[#6f6a60]">
                      {uploading
                        ? "The app is extracting text, creating chunks, embedding them, and storing them in Qdrant."
                        : selectedDocumentIds.length
                          ? "Ask a question below or use one of the prompts on the left."
                          : "Choose at least one source from the left panel."}
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
                placeholder={
                  selectedDocumentIds.length
                    ? "Ask across the selected sources..."
                    : "Select at least one source first..."
                }
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
  const hasAnswerText = message.content.trim().length > 0;

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
        {hasAnswerText ? (
          <FormattedMessage content={message.content} />
        ) : (
          <p className="text-[#6f6a60]">Thinking...</p>
        )}
        {!isUser && hasAnswerText && message.sources?.length ? (
          <div className="mt-4 border-t border-[#e2ded5] pt-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6a60]">
              Retrieved sources
            </p>
            <div className="space-y-2">
              {message.sources.map((source) => (
                <details key={source.id} className="rounded-md border border-[#e2ded5] bg-white p-2">
                  <summary className="cursor-pointer text-xs font-medium text-[#4d4942]">
                    {source.fileName} · {source.pageNumber ? `Page ${source.pageNumber}` : `Chunk ${source.chunkIndex + 1}`}
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

function FormattedMessage({ content }: { content: string }) {
  const lines = content.trim().split(/\n+/);
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;

    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {listItems.map((item, index) => (
          <li key={index}>{formatInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${index}`} className="my-2">
        {formatInlineMarkdown(trimmed)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1">{blocks}</div>;
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}
