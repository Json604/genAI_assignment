# Web Automation Agent

**Student:** Kartikey · **Roll No.** 24BCS10121 · **Course:** GenAI / Prompt Engineering, Scaler Academy

A **general-purpose** web automation agent. You give it a URL and a task — it figures out what to do from accessibility snapshots, acts via refs (`@e5`), and calls `ask_user` when stuck. **No site-specific hardcoding in `src/`.** Site knowledge is learned at runtime into `data/memories/` and `data/skills/`.

> **For agents / future sessions:** Read this file first. If user says **"continue from here"**, read **`CONTINUE.md`** next. Then `ARCHITECTURE.md` + `ROADMAP.md`. Full run transcripts in `data/state.db`.

---

## Design principles

1. **General agent** — no per-site runners, selectors, or URL paths in source code.
2. **Refs only** — interact via `[ref=eN]` from snapshots, not CSS/XPath (unless user asks).
3. **CDP Chrome** — real logged-in browser for auth flows (Gmail, OAuth, signup).
4. **Multi-tab** — never `browser_navigate` away from a mid-login tab; use `new_tab` + `switch_tab`.
5. **Ask when stuck** — `ask_user` for CAPTCHA, ambiguous UI, or repeated failures.
6. **Incremental improvement** — fix general capabilities; site playbooks go in skills, not code.

---

## Current status (Jun 2026)

| Area | Status | Notes |
|------|--------|-------|
| Ref-based browse/click/type | ✅ Works | Scroll-into-view, stale-ref retry, keyboard fallback for React fields |
| `browser_select` (comboboxes) | ✅ Works | Exact match for numeric days; scoped to `aria-controls` listbox |
| Multi-tab (CDP) | ✅ Works | List/switch/new tab; `bringToFront` on actions |
| Web search | ✅ Works | DuckDuckGo → Bing → Google fallback on `bot_wall` |
| CDP + agent Google account | ✅ Works | `usehermes2.0@gmail.com` profile; auto-starts Chrome if CDP down |
| Gmail OTP read | ✅ Works | Code often visible in **inbox snippet** — no need to open email |
| Instagram email signup | ✅ Works | Birthday dropdowns, email verification code, account created |
| ChatGPT login (CDP) | ✅ Works | Multi-tab Gmail for OTP; manual OAuth steps sometimes needed |
| X / Twitter login | ❌ Not working | Signup favors phone/Apple; web email path hard to find |
| LinkedIn login | ❌ Not working | Google OAuth flow documented in skill but still fails in practice |
| YouTube transcript harvest | ⚠️ In progress | Paused — see **`CONTINUE.md`** |
| Task recollection / patience | ❌ Core gap | No step checklist; gives up early — `ROADMAP.md` #2–#3 |
| Context / token cost | ⚠️ Needs work | Full history resent every iteration — `ROADMAP.md` #1 |

---

## Quick start

```bash
cd assignment-4
cp .env.example .env          # API key + BROWSER_CDP_URL
cp data/credentials.json.example data/credentials.json   # agent login creds
npm install
npx playwright install chromium

# Terminal 1 — agent Chrome (logged-in Google profile)
npm run chrome:cdp

# Terminal 2 — agent CLI
npm start
```

Example tasks:

```
you ▸ Go to https://example.com and tell me the page title
you ▸ Create account on instagram.com — email signup, use credentials_get
you ▸ exit
```

When stuck, the agent asks:

```
agent asks ▸ I see a CAPTCHA. Please complete it in the browser, then reply done.
you ▸ done
```

**After code changes:** restart `npm start` (Chrome/CDP can stay running).  
**Check CDP:** `npm run chrome:cdp:status`

---

## Browser: CDP vs Playwright

| Mode | When | How |
|------|------|-----|
| **CDP** (default in `.env`) | Auth, Gmail, OAuth, signup | Real Chrome at `BROWSER_CDP_URL` |
| **Playwright** | No `BROWSER_CDP_URL` set | Isolated Chromium, fresh profile |

### CDP setup

Chrome 136+ **blocks** `--remote-debugging-port` on the default profile. The agent uses an isolated dir:

- **Profile:** `data/chrome-cdp-profile/` (seeded from Chrome Profile 19 on first run)
- **Account:** `usehermes2.0@gmail.com` (Hermes agent Google account)
- **Script:** `scripts/chrome-agent-cdp.sh` via `npm run chrome:cdp`
- **Connect:** Playwright `connectOverCDP` with `{ noDefaults: true }` (Chrome 136+ fix)
- **Auto-start:** `ensureCdpRunning()` launches Chrome if port 9222 is down

