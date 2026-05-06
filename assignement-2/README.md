# Assignment 02 — AI Agent CLI Tool

**Student:** Kartikey · **Roll No.** 24BCS10121 · **Course:** GenAI / Prompt Engineering, Scaler Academy

A conversational CLI agent — like Cursor or Windsurf, but in your terminal. You type a natural-language instruction, the agent reasons through it step-by-step using an explicit `START → THINK → TOOL → OBSERVE → OUTPUT` loop, and produces real files on disk.

The demo task: **clone the Scaler Academy website** (header, hero, footer) into a folder of working HTML/CSS/JS that opens in a browser. The agent itself is **general-purpose** — same code can clone any site or scaffold any small project.

---

## Demo

- **YouTube (2–3 min walkthrough):** https://youtu.be/q4sSccV80oM
- Sample prompt used in the video:
  > Clone the Scaler Academy website (scaler.com) into a folder called `scaler_clone`. Include a header with navigation, a hero section with a headline and CTA button, a course-cards section, and a footer. Use the dark navy + red accent palette. Make it responsive.

---

## Quick start

```bash
cd assignement-2
cp .env.example .env          # then paste your OpenRouter key into .env
npm install
npm start
```

You'll get a prompt:

```
┌──────────────────────────────────────────────┐
│  Agent CLI · model: openai/gpt-4.1-mini      │
│  Type your instruction. 'exit' to quit.      │
└──────────────────────────────────────────────┘

you ▸
```

Type any instruction. Watch the loop run. Type `exit` to quit.

---

## How the agent works

Every turn, the model is forced (via `response_format: { type: "json_object" }`) to emit one JSON object per step:

```json
{ "step": "THINK", "content": "I'll start by sketching the file structure..." }
```

The runner reads `step`, prints it with a colored tag, and either:
- **TOOL** → dispatches to the matching JS function, captures the result, pushes it back as an `OBSERVE` message, loops.
- **OUTPUT** → ends the turn and returns to the user prompt.
- everything else → just gets printed and the loop continues.

The model is instructed to do **multiple THINK steps before any TOOL call**, so reasoning is visible.

### Tools the agent can call

| Tool | Purpose |
|---|---|
| `writeFileTool({ path, content })` | Create or overwrite a file. Auto-creates parent dirs. The primary tool for generating HTML/CSS/JS. |
| `readFileTool({ path })` | Read a file (truncated at 4 KB) so the agent can verify or iterate. |
| `executeCommand({ cmd })` | Run any shell command (`mkdir`, `open`, `ls`, …). 30-second timeout. |
| `listDir({ path })` | Convenience wrapper around `ls -la`. |

All file paths are sandboxed to the working directory — the agent cannot escape it.

### Why OpenRouter

The reference assignment code uses the OpenAI SDK. OpenRouter exposes an OpenAI-compatible endpoint, so the same SDK works unchanged — just a `baseURL` swap. This lets us use `openai/gpt-4.1-mini` (or swap to Anthropic / Gemini models) without rewriting any client code. See `src/agent.js` for the two-line config.

### Why `response_format: json_object`

The naive version of this loop crashes whenever the model emits even slightly malformed JSON. Forcing JSON mode at the API level (plus a try/catch fallback that asks the model to retry) makes the loop robust over long multi-step tasks.

---

## Project structure

```
assignement-2/
├── src/
│   └── agent.js        # the entire agent — REPL, loop, tools, prompt
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

That's it. ~200 lines of code, zero framework, no transpilation.

---

## Example transcript (abridged)

```
you ▸ Clone scaler.com into scaler_clone with header, hero, course cards, footer.

▶ START   User wants a Scaler-style site cloned into ./scaler_clone with four sections.
🧠 THINK   I'll plan the file layout: index.html, style.css, script.js inside scaler_clone/.
🧠 THINK   The palette should be dark navy #0b1226 with a red #ee3957 accent, white text.
🔧 TOOL    writeFileTool({"path":"scaler_clone/index.html", ...})
👁  OBSERVE Wrote 3214 bytes to scaler_clone/index.html
🧠 THINK   Now the stylesheet — flexbox header, grid for course cards, responsive breakpoints.
🔧 TOOL    writeFileTool({"path":"scaler_clone/style.css", ...})
👁  OBSERVE Wrote 4180 bytes to scaler_clone/style.css
🧠 THINK   Add a small JS file for the mobile menu toggle.
🔧 TOOL    writeFileTool({"path":"scaler_clone/script.js", ...})
👁  OBSERVE Wrote 412 bytes to scaler_clone/script.js
🧠 THINK   Verify by reading index.html back.
🔧 TOOL    readFileTool({"path":"scaler_clone/index.html"})
👁  OBSERVE <!doctype html><html lang="en">...
✅ OUTPUT  Done. Open with: open scaler_clone/index.html
```

---

## Configuration

`.env` keys:

| Key | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | — | Get one at https://openrouter.ai/keys |
| `MODEL` | no | `openai/gpt-4.1-mini` | Any OpenRouter-supported model. Try `openai/gpt-4o`, `anthropic/claude-sonnet-4.5` for higher fidelity clones. |

---

## Notes on scoring criteria

| Criterion | Where it lives |
|---|---|
| GitHub repo | this folder, public |
| YouTube demo | linked above once recorded |
| Agent loop & reasoning | visible in every run — colored `START/THINK/TOOL/OBSERVE/OUTPUT` tags, multi-step planning enforced by the system prompt |
| Cloned website quality | model produces semantic HTML, modern CSS, and a JS interaction; verify in browser after the demo run |
| Code quality & docs | single-file agent, sandboxed paths, JSON-mode safety, this README |

---

## Limitations & honest caveats

- The agent's quality scales with the model. `gpt-4.1-mini` is the cheap default; bump to `gpt-4o` for prettier sites.
- Shell commands run with the user's permissions — don't paste prompts you don't trust.
- File writes are sandboxed to the current working directory, but `executeCommand` is not. Treat this as a dev-machine tool, not a server.
