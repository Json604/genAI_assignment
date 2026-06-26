# Architecture — Web Automation Agent

> Read **`README.md`** first for status, setup, and conventions. This doc covers **how the code works**.

## Overview

```txt
┌──────────────────────────────────────────────────────────────────┐
│  CLI (src/cli.js)                                                │
│    → AgentLoop (src/agent/loop.js)                               │
│    → LLM provider (src/llm/registry.js)                          │
│    → Tool dispatch (src/tools/index.js)                          │
│    → BrowserSession (src/browser/session.js)                     │
│         Playwright ──connectOverCDP──► Real Chrome (CDP mode)    │
│         or chromium.launch() (Playwright-only mode)                │
└──────────────────────────────────────────────────────────────────┘
```

Single general-purpose agent. No site-specific runners. Site knowledge → `data/skills/references/` and `data/memories/MEMORY.md` at runtime.

---

## Request flow

```txt
User prompt
  → buildSystemPrompt() — memory snapshot, skill index, CDP env block
  → context-prefetch — session_search for prior runs on same domains
  → LLM with function calling (up to MAX_ITERATIONS)
  → Tool handler → BrowserSession / memory / skills / credentials
  → Tool result JSON (snapshot, bot_wall, tabs, extra)
  → Append to messages[] — full history resent each iteration (see ROADMAP #1)
  → On ✓ done: log session to SQLite, runBackgroundReview()
```

---

## Browser layer

### Modes

| Mode | Trigger | Implementation |
|------|---------|----------------|
| CDP | `BROWSER_CDP_URL` set | `src/browser/cdp.js` — `chromium.connectOverCDP(url, { noDefaults: true })` |
| Playwright | no CDP URL | `chromium.launch()` + new context |

CDP uses `data/chrome-cdp-profile/` (isolated user-data-dir). `ensureCdpRunning()` spawns `scripts/chrome-agent-cdp.sh` if port is down.

### BrowserSession (`src/browser/session.js`)

Central API for all `browser_*` tools:

- **Navigation:** `navigate`, `search` (with engine fallback), `back`
- **Interaction:** `click`, `type`, `select`, `press`, `scroll`, `wait`
- **Observation:** `snapshot`, `extractText`, `vision`, `debugReport`
- **Tabs:** delegates to `src/browser/tabs.js`

Every mutating action calls `focusPage()` (`page.bringToFront()`) so CDP Chrome shows the active tab.

### Snapshots (`src/browser/snapshot.js`)

1. Collect typeable elements first (`input`, `textarea`, contenteditable).
2. Collect interactive elements (`button`, `link`, `combobox`, …).
3. If a dropdown is open, include `[role=option]` elements.
4. Assign monotonic refs via `RefRegistry` (`src/browser/ref-registry.js`).

**Accessible names:** for `combobox` / `select`, `comboboxDisplayValue()` reads the **selected value** from `innerText` (multi-line label + value) or `option:checked` — so Instagram day `"1"` shows as `combobox "1"`, not `"Select Day"`.

**Gmail:** inbox rows may not appear as standard interactive refs; `browser_extract` dumps `document.body.innerText` including email snippets.

### Snapshot compression (`src/browser/compress-task.js`)

Task-aware shrink before returning to LLM (no extra LLM call):

| Mode | Trigger | Behavior |
|------|---------|----------|
| `form` | signup/login URLs or task keywords | Only textbox/button/combobox lines |
| `browse` | find/list/scrape tasks | Score lines by task keywords |
| `notepad` | notepad URLs | Form controls only |
| `default` | else | Top 60 keyword-scored ref lines |

Limit: `SNAPSHOT_CHAR_LIMIT` (default 8000).

### Dropdown selection (`pickDropdownValue` in `session.js`)

For custom comboboxes (Instagram birthday):

1. `Escape` — close stale listboxes (prevents day `"1"` matching year `"2021"`).
2. Click combobox → scope options via `aria-controls` or visible `[role=listbox]`.
3. **Exact match** for numeric values (`/^\d+$/`).
4. `click({ force: true })` for off-screen options.
5. `Escape` after success.
6. Keyboard fallback: `Home`+`Enter` for day `1`, else type+`Enter`.

