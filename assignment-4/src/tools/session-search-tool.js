import { getSessionDB } from "../memory/session-db.js";

export const sessionSearchToolSchema = {
  name: "session_search",
  description:
    "Search past agent sessions for what was learned or done before. Use when the user asks about prior runs or you need historical context about a site.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords to search, e.g. 'youtube videos' or 'google bot'" },
      limit: { type: "number", description: "Max results, default 8" },
    },
  },
};

export async function handleSessionSearchTool(args) {
  const db = await getSessionDB();
  const result = db.search(args.query || "", { limit: args.limit || 8 });
  return JSON.stringify({ success: true, ...result }, null, 2);
}