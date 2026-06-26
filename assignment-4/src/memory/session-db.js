import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "../config.js";

const DB_PATH = path.join(DATA_DIR, "state.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  tool_name,
  session_id UNINDEXED,
  content='messages',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, tool_name, session_id)
  VALUES (new.id, new.content, new.tool_name, new.session_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, tool_name, session_id)
  VALUES ('delete', old.id, old.content, old.tool_name, old.session_id);
END;
`;

export class SessionDB {
  constructor() {
    /** @type {DatabaseSync | null} */
    this.db = null;
    this.sessionId = null;
  }

  async init() {
    await mkdir(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(SCHEMA);
  }

  startSession(title = "CLI session") {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (id, title, started_at, status) VALUES (?, ?, ?, 'active')")
      .run(id, title, now);
    this.sessionId = id;
    return id;
  }

  endSession(status = "completed") {
    if (!this.sessionId) return;
    this.db
      .prepare("UPDATE sessions SET ended_at = ?, status = ? WHERE id = ?")
      .run(new Date().toISOString(), status, this.sessionId);
  }

  logMessage({ role, content, toolName }) {
    if (!this.sessionId) return;
    const text = (content || "").slice(0, 50_000);
    this.db
      .prepare(
        "INSERT INTO messages (session_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(this.sessionId, role, text, toolName || null, new Date().toISOString());
  }

  getRecentConversation(sessionId = this.sessionId, { maxMessages = 6 } = {}) {
    if (!sessionId) return [];
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE session_id = ? AND role IN ('user', 'assistant')
         ORDER BY id DESC LIMIT ?`,
      )
      .all(sessionId, maxMessages);
    return rows.reverse().map((r) => ({
      role: r.role,
      content: String(r.content || "").slice(0, 3000),
    }));
  }

  getRecentToolWorkflow(sessionId = this.sessionId, { limit = 12 } = {}) {
    if (!sessionId) return [];
    const rows = this.db
      .prepare(
        `SELECT tool_name, content FROM messages
         WHERE session_id = ? AND role = 'tool' AND tool_name LIKE 'browser_%'
         ORDER BY id DESC LIMIT ?`,
      )
      .all(sessionId, limit);
    return rows.reverse().map((r) => {
      let summary = r.tool_name;
      try {
        const parsed = JSON.parse(r.content || "{}");
        if (parsed.url) summary += ` → ${parsed.url}`;
        if (parsed.navigated_to) summary += ` → ${parsed.navigated_to}`;
        if (parsed.clicked) summary += ` click ${parsed.clicked}`;
        if (parsed.typed_into) summary += ` type ${parsed.typed_into}`;
        if (parsed.new_tab) summary += ` (tab ${parsed.new_tab})`;
      } catch {
        // keep tool name only
      }
      return summary;
    });
  }

  search(query, { limit = 8 } = {}) {
    const q = (query || "").trim();
    if (!q) {
      return {
        recent_sessions: this.db
          .prepare(
            "SELECT id, title, started_at, status FROM sessions ORDER BY started_at DESC LIMIT ?",
          )
          .all(limit),
      };
    }

    const ftsQuery = q
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w.replace(/"/g, "")}"`)
      .join(" ");

    try {
      const hits = this.db
        .prepare(
          `SELECT m.session_id, m.role, m.content, m.tool_name, m.created_at,
                  snippet(messages_fts, 0, '[', ']', '…', 20) AS snippet
           FROM messages_fts
           JOIN messages m ON m.id = messages_fts.rowid
           WHERE messages_fts MATCH ?
           ORDER BY m.created_at DESC
           LIMIT ?`,
        )
        .all(ftsQuery, limit);
      return { query: q, hits };
    } catch {
      return { query: q, hits: [], error: "No matches or invalid query" };
    }
  }
}

/** @type {SessionDB | null} */
let singleton = null;

export async function getSessionDB() {
  if (!singleton) {
    singleton = new SessionDB();
    await singleton.init();
  }
  return singleton;
}