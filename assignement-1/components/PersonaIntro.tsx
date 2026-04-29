"use client";

import type { PersonaMeta } from "@/lib/types";

interface Props {
  persona: PersonaMeta;
}

export default function PersonaIntro({ persona }: Props) {
  return (
    <div className="intro">
      <div
        className="intro__badge"
        style={{ background: persona.accentDim, color: persona.accent }}
      >
        {persona.initials}
      </div>
      <div className="intro__name">{persona.name}</div>
      <div className="intro__role">{persona.role}</div>
      <p className="intro__blurb">{persona.blurb}</p>
      <div className="intro__hint">Pick a starter below or type your own question.</div>
    </div>
  );
}