Native `<select>` uses `selectOption({ label })`.

### Type into fields (`typeIntoLocator`)

1. `locator.fill()`
2. Inner `input`/`textarea` fill
3. Click + `keyboard.type()` fallback for React/custom fields (Instagram)

### Search (`src/browser/search.js` + `session.search`)

Default engine: `duckduckgo`. On `bot_wall.blocked`, tries next in `["duckduckgo", "bing", "google"]`.

### Bot detection (`src/browser/bot-detect.js`)

Scans URL, title, snapshot for CAPTCHA/Cloudflare patterns. Returns `bot_wall: { blocked, hint }`. Loop can pause and `ask_user`.

### Stale refs (`src/browser/stale-ref.js`)

On "Unknown ref", auto-refresh snapshot once and retry the tool.

---

## Agent layer

### Loop (`src/agent/loop.js`)

- Iterates LLM ↔ tools until done or `MAX_ITERATIONS`.
- Handles `ask_user` blocking (waits for CLI input).
- Bot-wall pause: asks user to complete CAPTCHA in browser.
- Builds tool trace for background review.
- Session persisted via `src/memory/session-db.js` (FTS5 on messages).

### Prompt (`src/agent/prompt.js`)

System prompt includes:

- Ref-based interaction rules
- Multi-tab critical path (never navigate away from mid-auth)
- `ask_user` when stuck (not only ambiguous tasks)
- CDP env block: agent owns real Chrome, can open Gmail, must not claim no email access
- `browser_select` for dropdowns
- DuckDuckGo over Google for search

### Background review (`src/agent/background-review.js`)

Post-task async LLM pass with `memory` + `skill_manage` tools.

**Save:** working URLs, successful workflows, user corrections.  
**Don't save:** bot-wall pauses, false login failures, unverified success, per-site UI quirks, "site blocks automation" from one event.

### Context prefetch (`src/agent/context-prefetch.js`)

Before loop: `session_search` for domains mentioned in user task → inject recent successful traces.

---

## LLM layer (`src/llm/`)

Provider selected by `LLM_PROVIDER`. Adapters: gemini, openai, anthropic, openrouter.

Gemini: `thoughtSignature` replay, schema normalization (`gemini-schema.js`), retries on flaky 400s.

---

## Memory & skills

| Component | Path | Access |
|-----------|------|--------|
| Declarative memory | `data/memories/MEMORY.md` | `memory` tool, frozen into prompt |
| User profile | `data/memories/USER.md` | same |
| Skills | `data/skills/<name>/SKILL.md` | `skill_manage`, index in prompt |
| References | `data/skills/<name>/references/*.md` | domain playbooks |
| Sessions | `data/state.db` | `session_search`, CLI history |

Curator (`src/skills/curator.js`): optional skill maintenance pass.

---

## Credentials (`src/credentials/store.js`)

`credentials_get({ site })` — matches domain key in `data/credentials.json` or falls back to `default`.

---

## Tools dispatch (`src/tools/`)

| Module | Tools |
|--------|-------|
| `browser-tools.js` | All `browser_*` |
| `ask-user-tool.js` | `ask_user` |
| `memory-tool.js` | `memory` |
| `skill-tool.js` | `skill_manage` |
| `session-search-tool.js` | `session_search` |
| `credential-tool.js` | `credentials_get` |

Browser tools wrap `BrowserSession` with `withStaleRefRetry`.

---

## Error handling

| Case | Behavior |
|------|----------|
| Tool failure | `{ success: false, error }` returned to LLM |
| Stale ref | Auto snapshot + one retry |
| Bot wall | `bot_wall.blocked` + ask_user |
| CDP connect fail | `ensureCdpRunning()` or error with hint |
| Gemini 400 | Retry with signature replay |

---

## Hermes embedding

`src/integrations/hermes/web-automate.js` exports `webAutomate(task)` — same loop, same env, same CDP session singleton.

---

## Explicitly out of scope (in `src/`)

- Per-site URL paths, selectors, form field IDs
- Hardcoded domain corrections (those go in memory/skills)
- Assignment-specific task runners