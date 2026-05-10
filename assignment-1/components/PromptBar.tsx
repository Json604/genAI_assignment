"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonaMeta } from "@/lib/types";

interface Props {
  persona: PersonaMeta;
  onSend: (text: string) => void;
  locked: boolean;
}

export default function PromptBar({ persona, onSend, locked }: Props) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize on content change.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || locked) return;
    onSend(text);
    setDraft("");
  };

  return (
    <form
      className="bar"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={`Ask ${persona.name.split(" ")[0]} something…`}
        disabled={locked}
        rows={1}
      />
      <button
        type="submit"
        className="bar__send"
        disabled={locked || !draft.trim()}
        style={{ background: persona.accent }}
        aria-label="Send"
      >
        ↑
      </button>
    </form>
  );
}
