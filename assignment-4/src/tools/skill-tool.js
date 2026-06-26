import { getSkillStore } from "../skills/store.js";

export const skillToolSchema = {
  name: "skill_manage",
  description: `Manage procedural memory (skills). Use for reusable HOW-TO knowledge:
- create/patch umbrella skills (web-automation, etc.)
- write_file site-specific references under references/<domain>.md
Do NOT store user preferences here — use memory tool for that.`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "patch", "write_file", "list", "delete"],
      },
      name: { type: "string", description: "Skill folder name, e.g. web-automation" },
      content: { type: "string", description: "Full SKILL.md body for create" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      file_path: { type: "string", description: "Relative path inside skill, e.g. references/google-com.md" },
      file_content: { type: "string" },
    },
    required: ["action"],
  },
};

export async function handleSkillTool(args) {
  const store = await getSkillStore();
  const { action, name, content, old_string: oldString, new_string: newString, file_path: filePath, file_content: fileContent } = args;

  try {
    switch (action) {
      case "list":
        return JSON.stringify({ success: true, skills: await store.list() }, null, 2);
      case "create":
        return JSON.stringify(await store.create(name, content), null, 2);
      case "patch":
        return JSON.stringify(await store.patch(name, oldString, newString), null, 2);
      case "write_file":
        return JSON.stringify(await store.writeFile(name, filePath, fileContent), null, 2);
      case "delete":
        return JSON.stringify(await store.delete(name), null, 2);
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}