# Roadmap — General Agent Improvements

> Read **`README.md`** for current status. Ideas here must apply to **any site** — not one domain. Site playbooks → `data/skills/references/`, learned at runtime.

---

## Done (implemented)

### Core agent
- [x] Playwright + a11y snapshots + ref registry
- [x] Provider-agnostic LLM loop (Gemini, OpenAI, Anthropic, OpenRouter)
- [x] `ask_user` — ambiguous tasks **and** stuck/error recovery
- [x] Declarative memory (`MEMORY.md`) + episodic sessions (`state.db` FTS5)
- [x] Skills store + background review + curator
- [x] Vision escalation (`browser_vision`)
- [x] Bot-wall detection + search engine fallback
- [x] Stale-ref auto-retry
- [x] Session conversation context across CLI turns
- [x] Context prefetch from prior sessions (`session_search`)

### Browser / CDP
- [x] **CDP mode** — real Chrome via `BROWSER_CDP_URL`, isolated `data/chrome-cdp-profile/`
- [x] Auto-start Chrome if CDP port down (`ensureCdpRunning`)
- [x] `connectOverCDP({ noDefaults: true })` — Chrome 136+ fix
- [x] Agent Google account profile (`usehermes2.0@gmail.com`)
- [x] `credentials_get` + `data/credentials.json`
- [x] Tab visibility — `bringToFront` on navigate/click/type/switch

### Multi-tab
- [x] `browser_new_tab`, `browser_switch_tab`, `browser_list_tabs`
- [x] `browser_navigate({ new_tab: true })`
- [x] CDP syncs user-opened tabs

### Interaction reliability
- [x] Click: scroll-into-view, force fallback, post-click navigation wait
- [x] `browser_type` append mode (multi-item editors)
- [x] Keyboard fallback for React/custom inputs (`typeIntoLocator`)
- [x] **`browser_select`** — combobox/dropdown with exact numeric match, `aria-controls` scoping, Escape cleanup
- [x] Combobox snapshots show **selected value** (not placeholder label)
- [x] Gmail `aria-labelledby` IDs with colons — `getElementById` fix in snapshot

### Snapshots & search
- [x] Task-aware compression (form / browse / notepad modes)
- [x] Form mode for signup URLs (`/emailsignup`, `/accounts/`)
- [x] DuckDuckGo default search + Bing/Google fallback chain
- [x] Higher iteration budget (60) + CLI limit warning

### Observability (Jun 2026)
- [x] CLI progress: model timing, tool timing, tab/URL before each browser action
- [x] Heartbeat during long `browser_*` ops ("still running Ns")
- [x] Click shows `target_label` in tool result
- [x] `💭` log line when model returns text before tool calls
- [x] `ask_user` shows "waiting for your input" — no false heartbeat spam
- [x] Faster lazy-wait (lightweight element count, not full snapshot per scroll round)
- [x] **`CONTINUE.md`** — checkpoint file for "continue from here" tasks

---

## Verified workflows (manual testing, Jun 2026)

| Task | Result |
|------|--------|
| Instagram email signup (birthday + OTP) | ✅ Account created |
| Gmail OTP read (inbox snippet) | ✅ Code copied without opening email |
| ChatGPT login via CDP + Gmail tab | ✅ Works (OAuth sometimes needs user help) |
| X / Twitter login | ❌ Fails — phone/Apple preferred |
| LinkedIn login (Google OAuth) | ❌ Fails — skill documents flow but not reliable yet |
| General browse / forms (shadcn, NCYC, etc.) | ✅ Works |
| LinkedIn biotech search → notepad (phase 1) | ✅ Partial — 3 profile URLs saved |
| YouTube GTM transcript → notepad | ⚠️ In progress — see **`CONTINUE.md`** |

---

## Known gaps (not yet solved)

