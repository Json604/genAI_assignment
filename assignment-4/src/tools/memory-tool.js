import { getMemoryStore } from "../memory/store.js";

export const memoryToolSchema = {
  name: "memory",
  description: `Save durable facts for future sessions. Proactively save:
- Site quirks (selectors, flows, layout patterns)
- API or DOM behavior you discovered
- User preferences and corrections
Do NOT save transient task progress. Use add for new facts, replace to merge/update, remove to delete.`,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "replace", "remove"] },
      target: { type: "string", enum: ["memory", "user"], description: "memory=agent notes, user=user profile" },
      content: { type: "string", description: "Text to add or replacement content" },
      old_text: { type: "string", description: "Unique substring of entry to replace/remove" },
    },
    required: ["action", "target"],
  },
};

export async function handleMemoryTool(args) {
  const store = await getMemoryStore();
  const { action, target, content, old_text: oldText } = args;

  let result;
  switch (action) {
    case "add":
      result = await store.add(target, content);
      break;
    case "replace":
      result = await store.replace(target, oldText, content);
      break;
    case "remove":
      result = await store.remove(target, oldText);
      break;
    default:
      result = { success: false, error: `Unknown action: ${action}` };
  }

  return JSON.stringify(result, null, 2);
}