CDP Chrome runs **alongside** personal Chrome — separate user-data-dir.

---

## Agent account & credentials

`credentials_get` reads `data/credentials.json`:

```json
{
  "default": {
    "email": "usehermes2.0@gmail.com",
    "username": "usehermes2.0@gmail.com",
    "password": "…",
    "notes": "Shared agent account for login/signup on any site"
  }
}
```

Copy from `data/credentials.json.example`. Matched by domain key or `default`. **Gitignored** — never commit real passwords.

---

## How the agent works

### Snapshots & refs

1. Every browser action returns an accessibility snapshot: role, name, `[ref=eN]`.
2. Agent acts: `browser_click({ ref: "@e3" })`, `browser_type({ ref: "@e2", text: "…" })`.
3. **Form mode** compression on signup URLs — shows only inputs/buttons/comboboxes.
4. **Comboboxes** show the **selected value** in the snapshot (e.g. `"1"`, `"January"`), not placeholder `"Select Day"`.
5. Open dropdowns expose `[role=option]` refs; or use `browser_select`.

### Multi-tab (critical)

```
browser_navigate        → REPLACES active tab
browser_navigate(new_tab=true) / browser_new_tab  → keep both pages
browser_list_tabs       → sync all CDP tabs (including user-opened)
browser_switch_tab      → switch + bring to front
```

**Pattern:** signup on tab A → `browser_new_tab({ url: "mail.google.com" })` → read OTP → `browser_switch_tab` back.

### Gmail / verification codes

OTP emails (Instagram, etc.) usually put the code in the **subject or inbox snippet**. The agent can read it from the inbox page via snapshot or `browser_extract` **without opening the message**. Open the email only if the code isn't in the snippet.

### Search

`browser_search` defaults to **DuckDuckGo** (Google shows CAPTCHA to automated browsers). Auto-fallback chain: DuckDuckGo → Bing → Google. Override: `browser_search({ query: "…", engine: "google" })`.

### When stuck

- `ask_user` — describe snapshot, what was tried, offer options.
- `browser_debug` — console/network errors after failed login loops.
- `browser_vision` — escalation when a11y tree isn't enough.
- Bot wall: user completes CAPTCHA in Chrome, replies `done`.

---

## Tools

| Tool | Purpose |
|------|---------|
| `ask_user` | Clarify ambiguous tasks **or** ask for help when stuck |
| `browser_search` | Web search (DuckDuckGo default, auto-fallback) |
| `browser_navigate` | Open URL (+ snapshot). `new_tab: true` to keep current tab |
| `browser_new_tab` | New tab, optional URL + label |
| `browser_switch_tab` | Switch active tab (refs only work on active tab) |
| `browser_list_tabs` | All open tabs in CDP Chrome |
| `browser_snapshot` | Refresh snapshot (`full=true` for headings) |
| `browser_click` / `browser_type` / `browser_scroll` | Ref-based interaction |
| `browser_select` | Combobox/dropdown by visible label (`"January"`, `"1"`, `"2000"`) |
| `browser_wait` | lazy_content / network / navigation |
| `browser_press` | Keyboard (Enter, Escape, Tab) |
| `browser_extract` | Visible page text when snapshot isn't enough |
| `browser_vision` | Screenshot + vision (escalation) |
| `browser_debug` | Console + network errors |
| `credentials_get` | Agent login credentials |
| `memory` | Save facts to `MEMORY.md` |
| `skill_manage` | Create/update skills + `references/<domain>.md` |
| `session_search` | FTS search over past sessions in `state.db` |

---

## Data & logging (where everything lives)

| What | Path | Notes |
|------|------|-------|
| **Full session transcripts** | `data/state.db` | Every tool call + snapshot; searchable via `session_search` |
| **Durable facts** | `data/memories/MEMORY.md` | Domains, URLs, short lessons (background review) |
| **User profile** | `data/memories/USER.md` | User-specific notes |
| **Site playbooks** | `data/skills/<name>/` | `SKILL.md` + `references/<domain>.md` |
| **Agent credentials** | `data/credentials.json` | Gitignored |
| **CDP Chrome profile** | `data/chrome-cdp-profile/` | Logged-in Google session |
| **Screenshots** | `data/screenshots/` | Vision / debug captures |

