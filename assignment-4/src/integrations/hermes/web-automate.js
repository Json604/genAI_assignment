/**
 * Hermes integration entry point.
 *
 * From Hermes/Jarvis, shell out or import:
 *   import { webAutomate } from '<path>/assignment-4/src/integrations/hermes/web-automate.js';
 *   await webAutomate('Go to example.com and get the page title');
 *
 * Or CLI:
 *   node src/integrations/hermes/web-automate.js "your task here"
 */
import "dotenv/config";
import { runAgentTask } from "../../agent/loop.js";
import { closeBrowserSession } from "../../browser/session.js";

/**
 * @param {string} task
 * @param {{ onStatus?: (line: string) => void; sessionId?: string }} [options]
 */
export async function webAutomate(task, options = {}) {
  try {
    return await runAgentTask(task, options);
  } finally {
    await closeBrowserSession();
  }
}

const isMain = process.argv[1]?.includes("web-automate");
if (isMain) {
  const task = process.argv.slice(2).join(" ");
  if (!task) {
    console.error("Usage: node src/integrations/hermes/web-automate.js \"<task>\"");
    process.exit(1);
  }
  webAutomate(task, { onStatus: (l) => console.log(l) })
    .then((answer) => {
      console.log("\nagent ▸", answer);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}