import { loadConfig } from "../config.js";
import { createLLMProvider } from "../llm/registry.js";
import { getMemoryStore } from "../memory/store.js";
import { getSkillStore } from "../skills/store.js";
import { getSessionDB } from "../memory/session-db.js";
import { getBrowserSession } from "../browser/session.js";
import { allToolSchemas, dispatchTool } from "../tools/index.js";
import { setAskUserHandler } from "../tools/ask-user-tool.js";
import { buildSystemPrompt } from "./prompt.js";
import { spawnBackgroundReview } from "./background-review.js";
import { prefetchTaskContext } from "./context-prefetch.js";
import { getAgentCredentials } from "../credentials/store.js";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
};

export async function runAgentTask(userTask, { onStatus, sessionId, askUserHandler } = {}) {
  if (askUserHandler) setAskUserHandler(askUserHandler);

  const config = loadConfig();
  const llm = createLLMProvider(config.llmProvider);
  const memory = await getMemoryStore();
  const skills = await getSkillStore();
  const sessionDb = await getSessionDB();

  if (sessionId) sessionDb.sessionId = sessionId;
  else if (!sessionDb.sessionId) sessionDb.startSession(userTask.slice(0, 80));

  const browser = getBrowserSession();
  browser.setUserTask(userTask);

  const creds = await getAgentCredentials();
  const systemPrompt = buildSystemPrompt({
    memorySnapshot: memory.getSnapshot(),
    skillIndex: await skills.buildIndex(),
    provider: config.llmProvider,
    model: config.llmModel,
    browserEnv: {
      mode: config.browserCdpUrl ? "cdp" : "playwright",
      cdpUrl: config.browserCdpUrl,
      agentEmail: creds.success ? creds.email : undefined,
    },
  });

  const log = (line) => onStatus?.(line);
  const enrichedTask = await prefetchTaskContext(userTask);

  /** @type {import('../llm/provider.js').ChatMessage[]} */
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: enrichedTask },
  ];

  sessionDb.logMessage({ role: "user", content: userTask });
  if (enrichedTask !== userTask) {
    log(`${c.dim}📎 Prefetched session/site context${c.reset}`);
  }

  const toolTrace = [];

  const pauseForBotWall = async (toolResult) => {
    if (!askUserHandler) return toolResult;

    let parsed;
    try {
      parsed = JSON.parse(toolResult);
    } catch {
      return toolResult;
    }

    if (!parsed?.bot_wall?.blocked) return toolResult;

    const question =
      parsed.bot_wall.user_action ||
      "A bot verification is showing in the browser window. Please complete it there, then reply done when finished.";

    const browser = getBrowserSession();
    const debugBefore = browser.supervisor.getDebugBundle();

    log(`${c.magenta}🛡 Bot check — waiting for you${c.reset}`);
    if (parsed.debug_summary || debugBefore.summary) {
      log(`${c.dim}Debug before verify:\n${parsed.debug_summary || debugBefore.summary}${c.reset}`);
    }
    for (const err of (parsed.http_errors || debugBefore.http_errors || []).slice(-3)) {
      log(`${c.dim}  HTTP ${err.status} ${err.url}${c.reset}`);
    }

    log(`${c.magenta}agent asks ▸${c.reset} ${question}`);
    const answer = await askUserHandler({ question });

    await browser.wait({ mode: "navigation" });
    const fresh = await browser.snapshot({ full: false });
    const debugAfter = browser.supervisor.getDebugBundle();

    const note = {
      ...parsed,
      bot_wall: { ...parsed.bot_wall, paused_for_user: true, user_said: answer },
      after_user_verify: {
        url: fresh.url,
        title: fresh.title,
        snapshot: fresh.snapshot,
        element_count: fresh.element_count,
        bot_wall: fresh.bot_wall,
        debug_summary: debugAfter.summary,
        http_errors: debugAfter.http_errors.slice(-8),
        network_failures: debugAfter.network_failures.slice(-8),
        console: debugAfter.console.slice(-10),
      },
      hint:
        fresh.bot_wall?.blocked
          ? "Bot check still active after user verify — call browser_debug. Try BROWSER_CDP_URL with a real Chrome profile, or complete verify in a normal browser first."
          : "User completed bot verification. Continue the original task — do not report failure.",
    };

    sessionDb.logMessage({ role: "user", content: `Bot check completed: ${answer}` });
    log(`${c.dim}↳ after verify: ${fresh.url} (${fresh.element_count} elements)${c.reset}`);
    if (fresh.bot_wall?.blocked) {
      log(`${c.yellow}⚠ Still on bot check page${c.reset}`);
      log(`${c.dim}${debugAfter.summary}${c.reset}`);
    }

    return JSON.stringify(note, null, 2);
  };

  for (let i = 0; i < config.maxIterations; i += 1) {
    if (i === config.maxIterations - 5) {
      log(`${c.dim}⚠ Approaching iteration limit (${config.maxIterations}) — batch tasks may need MAX_ITERATIONS higher${c.reset}`);
    }
    log(`${c.dim}── iteration ${i + 1}/${config.maxIterations} ──${c.reset}`);

    let result;
    const thinkStart = Date.now();
    const thinkHeartbeat = setInterval(() => {
      const secs = ((Date.now() - thinkStart) / 1000).toFixed(0);
      log(`${c.dim}  … waiting for ${config.llmModel} (${secs}s)${c.reset}`);
    }, 4000);

    try {
      result = await llm.chat({
        messages,
        tools: allToolSchemas,
        model: config.llmModel,
      });
    } catch (err) {
      const hint =
        config.llmProvider === "gemini"
          ? " If this mentions an expired API key but turn 1 worked, retry the command."
          : "";
      throw new Error(`${err instanceof Error ? err.message : err}${hint}`);
    } finally {
      clearInterval(thinkHeartbeat);
    }

    const thinkSecs = ((Date.now() - thinkStart) / 1000).toFixed(1);
    if (result.content?.trim()) {
      const thought = result.content.trim().replace(/\s+/g, " ");
      log(
        `${c.dim}  💭 ${thought.slice(0, 400)}${thought.length > 400 ? "…" : ""}${c.reset}`,
      );
    }
    if (result.toolCalls?.length) {
      log(`${c.dim}  ✓ model → ${result.toolCalls.length} tool call(s) (${thinkSecs}s)${c.reset}`);
    } else {
      log(`${c.dim}  ✓ model → final answer (${thinkSecs}s)${c.reset}`);
    }

    if (result.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: result.content || "",
        toolCalls: result.toolCalls,
      });

      for (const tc of result.toolCalls) {
        log(`${c.yellow}⚙ ${tc.name}${c.reset} ${c.dim}${JSON.stringify(tc.arguments)}${c.reset}`);

        await browser.start().catch(() => {});
        const before = browser.getBriefStatus();
        if (before.url) {
          log(
            `${c.dim}  → tab ${before.active_tab} · ${before.host} · ${before.url.slice(0, 72)}${before.url.length > 72 ? "…" : ""}${c.reset}`,
          );
        }

        const toolStart = Date.now();
        const useBrowserHeartbeat = tc.name.startsWith("browser_");
        if (tc.name === "ask_user") {
          log(`${c.dim}  ⏸ waiting for your input (no timeout)${c.reset}`);
        }
        const toolHeartbeat = useBrowserHeartbeat
          ? setInterval(() => {
              const secs = ((Date.now() - toolStart) / 1000).toFixed(0);
              log(`${c.dim}  … ${tc.name} still running (${secs}s) — check Chrome window${c.reset}`);
            }, 4000)
          : null;

        let toolResult;
        try {
          toolResult = await dispatchTool(tc.name, tc.arguments);
          if (tc.name.startsWith("browser_")) {
            toolResult = await pauseForBotWall(toolResult);
          }
        } finally {
          if (toolHeartbeat) clearInterval(toolHeartbeat);
        }

        const toolSecs = ((Date.now() - toolStart) / 1000).toFixed(1);
        toolTrace.push(`${tc.name}: ${toolResult.slice(0, 200)}`);
        sessionDb.logMessage({ role: "tool", content: toolResult, toolName: tc.name });

        let parsed;
        try {
          parsed = JSON.parse(toolResult);
        } catch {
          parsed = null;
        }

        if (parsed && parsed.success === false) {
          log(`${c.dim}  ✗ ${tc.name} failed after ${toolSecs}s${c.reset}`);
        } else {
          const hint = formatToolDoneHint(tc.name, parsed);
          log(`${c.dim}  ✓ ${tc.name} done (${toolSecs}s)${hint ? ` · ${hint}` : ""}${c.reset}`);
        }

        const previewLimit = parsed?.success === false ? 2000 : 500;
        const preview =
          toolResult.length > previewLimit
            ? `${toolResult.slice(0, previewLimit)}\n...[truncated]`
            : toolResult;
        log(`${c.cyan}↳${c.reset} ${preview}`);

        messages.push({
          role: "tool",
          toolCallId: tc.id,
          name: tc.name,
          content: toolResult,
        });
      }
      continue;
    }

    const answer = (result.content || "").trim() || "(no response)";
    sessionDb.logMessage({ role: "assistant", content: answer });
    log(`${c.green}✓ done${c.reset}`);

    if (config.backgroundReview) {
      spawnBackgroundReview({ userTask, answer, toolTrace }, {
        onDone: (actions) => {
          log(`${c.magenta}💾 Self-improvement: ${actions.join(" · ")}${c.reset}`);
        },
      });
    }

    return answer;
  }

  return `Stopped: reached max iterations (${config.maxIterations}) without a final answer. For batch tasks, say "continue" or set MAX_ITERATIONS higher in .env.`;
}

/** @param {string} name @param {Record<string, unknown> | null} parsed */
function formatToolDoneHint(name, parsed) {
  if (!parsed || parsed.success === false) return "";

  if (name.startsWith("browser_")) {
    const parts = [];
    if (parsed.active_tab) parts.push(`tab ${parsed.active_tab}`);
    if (typeof parsed.url === "string") {
      try {
        parts.push(new URL(parsed.url).hostname);
      } catch {
        parts.push(parsed.url.slice(0, 40));
      }
    }
    if (parsed.element_count != null) parts.push(`${parsed.element_count} elements`);
    if (parsed.target_label) parts.push(`clicked "${String(parsed.target_label).slice(0, 50)}"`);
    else if (parsed.clicked) parts.push(`ref ${parsed.clicked}`);
    if (parsed.url_changed === false && name === "browser_click") parts.push("URL unchanged");
    return parts.join(" · ");
  }

  return "";
}