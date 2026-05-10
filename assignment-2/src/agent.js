import "dotenv/config";
import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const execAsync = promisify(exec);

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

const ROOT = process.cwd();

function safePath(p) {
  const abs = resolve(ROOT, p);
  if (!abs.startsWith(ROOT)) {
    throw new Error(`Refusing to touch path outside working directory: ${p}`);
  }
  return abs;
}

const tools = {
  async writeFileTool(args) {
    const { path, content } = typeof args === "string" ? JSON.parse(args) : args;
    const abs = safePath(path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Wrote ${content.length} bytes to ${path}`;
  },

  async readFileTool(args) {
    const path = typeof args === "string" ? args : args.path;
    const abs = safePath(path);
    const data = await readFile(abs, "utf8");
    return data.length > 4000 ? data.slice(0, 4000) + "\n...[truncated]" : data;
  },

  async executeCommand(args) {
    const cmd = typeof args === "string" ? args : args.cmd;
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: ROOT, timeout: 30_000 });
      return (stdout + (stderr ? `\n[stderr] ${stderr}` : "")).slice(0, 4000) || "(command produced no output)";
    } catch (err) {
      return `Command failed: ${err.message}`;
    }
  },

  async listDir(args) {
    const path = typeof args === "string" ? args : (args.path || ".");
    return tools.executeCommand({ cmd: `ls -la "${path}"` });
  },

  async fetchUrl(args) {
    const { url, maxBytes = 8000 } = typeof args === "string" ? { url: args } : args;
    if (!url) throw new Error("fetchUrl requires a url");
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AgentCLI/1.0)",
        accept: "text/html,text/css,application/javascript,application/json,text/*;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
    });
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    const isText =
      ctype.startsWith("text/") ||
      ctype.includes("json") ||
      ctype.includes("javascript") ||
      ctype.includes("xml") ||
      ctype.includes("svg") ||
      ctype === "";
    if (!isText) {
      const len = res.headers.get("content-length") || "unknown";
      return `HTTP ${res.status} ${ctype}\nNon-text response (${len} bytes) — refused to dump binary. Use this tool only for HTML/CSS/JS/JSON URLs.`;
    }
    const text = await res.text();
    const sample = text.slice(0, 1024);
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      if (code === 9 || code === 10 || code === 13) continue;
      if (code < 32 || code === 0xfffd) nonPrintable++;
    }
    if (sample.length > 0 && nonPrintable / sample.length > 0.1) {
      return `HTTP ${res.status} ${ctype}\nResponse appears to be binary or compressed (${text.length} bytes). Refusing to return body.`;
    }
    const head = text.slice(0, maxBytes);
    return `HTTP ${res.status} ${ctype}\nLength: ${text.length} bytes (showing first ${head.length})\n---\n${head}${text.length > head.length ? "\n...[truncated]" : ""}`;
  },
};

const TOOL_DESCRIPTIONS = `
1. fetchUrl({ "url": string, "maxBytes"?: number }) — Plain HTTP GET. Returns the raw response body (default first 8000 bytes). Use to inspect HTML, fetch a CSS file, or read a small JSON resource.
2. writeFileTool({ "path": string, "content": string }) — Create or overwrite a file. Auto-creates parent directories. USE THIS to create HTML/CSS/JS files (never echo into shell — quotes and newlines break).
3. readFileTool({ "path": string }) — Read a file's contents (truncated at 4KB).
4. executeCommand({ "cmd": string }) — Run any shell command. Use for "mkdir", "open", "ls", "open path/index.html". 30s timeout.
5. listDir({ "path": string }) — Convenience: list files in a directory.
`.trim();

const SYSTEM_PROMPT = `
You are an autonomous coding agent that runs in a terminal — like Cursor or Windsurf.
You receive a user's instruction and accomplish it by reasoning step-by-step and using tools.

You operate in a strict loop using these step types:
  START   — restate the user's goal in your own words
  THINK   — one small reasoning step. Do many of these. Plan, then refine.
  TOOL    — invoke ONE tool. Wait for the OBSERVE before continuing.
  OBSERVE — (sent back to you by the system after a TOOL) the tool's result.
  OUTPUT  — final message to the user. Ends the loop for this turn.

Tools available:
${TOOL_DESCRIPTIONS}

STRICT RULES
1. Every response is a SINGLE JSON object — no prose, no markdown, no code fences.
2. Schema: { "step": "START|THINK|TOOL|OBSERVE|OUTPUT", "content": string, "tool_name"?: string, "tool_args"?: object }
3. After a TOOL step, STOP and wait for the OBSERVE. Never emit OBSERVE yourself.
4. Do at least 2 THINK steps before any TOOL call. Plan before acting.
5. Break large tasks into many small steps. Build websites file-by-file (index.html, then style.css, then script.js).
6. tool_args is always an OBJECT matching the tool's schema.

WEBSITE-CLONE WORKFLOW (follow when asked to clone a site)
  a. (Optional) fetchUrl on the homepage to peek at the raw HTML and any inline metadata.
  b. THINK about layout: header (logo + nav + CTA), hero (eyebrow + headline + subhead + CTA), course/feature grid, social proof, footer (multi-column links).
  c. Decide a palette and typography that match the brand the user named (e.g. for an education brand: dark navy bg, white text, accent red, modern sans-serif).
  d. Write index.html, then style.css using CSS custom properties at :root for colours and fonts. Grid + Flexbox. One 768px breakpoint.
  e. Write script.js with at least one interaction (mobile menu toggle).
  f. readFileTool the index.html to verify, then OUTPUT with the "open ..." command.

QUALITY BAR
- Modern CSS only: custom properties, flex/grid, hover states, smooth transitions.
- Mobile-friendly. Single 768px breakpoint is sufficient.
- Original short copy, ~30 words per section.
- Semantic HTML5: header / nav / main / section / footer.

EXAMPLE
user: "create hello/index.html that says Hi"
assistant: {"step":"START","content":"User wants hello/index.html with 'Hi'."}
assistant: {"step":"THINK","content":"Single file, writeFileTool auto-creates the dir."}
assistant: {"step":"THINK","content":"Use minimal valid HTML5."}
assistant: {"step":"TOOL","tool_name":"writeFileTool","tool_args":{"path":"hello/index.html","content":"<!doctype html><html><body><h1>Hi</h1></body></html>"}}
developer: {"step":"OBSERVE","content":"Wrote 56 bytes to hello/index.html"}
assistant: {"step":"OUTPUT","content":"Done. open hello/index.html"}
`.trim();

const MAX_ITERS = 60;

function printStep(parsed) {
  const step = parsed.step;
  const tag = {
    START: `${c.cyan}${c.bold}▶ START${c.reset}`,
    THINK: `${c.yellow}🧠 THINK${c.reset}`,
    TOOL: `${c.magenta}${c.bold}🔧 TOOL${c.reset}`,
    OBSERVE: `${c.blue}👁  OBSERVE${c.reset}`,
    OUTPUT: `${c.green}${c.bold}✅ OUTPUT${c.reset}`,
  }[step] || step;

  if (step === "TOOL") {
    console.log(`${tag}  ${c.dim}${parsed.tool_name}${c.reset}(${c.dim}${JSON.stringify(parsed.tool_args).slice(0, 120)}${c.reset})`);
  } else {
    console.log(`${tag}  ${parsed.content}`);
  }
}

async function runTurn(client, model, messages) {
  for (let i = 0; i < MAX_ITERS; i++) {
    let parsed;
    try {
      const resp = await client.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 8000,
      });
      if (!resp?.choices?.[0]?.message) {
        throw new Error(`Bad response shape: ${JSON.stringify(resp).slice(0, 300)}`);
      }
      const raw = resp.choices[0].message.content;
      if (!raw) throw new Error("Empty response content from model.");
      parsed = JSON.parse(raw);
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      if (status === 401 || status === 402 || status === 403) {
        console.log(`${c.red}Auth/credit error (${status}): ${err.message}${c.reset}`);
        return "(aborted: API auth/credit error)";
      }
      const detail = err?.error?.message || err?.response?.data?.error?.message || err?.cause?.message || "";
      console.log(`${c.red}Model/JSON error: ${err.message}${detail ? ` — ${detail}` : ""}${c.reset}`);
      messages.push({
        role: "user",
        content: JSON.stringify({ step: "OBSERVE", content: `Your last response was invalid JSON or the API failed: ${String(err.message).slice(0, 400)}. Reply with ONE valid JSON object matching the schema.` }),
      });
      continue;
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    printStep(parsed);

    if (parsed.step === "OUTPUT") return parsed.content;

    if (parsed.step === "TOOL") {
      const fn = tools[parsed.tool_name];
      let result;
      if (!fn) {
        result = `Unknown tool: ${parsed.tool_name}. Available: ${Object.keys(tools).join(", ")}`;
      } else {
        try {
          result = await fn(parsed.tool_args ?? {});
        } catch (err) {
          result = `Tool error: ${String(err.message || err).slice(0, 600)}`;
        }
      }
      if (typeof result === "string" && result.length > 8000) {
        result = result.slice(0, 8000) + "\n...[truncated]";
      }
      const preview = String(result);
      console.log(`${c.blue}👁  OBSERVE${c.reset}  ${c.dim}${preview.slice(0, 200).replace(/\n/g, " ")}${preview.length > 200 ? "..." : ""}${c.reset}`);
      messages.push({ role: "user", content: JSON.stringify({ step: "OBSERVE", content: preview }) });
    }
  }
  return "(reached max iterations without OUTPUT)";
}

// Gemini native wrapper that exposes the same .chat.completions.create shape.
// More reliable than Gemini's OpenAI-compat layer.
function buildGeminiNativeClient(apiKey) {
  const genai = new GoogleGenerativeAI(apiKey);
  return {
    chat: {
      completions: {
        async create({ model, messages, temperature, max_tokens, response_format }) {
          let systemInstruction;
          const contents = [];
          for (const m of messages) {
            const text = typeof m.content === "string"
              ? m.content
              : m.content.map((p) => p.text || "").join("");
            if (m.role === "system") {
              systemInstruction = (systemInstruction ? systemInstruction + "\n\n" : "") + text;
              continue;
            }
            const role = m.role === "assistant" ? "model" : "user";
            contents.push({ role, parts: [{ text }] });
          }
          const generationConfig = { temperature, maxOutputTokens: max_tokens };
          if (response_format?.type === "json_object") {
            generationConfig.responseMimeType = "application/json";
          }
          const gm = genai.getGenerativeModel({
            model,
            systemInstruction: systemInstruction
              ? { role: "system", parts: [{ text: systemInstruction }] }
              : undefined,
          });
          const res = await gm.generateContent({ contents, generationConfig });
          return { choices: [{ message: { content: res.response.text() } }] };
        },
      },
    },
  };
}

function buildClient() {
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      defaultModel: "gemini-2.5-flash",
      client: buildGeminiNativeClient(process.env.GEMINI_API_KEY),
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      defaultModel: "openai/gpt-4.1-mini",
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/Json604/GenAI-Assignments-2028",
          "X-OpenRouter-Title": "Scaler Assignment-2 Agent CLI",
        },
      }),
    };
  }
  console.error(`${c.red}No API key found. Set GEMINI_API_KEY or OPENROUTER_API_KEY in .env.${c.reset}`);
  process.exit(1);
}

async function main() {
  const { provider, defaultModel, client } = buildClient();
  const model = process.env.MODEL || defaultModel;

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  console.log(`${c.bold}${c.cyan}\nAgent CLI · ${provider} · ${model}`);
  console.log(`Tools: ${Object.keys(tools).join(", ")}`);
  console.log(`Type your instruction. 'exit' to quit.${c.reset}\n`);

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const userMsg = (await rl.question(`${c.bold}you ▸ ${c.reset}`)).trim();
      if (!userMsg) continue;
      if (userMsg === "exit" || userMsg === "quit") break;

      messages.push({ role: "user", content: userMsg });
      console.log();
      const final = await runTurn(client, model, messages);
      console.log(`\n${c.green}${final}${c.reset}\n`);
    }
  } finally {
    rl.close();
    console.log(`${c.dim}bye.${c.reset}`);
  }
}

main().catch((err) => {
  console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
