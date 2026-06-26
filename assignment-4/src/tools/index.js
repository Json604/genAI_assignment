import { browserToolSchemas, handleBrowserTool } from "./browser-tools.js";
import { memoryToolSchema, handleMemoryTool } from "./memory-tool.js";
import { skillToolSchema, handleSkillTool } from "./skill-tool.js";
import { sessionSearchToolSchema, handleSessionSearchTool } from "./session-search-tool.js";
import { credentialToolSchema, handleCredentialTool } from "./credential-tool.js";
import { askUserToolSchema, handleAskUserTool } from "./ask-user-tool.js";
export const allToolSchemas = [
  ...browserToolSchemas,
  askUserToolSchema,
  memoryToolSchema,
  skillToolSchema,
  sessionSearchToolSchema,
  credentialToolSchema,
];

const HANDLERS = {
  ask_user: handleAskUserTool,
  memory: handleMemoryTool,
  skill_manage: handleSkillTool,
  session_search: handleSessionSearchTool,
  credentials_get: handleCredentialTool,
};

for (const schema of browserToolSchemas) {
  HANDLERS[schema.name] = (args) => handleBrowserTool(schema.name, args);
}

export async function dispatchTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) {
    return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
  }
  return handler(args || {});
}