| Gap | Impact | Approach (general, not site-hardcoded) |
|-----|--------|----------------------------------------|
| **X / Twitter login** | Can't complete web login/signup | Investigate OAuth tabs, `ask_user` for phone path; don't hardcode |
| **LinkedIn login** | Google OAuth flow fails mid-way | Debug with `browser_debug`; multi-tab timing; memory has draft workflow |
| **Gmail row refs** | Inbox emails may not appear as clickable refs | `browser_extract` works; could improve snapshot for `[role=row]` |
| **Heavy OAuth redirects** | Agent loses track across redirects | Better tab/list_tabs discipline; state checkpoint (ROADMAP #1) |
| **Context window cost** | Slow + expensive on 20+ iteration tasks | Priority #1 below |
| **No task recollection** | Agent forgets multi-step plan mid-run; stops early or asks_user | Priority #2 below |
| **Can't wait / retry** | Gives up on lazy-loaded UI (YouTube transcripts) | Priority #3 below |
| **Slow YouTube snapshots** | 25–60s per click/navigate still | Priority #4 below |
| **Ignores "don't ask me"** | ask_user called despite user instruction | Honor task-level constraints in prompt + state |
| **Cookie/consent overlays** | Block clicks on some sites | Generic overlay dismiss via snapshot refs |
| **False memory from failures** | Background review sometimes saves bad facts | Rules in `background-review.js` — keep tightening |

---

## 🔴 Priority #1 — Context window management (API cost + speed)

**Most important planned improvement.** Every iteration resends the **entire** `messages[]` array including full tool JSON (snapshots, extracts). By iteration 25, cost grows ~O(n²).

### Problem

```
iteration 1:  LLM call → [system, user, assistant, tool]
iteration 2:  LLM call → [system, user, assistant, tool, assistant, tool]  ← resends all of iter 1
iteration N:  LLM call → entire history again
```

CLI output is truncated for display; the model still receives full tool payloads.

### Planned solutions (all general)

| Idea | What it does | Saves |
|------|----------------|-------|
| **Rolling tool-result window** | Keep last 2–3 tool results at full fidelity; older → one-line summaries | Tokens |
| **Snapshot slimming in history** | Archive tool messages with url/title/key refs only | Tokens |
| **Iteration summarization checkpoint** | Every K iterations, compress middle into "state so far" | Tokens + headroom |
| **Task state object** | JSON state (`tabs`, `items_done`, `last_url`) instead of replaying logs | Tokens + clarity |
| **Continue without replay** | On resume, load checkpoint — don't rebuild 30-iter history from DB | Tokens |
| **Adaptive context budget** | Env `CONTEXT_CHAR_BUDGET` — auto-summarize when over threshold | Cost guardrail |

### Success criteria

- 30-iteration task uses **sub-linear** input token growth
- Agent still knows: current URL, open tabs, what's done, what's left
- No site-specific compression logic

### Implementation hook

`compressMessages(messages, { keepRecent: 3 })` in `loop.js` before each `llm.chat()`. Log `📉 Context compressed: 42k → 8k chars` in CLI.

---

## 🔴 Priority #2 — Task state & recollection ("who am I / where am I")

**Core product gap.** The agent has no persistent **task identity** during a run:
- No checklist of steps done / remaining
- No memory of user constraints ("don't ask me", "don't stop after one video")
- Declares `✓ done` early when one sub-goal succeeds
- Cannot resume mid-task except via user paste or `CONTINUE.md`

### Planned

| Idea | What it does |
|------|----------------|
| **TaskState object** | Injected each iteration: `{ steps[], done[], remaining[], constraints[], tabs{} }` |
| **Step detector** | Parse user task into numbered steps on turn 1; tick off on evidence |
| **CONTINUE.md auto-write** | On pause / max iterations / user interrupt → update checkpoint file |
| **"continue from here"** | CLI loads `CONTINUE.md` + last session from `state.db` into prompt |
| **Done gate** | Model cannot finish until `remaining` is empty or user overrides |

### Success criteria

- YouTube 5-step task runs past step 3 without early exit
- User says "continue from here" → agent reads checkpoint, no re-explanation needed

---

## 🔴 Priority #3 — Patience (wait + retry before give-up)

Agents click once, snapshot, conclude "unavailable". YouTube transcripts need **wait 10s → extract → retry**.

### Planned

| Idea | What it does |
|------|----------------|
| **`browser_wait` with seconds** | `browser_wait({ seconds: 10 })` for explicit delays |
| **Retry policy in prompt** | "N attempts before ask_user" enforced via TaskState |
| **Transcript / panel detection** | After click, if panel ref appears, wait then extract — don't click Close |
| **Honor user constraints** | If task says "don't ask me", disable ask_user for that run |

---

## 🔴 Priority #4 — Browser action speed

Navigate/click on YouTube still **25–60s** each. Lazy-wait improved (116s→42s navigate) but `buildPageResponse` full snapshot on every action is the bottleneck.

### Planned

| Idea | What it does |
|------|----------------|
| **Snapshot on demand** | `browser_click` returns metadata only; snapshot via `browser_snapshot` when needed |
| **Cached refs TTL** | Short-lived ref validity to skip re-snapshot after minor clicks |
| **Site-agnostic slim mode** | When element_count > 150, return top 40 refs + "call snapshot for more" |

---

## Planned — build when useful generally

### Batch & long-running tasks

| Idea | Why general |
|------|-------------|
| **Progress logging** | `Collecting item 3/24…` — any loop-over-N task |
| **Resume on limit** | Max iterations hit mid-batch → save state, offer `continue` |

### Navigation & discovery

| Idea | Why general |
|------|-------------|
| **Pagination helper** | Detect next-page refs in snapshot, loop until done |
| **Domain guard** | On DNS failure, stop TLD guessing; use memory or search |
| **Parked-domain detection** | Flag for-sale pages |
| **Overlay dismiss** | Generic cookie-banner close via snapshot refs |

### Cross-tab & data transfer

| Idea | Why general |
|------|-------------|
| **Cross-tab append** | Extract tab A → append tab B in one tool call |
| **Structured extract** | Key-value fields from labelled data on detail pages |

### Memory & context

| Idea | Why general |
|------|-------------|
| **Workflow replay hint** | Prefetch successful tool traces per domain |
| **Failed URL blacklist** | Remember DNS/404 failures |
| **Batch task detector** | Nudge when user says "all/each/every" |

### UX

| Idea | Why general |
|------|-------------|
| **Keep browser open after done** | User reviews result in visible Chrome |

---

## Explicitly out of scope

- Per-site scripts, selectors, or URL paths in `src/`
- Assignment-specific runners
- Hardcoded strain names, form ids, or domain corrections in code