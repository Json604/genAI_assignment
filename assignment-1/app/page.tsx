"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import PersonaTabs from "@/components/PersonaTabs";
import PersonaIntro from "@/components/PersonaIntro";
import QuickPrompts from "@/components/QuickPrompts";
import MessageRow from "@/components/MessageRow";
import PromptBar from "@/components/PromptBar";

import { PERSONAS, getPersona } from "@/lib/personas";
import type { ChatMessage, PersonaId } from "@/lib/types";

type Threads = Record<PersonaId, ChatMessage[]>;
type Errs = Record<PersonaId, string | null>;

const FRESH_THREADS: Threads = { anshuman: [], abhimanyu: [], kshitij: [] };
const FRESH_ERRS: Errs = { anshuman: null, abhimanyu: null, kshitij: null };

export default function Page() {
  const [activeId, setActiveId] = useState<PersonaId>("anshuman");
  const [threads, setThreads] = useState<Threads>(FRESH_THREADS);
  const [errs, setErrs] = useState<Errs>(FRESH_ERRS);
  const [busy, setBusy] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const persona = useMemo(() => getPersona(activeId), [activeId]);
  const thread = threads[activeId];
  const error = errs[activeId];

  const themeVars = {
    ["--accent" as string]: persona.accent,
    ["--accent-dim" as string]: persona.accentDim,
  } as CSSProperties;

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [thread.length, waitingForFirstToken, activeId]);

  const switchPersona = (id: PersonaId) => {
    if (id === activeId || busy) return;
    // Reset *that* persona's thread so switching == fresh conversation,
    // per the assignment spec.
    setThreads((prev) => ({ ...prev, [id]: [] }));
    setErrs((prev) => ({ ...prev, [id]: null }));
    setActiveId(id);
  };

  const clearCurrent = () => {
    if (busy) return;
    setThreads((prev) => ({ ...prev, [activeId]: [] }));
    setErrs((prev) => ({ ...prev, [activeId]: null }));
  };

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const targetPersona = activeId;
      const userMsg: ChatMessage = { role: "user", content: text };
      const baseHistory = [...threads[targetPersona], userMsg];

      setErrs((p) => ({ ...p, [targetPersona]: null }));
      setThreads((p) => ({ ...p, [targetPersona]: baseHistory }));
      setBusy(true);
      setWaitingForFirstToken(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: baseHistory,
            persona: targetPersona,
          }),
        });

        if (!res.ok || !res.body) {
          let reason = "Something went wrong. Please try again.";
          try {
            const data = await res.json();
            if (data?.error) reason = data.error;
          } catch {
            /* ignore */
          }
          throw new Error(reason);
        }

        // Insert empty placeholder we'll fill as tokens arrive.
        setThreads((p) => ({
          ...p,
          [targetPersona]: [...p[targetPersona], { role: "assistant", content: "" }],
        }));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let firstChunkSeen = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          if (!firstChunkSeen) {
            setWaitingForFirstToken(false);
            firstChunkSeen = true;
          }
          acc += chunk;
          setThreads((p) => {
            const list = p[targetPersona].slice();
            list[list.length - 1] = { role: "assistant", content: acc };
            return { ...p, [targetPersona]: list };
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setErrs((p) => ({ ...p, [targetPersona]: msg }));
        // Drop the placeholder bubble if no tokens ever came back.
        setThreads((p) => {
          const list = p[targetPersona].slice();
          if (
            list.length &&
            list[list.length - 1].role === "assistant" &&
            !list[list.length - 1].content
          ) {
            list.pop();
          }
          return { ...p, [targetPersona]: list };
        });
      } finally {
        setBusy(false);
        setWaitingForFirstToken(false);
      }
    },
    [activeId, busy, threads]
  );

  const isEmpty = thread.length === 0;

  return (
    <div className="shell" style={themeVars} data-persona={persona.id}>
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">
            <span className="brand__lhs">persona</span>
            <span className="brand__rhs">.chat</span>
          </div>
          <div className="brand__sub">
            scaler founders &amp; instructors · prompt-engineering assignment 01
          </div>
        </div>
        <PersonaTabs
          personas={PERSONAS}
          activeId={activeId}
          onSelect={switchPersona}
          locked={busy}
        />
      </header>

      <main className="stage">
        <div className="stage__inner">
          <div className="stage__head">
            <div className="stage__who">
              <span
                className="stage__chip"
                style={{ background: persona.accentDim, color: persona.accent }}
              >
                Talking to · {persona.name}
              </span>
              <span className="stage__role">{persona.role}</span>
            </div>
            <button
              type="button"
              className="stage__reset"
              onClick={clearCurrent}
              disabled={busy || isEmpty}
              title="Reset this conversation"
            >
              Reset
            </button>
          </div>

          <div className="scroller" ref={scrollerRef}>
            {isEmpty ? (
              <div className="empty">
                <PersonaIntro persona={persona} />
                {error && <div className="alert">{error}</div>}
                <QuickPrompts persona={persona} onPick={send} locked={busy} />
              </div>
            ) : (
              <div className="thread">
                {thread.map((m, i) => (
                  <MessageRow key={i} msg={m} persona={persona} />
                ))}
                {waitingForFirstToken && (
                  <MessageRow
                    msg={{ role: "assistant", content: "" }}
                    persona={persona}
                    pending
                  />
                )}
                {error && <div className="alert">{error}</div>}
              </div>
            )}
          </div>

          <PromptBar persona={persona} onSend={send} locked={busy} />
        </div>
      </main>

      <footer className="footnote">
        Built by Kartikey · 24BCS10121 · responses are AI-generated and do not
        represent the actual views of the named individuals.
      </footer>
    </div>
  );
}
