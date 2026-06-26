import { loadConfig } from "../config.js";
import { createLLMProvider } from "../llm/registry.js";
import { memoryToolSchema, handleMemoryTool } from "../tools/memory-tool.js";
import { skillToolSchema, handleSkillTool } from "../tools/skill-tool.js";

const REVIEW_TOOLS = [memoryToolSchema, skillToolSchema];

const MEMORY_REVIEW_PROMPT = `Review the conversation above. Save durable lessons ONLY:
- Exact URLs and domains that worked (and wrong ones that failed)
- Step-by-step workflows that SUCCEEDED — numbered tool sequence with page URLs
  Example: "1. navigate /strains 2. type Yeast Name filter 3. click SEARCH 4. wait navigation → /search/simple"
- Site quirks (search navigates to new URL, which button to click, multi-tab needed)
- User corrections or preferences
Do NOT save transient errors, bot_wall/CAPTCHA pauses, or one-off task output.
Never save "site blocks automation" from a single bot_wall event.
Never save "cannot bypass" for verification — agent should propose options and ask user first.
Never save "login does not work" / "clicking Log in fails" for any site — those are agent mistakes, not facts.
Never save workflows or "success" for a site unless the final answer proves the outcome (message sent, data returned, etc.).
Never save per-site UI quirks (dropdown behavior, one-off form notes) — those go stale fast.
- Use memory for short facts (correct domain, key URLs)
- Use skill_manage write_file → references/<domain>.md for full playbooks with ## Working workflow sections
Always update site playbooks when a workflow succeeded — future tasks depend on this.`;

/**
 * Run async self-improvement after a task completes.
 * @param {{ userTask: string; answer: string; toolTrace: string[] }} ctx
 */
export async function runBackgroundReview(ctx) {
  const config = loadConfig();
  const llm = createLLMProvider(config.llmProvider);

  const transcript = [
    `User task: ${ctx.userTask}`,
    ...ctx.toolTrace.map((t) => `Tool: ${t}`),
    `Final answer: ${ctx.answer}`,
  ].join("\n");

  const messages = [
    {
      role: "system",
      content:
        "You are a self-improvement reviewer. You may ONLY call memory and skill_manage. Be selective — save only durable knowledge.",
    },
    { role: "user", content: `${transcript}\n\n${MEMORY_REVIEW_PROMPT}` },
  ];

  const actions = [];

  for (let i = 0; i < 5; i += 1) {
    const result = await llm.chat({
      messages,
      tools: REVIEW_TOOLS,
      model: config.llmModel,
    });

    if (!result.toolCalls?.length) break;

    messages.push({ role: "assistant", content: result.content || "", toolCalls: result.toolCalls });

    for (const tc of result.toolCalls) {
      const handler = tc.name === "memory" ? handleMemoryTool : handleSkillTool;
      const out = await handler(tc.arguments);
      actions.push(`${tc.name}(${JSON.stringify(tc.arguments).slice(0, 80)})`);
      messages.push({
        role: "tool",
        toolCallId: tc.id,
        name: tc.name,
        content: out,
      });
    }
  }

  return actions;
}

export function spawnBackgroundReview(ctx, { onDone } = {}) {
  runBackgroundReview(ctx)
    .then((actions) => {
      if (actions.length) onDone?.(actions);
    })
    .catch(() => {});
}