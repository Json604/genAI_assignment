import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "./config.js";
import { listProviders } from "./llm/registry.js";
import { validateApiKey } from "./llm/validate-api-key.js";
import { runAgentTask } from "./agent/loop.js";
import { closeBrowserSession } from "./browser/session.js";
import { getMemoryStore } from "./memory/store.js";
import { getSkillStore } from "./skills/store.js";
import { getSessionDB } from "./memory/session-db.js";
import { runCuratorIfDue } from "./skills/curator.js";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
};

async function bootstrap() {
  await getMemoryStore();
  await getSkillStore();
  const archived = await runCuratorIfDue();
  if (archived?.length) {
    console.log(`${c.dim}Curator archived stale skills: ${archived.join(", ")}${c.reset}`);
  }
}

function banner() {
  const config = loadConfig();
  const browserMode = config.browserCdpUrl
    ? `CDP → ${config.browserCdpUrl}`
    : config.browserHeadless
      ? "headless Chromium"
      : "headful Chromium";
  console.log(`
${c.cyan}┌──────────────────────────────────────────────────────────┐
│  Web Automation Agent                                    │
│  provider: ${config.llmProvider.padEnd(10)}  model: ${config.llmModel.slice(0, 28).padEnd(28)} │
│  browser: ${browserMode.slice(0, 44).padEnd(44)} │
│  memory · skills · sessions · vision · learning          │
│  Type a web task. 'exit' to quit.                        │
└──────────────────────────────────────────────────────────┘${c.reset}
Providers: ${listProviders().join(", ")}
`);
}

async function main() {
  validateApiKey();
  await bootstrap();
  banner();

  const sessionDb = await getSessionDB();
  sessionDb.startSession("CLI session");

  const rl = readline.createInterface({ input, output });
  let turnCount = 0;

  const shutdown = async () => {
    sessionDb.endSession("closed");
    await closeBrowserSession();
    rl.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);

  while (true) {
    const task = await rl.question(`\n${c.bold}you ▸${c.reset} `);
    const trimmed = task.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "exit") {
      await shutdown();
      return;
    }

    turnCount += 1;

    try {
      const answer = await runAgentTask(trimmed, {
        sessionId: sessionDb.sessionId,
        onStatus: (line) => console.log(line),
        askUserHandler: async ({ question, situation, options }) => {
          console.log(`\n${c.magenta}agent asks ▸${c.reset} ${question}`);
          if (situation) console.log(`${c.dim}  ${situation}${c.reset}`);
          if (options?.length) {
            options.forEach((opt, i) => {
              console.log(`${c.dim}  ${i + 1}. ${opt.label}${c.reset}`);
            });
          }
          return (await rl.question(`${c.bold}you ▸${c.reset} `)).trim();
        },
      });
      console.log(`\n${c.green}agent ▸${c.reset} ${answer}`);
    } catch (err) {
      console.error(`\n${c.dim}error:${c.reset}`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeBrowserSession();
  process.exit(1);
});