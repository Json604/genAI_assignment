export const askUserToolSchema = {
  name: "ask_user",
  description:
    "Ask the user when you are stuck: task unclear, UI ambiguous, need confirmation before an external/risky step, or actions are not working. Say what you see and what you need.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "What you need from the user",
      },
      situation: {
        type: "string",
        description: "Optional: what you currently see on the page",
      },
      options: {
        type: "array",
        description: "Optional: approaches you could try, if helpful",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            description: { type: "string" },
          },
          required: ["id", "label"],
        },
      },
    },
    required: ["question"],
  },
};

/** @type {((args: AskUserArgs) => Promise<string>) | null} */
let askUserFn = null;

/** @typedef {{ question: string; situation?: string; options?: { id: string; label: string; description?: string }[] }} AskUserArgs */

export function setAskUserHandler(fn) {
  askUserFn = fn;
}

/** @param {AskUserArgs} args */
export async function handleAskUserTool(args) {
  if (!askUserFn) {
    return JSON.stringify({
      success: false,
      error: "ask_user is not available in this context",
    });
  }
  const answer = await askUserFn({
    question: args.question || "Could you clarify?",
    situation: args.situation,
    options: args.options,
  });
  return JSON.stringify({ success: true, answer });
}