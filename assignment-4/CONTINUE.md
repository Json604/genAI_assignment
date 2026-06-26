# Continue From Here — Active Session Checkpoint

> **For agents:** Read `README.md` first, then this file. User may say *"continue from here"* — pick up this exact task state. Full transcripts in `data/state.db` (`session_search`).

**Last updated:** Jun 2026  
**Status:** Paused mid-task — YouTube GTM transcript collection

---

## Active task (incomplete)

Collect Harvard GTM Masterclass YouTube transcripts (>60 min) into notepad.js.org.

**User rules for this task:**
- Do NOT ask user questions (user said so explicitly)
- Wait 10s for transcripts to load; retry twice before giving up
- Do not stop after one video — need 2 videos + notepad paste
- Complete ALL steps before saying done

---

## Progress checklist

| Step | Status | Notes |
|------|--------|-------|
| Search YouTube | ✅ | `GTM strategy Harvard Masterclass` |
| Filters → Duration Long | ✅ | URL has `sp=EgIYAg%253D%253D` |
| Open notepad.js.org | ✅ | Separate tab |
| Pick 2 Harvard videos (>60 min) in new tabs | ⚠️ Partial | Only **1** video opened so far |
| Show transcript + extract | ❌ Stuck | Video 1: panel opened but extract never ran; agent clicked **Close** by mistake (iter 12), then looped Show transcript / Transcript tab |
| Paste to notepad | ❌ | Notepad still empty |

---

## Browser state (expected)

| Tab | URL | Purpose |
|-----|-----|---------|
| tab1 | `https://notepad.js.org/` | Destination for transcripts (likely empty) |
| tab2 | `https://www.youtube.com/watch?v=rqi-n0hA4uo` | Video 1 in progress — Harvard i-lab **Go to Market Strategies** |

**Note:** Tab IDs are `tab1`, `tab2` — never `tab0` (that failed once).

Other Harvard videos seen in filtered search (candidates for video 2):
- `https://www.youtube.com/watch?v=AaoIuwepucM` — Go to Market Part I (1h 35m)
- `https://www.youtube.com/watch?v=4wyisJvAKBc` — Startup Secrets Part 4: Going To Market

---

## Video 1 — where it failed

**Title:** Harvard i-lab | Startup Secrets: Go to Market Strategies  
**URL:** `https://www.youtube.com/watch?v=rqi-n0hA4uo`

**What worked:**
- Scroll → expand `...more` → `Show transcript` → `Transcript` tab appeared (`ref=e206`)

**What went wrong:**
- Iteration 12: clicked **Close** (`e204`) — closed transcript panel
- Re-opened transcript but never called `browser_wait` or `browser_extract`
- Iteration 15: called `ask_user` despite user saying not to ask
- Transcript text may not appear in a11y snapshot — need `browser_extract` after 10s wait

**Resume steps for video 1:**
1. `browser_switch_tab({ tab_id: "tab2" })`
2. Click `Show transcript` if panel closed
3. `browser_wait` or explicit 10s pause
4. `browser_extract` — copy all visible transcript text
5. `browser_switch_tab({ tab_id: "tab1" })` → `browser_type` append with title + transcript

---

## Video 2 — not started

1. `browser_switch_tab({ tab_id: "tab2" })` or new tab from search results
2. `browser_navigate({ url: "...", new_tab: true })` for second Harvard video
3. Repeat transcript flow
4. Append to notepad

---

## Continue prompt (paste for user or agent)

```
Continue from CONTINUE.md checkpoint. Notepad tab1, YouTube tab2 on rqi-n0hA4uo. Do NOT ask_user. Finish video 1 transcript (Show transcript → wait 10s → browser_extract → paste to notepad with title), then open one more Harvard GTM video over 60min in a new tab and do the same. Say done only when notepad has both transcripts.
```

---

## Known issues hitting this task

1. **No task recollection** — agent has no persistent "where I am in the plan" object; loses checklist after a few iterations
2. **Impatience** — gives up on transcripts / asks user instead of wait + retry
3. **Slow browser ops** — 25–60s per click/navigate (YouTube snapshot still heavy; lazy-wait improved but not enough)
4. **Wrong ref clicks** — clicked Close instead of staying in transcript panel
5. **ask_user ignores user instruction** — called anyway at iter 15
6. **CLI logging** — fixed: ask_user no longer spams "still running" heartbeat (was confusing)

See `ROADMAP.md` priorities #1–#4 for planned fixes.

---

## Other verified context (same project)

| Area | Status |
|------|--------|
| Instagram signup | ✅ |
| LinkedIn biotech search + notepad (phase 1) | ✅ partial |
| LinkedIn login | ❌ |
| X login | ❌ |
| CDP Chrome + multi-tab | ✅ |
| Model | `gemini-3.1-flash-lite` in `.env` |