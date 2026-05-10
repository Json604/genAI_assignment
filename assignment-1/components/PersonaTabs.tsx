"use client";

import type { PersonaMeta, PersonaId } from "@/lib/types";

interface Props {
  personas: PersonaMeta[];
  activeId: PersonaId;
  onSelect: (id: PersonaId) => void;
  locked: boolean;
}

export default function PersonaTabs({ personas, activeId, onSelect, locked }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Switch persona">
      {personas.map((p) => {
        const isActive = p.id === activeId;
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={isActive}
            disabled={locked && !isActive}
            onClick={() => onSelect(p.id)}
            className={`tab ${isActive ? "tab--on" : ""}`}
            style={{
              ["--tab-accent" as string]: p.accent,
            }}
          >
            <span className="tab__dot" aria-hidden />
            <span className="tab__label">
              <span className="tab__name">{p.name.split(" ")[0]}</span>
              <span className="tab__last">{p.name.split(" ").slice(1).join(" ")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
