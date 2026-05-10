# Reflection

> **Author:** Kartikey · **Roll No:** 24BCS10121

## What actually worked

The biggest realisation came surprisingly early: a persona system prompt is not a *description* of a person, it's a *control surface*. My first attempt was a paragraph that read like a Wikipedia stub — "Anshuman Singh is the co-founder of Scaler, an engineer who values rigour and pedagogy." Gemini, when handed that, responded politely, generically, and identically across all three personas. It was bland in exactly the way the brief warned about.

What unlocked everything was treating the prompt as a *layered specification*: identity (with concrete anchors), voice rules (with explicit do/don't lines), an internal-only chain-of-thought scaffold, three dialogue exemplars, output formatting, and hard guardrails. The moment all six layers were in place, the three personas stopped sounding like the same model wearing different name tags. Anshuman became economical and engineer-grounded. Abhimanyu started telling small stories from Fab.com before giving advice. Kshitij stopped solving problems and started asking guiding questions.

Of those six layers, the **dialogues** turned out to be by far the highest-leverage. Three short examples did more to fix tone, length, and ending-shape than any amount of descriptive prose. Especially for Kshitij — including a dialogue where he refuses to hand over a DP solution and redirects with "what is your state?" was *the* fix that made him feel like a real teacher and not a code-dumping LLM in a costume.

A close second was the **chain-of-thought instruction**, but only after I rewrote it persona-specifically. Generic "reason step by step" did almost nothing. Phrasing it as *"my own experience"* for Anshuman, *"the broader market pattern"* for Abhimanyu, *"the wrong path the student is about to take"* for Kshitij — that anchored the reasoning to the persona's actual mental model and the answers shifted noticeably.

## What GIGO actually meant in practice

GIGO showed up twice for me, in ways I hadn't predicted.

First, **vague descriptions hallucinate.** When my Anshuman prompt said only "ex-Facebook engineer who cares about education", Gemini happily invented stories — claimed teams he wasn't on, fabricated specific Messenger features. The fix wasn't more guardrails, it was *more specific facts*. Once the prompt said "founding team for Messenger, helped spin up Facebook's London office in 2013, left late 2014," the hallucinations dried up because the model now had real material to draw on instead of empty space to fill.

Second, **soft constraints get ignored.** "Try not to name competitors" was treated as a suggestion. "Never name another company or bootcamp negatively" was followed. The grammar of the constraint matters as much as its content. Gemini follows imperative negatives ("Never X. If pushed, do Y.") far more reliably than polite phrasings.

The deeper takeaway: prompt engineering is **information density work**. Every sentence either gives the model something to reason from or removes a known failure path. Sentences that do neither are paying rent in tokens for nothing — and they actively dilute the lines that *do* matter.

## What I'd do next if I had another week

Three things, ranked by how much I'd want them:

1. **Per-persona evals.** A small fixed set of test questions per persona, each with a hand-written ideal answer, scored on tone match, length, and constraint compliance. Right now I'm prompt-tuning by vibes.
2. **Light retrieval.** Each persona has a corpus — talks, podcasts, LinkedIn posts — that I'm currently summarising into the prompt by hand. A small RAG layer would let direct quotes come from real source material instead of paraphrase, and would scale better than stuffing more facts into the system prompt.
3. **Memory windowing.** Long conversations replay the entire history every turn, which gets expensive and slowly drifts the persona off-character. A summary-of-older-turns plus last-N-messages window would fix both, but it wasn't worth the complexity for the assignment scope.
