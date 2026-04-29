"use client";

import type { ChatMessage } from "@/lib/types";
import type { PersonaMeta } from "@/lib/types";
import Dots from "./Dots";

interface Props {
  msg: ChatMessage;
  persona: PersonaMeta;
  pending?: boolean;
}

export default function MessageRow({ msg, persona, pending }: Props) {
  const isUser = msg.role === "user";
  return (
    <div className={`row ${isUser ? "row--me" : "row--bot"}`}>
      {!isUser && (
        <div
          className="row__avatar"
          style={{ background: persona.accentDim, color: persona.accent }}
        >
          {persona.initials}
        </div>
      )}
      <div className="row__bubble">
        {pending ? <Dots /> : msg.content}
      </div>
    </div>
  );
}
