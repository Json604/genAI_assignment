# Hermes Integration

Call this agent from Hermes as a **hands** layer.  
**Full setup, CDP, credentials, and status:** see **`../../README.md`** (assignment-4 root).

## Option A — Shell tool (fastest)

```bash
cd /path/to/assignment-4
npm run chrome:cdp    # if not already running
node src/integrations/hermes/web-automate.js "Go to news.ycombinator.com and get top 3 stories"
```

## Option B — Import (Node)

```js
import { webAutomate } from "./assignment-4/src/integrations/hermes/web-automate.js";
const answer = await webAutomate("Search for good books on DuckDuckGo");
```

## Option C — Jarvis plugin stub

Create `~/.hermes/plugins/web-automator/index.js`:

```js
import { execSync } from "node:child_process";

export function register(ctx) {
  ctx.registerTool({
    name: "web_automate",
    toolset: "browser",
    schema: {
      name: "web_automate",
      description: "Run the web automation agent on any browsing task",
      parameters: {
        type: "object",
        properties: { task: { type: "string" } },
        required: ["task"],
      },
    },
    handler: async (args) => {
      const task = JSON.stringify(args.task);
      const out = execSync(
        `node /path/to/assignment-4/src/integrations/hermes/web-automate.js ${task}`,
        { encoding: "utf8", timeout: 300_000 },
      );
      return out;
    },
  });
}
```

## Environment

Uses `assignment-4/.env` — same `LLM_PROVIDER`, API keys, and `BROWSER_CDP_URL` as `npm start`.