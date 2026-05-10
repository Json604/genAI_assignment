"use client";

import type { PersonaMeta } from "@/lib/types";

interface Props {
  persona: PersonaMeta;
  onPick: (text: string) => void;
  locked: boolean;
}

export default function QuickPrompts({ persona, onPick, locked }: Props) {
  return (
    <div className="qp">
      {persona.quickPrompts.map((text) => (
        <button
          key={text}
          type="button"
          className="qp__chip"
          onClick={() => onPick(text)}
          disabled={locked}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