**Background review** (`BACKGROUND_REVIEW=true`): after each task, LLM reviews transcript and updates memory/skills. Instructed **not** to save false login failures, bot-wall pauses, or stale UI quirks. See `src/agent/background-review.js`.

### Learned site knowledge (runtime)

| Site | Location | Content |
|------|----------|---------|
| General browsing | `data/skills/web-automation/` | Search, bot walls, ask_user |
| LinkedIn | `data/skills/linkedin/references/linkedin.md` | Google OAuth steps (login still failing) |
| NCYC, shadcn, ChatGPT, Instagram URL | `data/memories/MEMORY.md` | Short facts |
| X signup | `data/memories/MEMORY.md` | Phone/social preferred over email |

---

## Environment variables

```env
LLM_PROVIDER=gemini          # gemini | openai | anthropic | openrouter
LLM_MODEL=gemini-3.1-flash-lite   # fast default; gemini-3.5-flash for smarter/slower

GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=

# Browser — CDP is recommended for auth flows
BROWSER_CDP_URL=http://127.0.0.1:9222
BROWSER_HEADLESS=false       # Playwright-only mode
BROWSER_SLOW_MO=0

MAX_ITERATIONS=60
SNAPSHOT_CHAR_LIMIT=8000
BACKGROUND_REVIEW=true
MEMORY_NUDGE_INTERVAL=3
```

Only the active provider's API key is required.

---

## Project structure

```txt
assignment-4/
├── README.md              ← start here (this file)
├── CONTINUE.md            ← active task checkpoint ("continue from here")
├── ARCHITECTURE.md        ← code-level design
├── ROADMAP.md             ← done + planned improvements
├── src/
│   ├── cli.js             ← entry: npm start
│   ├── agent/             ← loop, prompt, background-review, context-prefetch
│   ├── browser/           ← session, snapshot, cdp, search, tabs, compress-task
│   ├── llm/               ← provider adapters
│   ├── memory/            ← MEMORY.md + SQLite sessions
│   ├── skills/            ← skill store + curator
│   ├── tools/             ← browser, ask_user, memory, credentials, …
│   └── integrations/hermes/
├── scripts/
│   ├── chrome-agent-cdp.sh
│   └── */                 ← optional manual collectors (not used by agent loop)
└── data/                  ← runtime state (gitignored)
```

### Key source files

| File | Role |
|------|------|
| `src/agent/loop.js` | LLM ↔ tool loop, bot-wall pause |
| `src/agent/prompt.js` | System prompt, CDP env block, multi-tab rules |
| `src/browser/session.js` | All browser actions, `pickDropdownValue`, search fallbacks |
| `src/browser/snapshot.js` | A11y capture, combobox selected-value labels |
| `src/browser/cdp.js` | CDP connect + auto-start Chrome |
| `src/browser/compress-task.js` | Form/browse/notepad snapshot modes |
| `src/browser/tabs.js` | Multi-tab registry |

---

## Architecture (summary)

```txt
User task (CLI)
  → Frozen memory + skill index + CDP env in system prompt
  → LLM ↔ tool loop (max 60 iterations)
      browser_* / ask_user / memory / skill_manage / credentials_get
  → Playwright (CDP or Chromium) + a11y snapshots + ref registry
  → Session → data/state.db (FTS5)
  → Background review → memory + skills
```

Phases: Hands → Brain → Memory → Skills → Episodic → Learning → Polish (vision, compression, bot-wall, CDP, multi-tab, browser_select).

Details: **`ARCHITECTURE.md`**

### CLI observability

Each iteration logs:
- `💭` — model text before tool calls (when provider returns it)
- `⚙ tool` + tab/URL before browser actions
- `… still running (Ns)` — heartbeat during `browser_*` only (not during `ask_user`)
- `✓ tool done (Xs)` — timing + clicked label

Restart `npm start` after code changes.

---

## Hermes integration

```bash
npm run hermes -- "Go to example.com and get the page title"
```

Embed: `src/integrations/hermes/web-automate.js` → `webAutomate(task)`.  
Uses same `.env` and CDP setup as `npm start`. See `src/integrations/hermes/README.md`.

---

## Manual collectors

`scripts/` contains optional browser-console scrapers for platforms that block automation. **Not wired into the agent loop** — the agent handles public sites on its own.

---

## What's next

See **`ROADMAP.md`** — priority #1 is context-window / token-cost management. Known gaps: X login, LinkedIn login, overlay dismiss, pagination helper, cross-tab extract.