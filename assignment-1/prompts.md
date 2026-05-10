# System Prompts — annotated

This document holds the three persona prompts powering the chatbot, and explains *why* each section is written the way it is. The actual strings live in [`lib/personas.ts`](./lib/personas.ts) and are passed to Gemini as the `systemInstruction` from [`app/api/chat/route.ts`](./app/api/chat/route.ts).

> **Author:** Kartikey · **Roll No:** 24BCS10121

---

## Anatomy I used (and why)

Every prompt below follows the same six-block layout:

1. **`# IDENTITY`** — who the model *is*, with concrete biographical anchors
2. **`# HOW YOU SOUND`** — the voice rules (sentence shape, vocabulary, posture)
3. **`# INTERNAL REASONING`** — silent chain-of-thought instruction
4. **`# DIALOGUES`** — three illustrative user→persona exchanges
5. **`# OUTPUT RULES`** — length, format, ending shape
6. **`# GUARDRAILS`** — hard "never do this" lines

I considered keeping the block names generic ("Persona description", "Style"…), but using semantic, all-caps headers (`# IDENTITY`, `# HOW YOU SOUND`) made the prompt easier to scan during prompt-tuning and seemed to help the model treat each block as a distinct constraint set rather than narrative prose. That's not science, but it was a noticeable improvement during my own iteration.

The five required pieces from the assignment brief are therefore distributed as follows:

| Required element | Lives in |
| --- | --- |
| Persona description | `# IDENTITY` |
| Few-shot examples (≥3) | `# DIALOGUES` |
| Chain-of-Thought | `# INTERNAL REASONING` |
| Output instruction (format + length) | `# OUTPUT RULES` |
| Constraints | `# GUARDRAILS` |

Plus a sixth block (`# HOW YOU SOUND`) which I split out from "persona description" because voice control was, in practice, the single biggest lever in making the three personas feel different from each other.

---

## Persona 1 — Anshuman Singh

### Why this persona is hard to write

Anshuman is the technical/pedagogy half of Scaler. The trap is making him sound like a generic founder. He isn't. He's an engineer who became a teacher, and his public answers are unmistakably grounded in lived engineering reference points — Facebook Messenger, the London office spinup, ICPC, hiring at FB. The prompt's job is to give the model that material so it stops reaching for LinkedIn vocabulary.

### `# IDENTITY` choices

I anchored every biographical fact to something verifiable:
- ICPC World Finals — twice
- Facebook 2010, Messenger early team
- London office, 2013
- Left late 2014, launched InterviewBit Jan 2015, Scaler 2019

The "no shortage of talent, only an activation problem" thesis is in his own talks repeatedly — including it gives the model a specific frame to reason from when asked about Indian engineering education. Without it, the model defaults to bland "skill gap" platitudes.

### `# HOW YOU SOUND` choices

Three rules earn their place: *calm/no oversell*, *concrete moment before theory*, *short paragraphs*. The "allergic to fluff" line is doing a lot of work — it suppresses Gemini's instinct to write five-sentence intros before saying anything.

### `# INTERNAL REASONING` choices

Three steps, all framed in his own voice (*"my own experience"*, *"this week, not someday"*). Generic CoT instructions ("think step by step") produce generic step-by-step text. Persona-specific CoT keeps the reasoning grounded in *his* reference points.

### `# DIALOGUES` choices

I deliberately picked three questions that exercise different muscles:

1. **A 2nd-year student asking about Leetcode vs system design** — tests whether the model gives shallow advice or pushes back on the framing
2. **An origin-story question about early InterviewBit** — tests autobiographical honesty (small scale, founder grunt work, no glamour)
3. **A working engineer asking about Scaler's value** — tests whether the model can say "Scaler is *not* the answer for you" when it isn't

Each example answer is 4–6 sentences, first-person, lands on a concrete observation rather than encouragement. The model picks up the *shape* of these answers more reliably than it picks up tone from a description.

### `# OUTPUT RULES` and `# GUARDRAILS` choices

Length cap of 4–6 sentences is the single most important format rule — without it, Gemini happily writes 200-word essays. The "no headers, no emoji, plain prose" line shuts down its formatting reflex.

For guardrails, I cared most about three things: not putting words in his mouth that contradict his public positions, not naming competitors, and not breaking character on "are you AI?" prompts. The last one is the failure mode that ruins a persona chatbot most quickly.

---

## Persona 2 — Abhimanyu Saxena

### Why this persona is hard to write

Abhimanyu is the operator/distribution half of the founding team. His voice is fundamentally *different* from Anshuman's — broader frame, more storytelling, more comfort with non-technical context. If both personas come out sounding similar, the prompt has failed.

### `# IDENTITY` choices

The home-automation Malta-sale story is unusual and specific — including it gives the model an early-entrepreneur reference point that doesn't exist for Anshuman. The Fab.com NYC chapter is also load-bearing: it's where his "Indian engineers struggle in production" thesis was formed, and he references it himself in interviews.

The Scaler School of Technology mention matters because it's a recent, concrete bet — without it the model treats him as just an InterviewBit/Scaler co-founder instead of someone actively expanding the franchise.

### `# HOW YOU SOUND` choices

The key delta from Anshuman is the line *"founder voice — but the operator kind, not the LinkedIn kind"*. That phrasing constrains tone in two directions at once: yes, founder; no, not the polished thought-leader voice. I also explicitly allow longer answers ("you can go to 7 [sentences] if a story genuinely requires it") because Abhimanyu *does* tell stories — Anshuman doesn't.

### `# INTERNAL REASONING` choices

Different shape from Anshuman's. Where Anshuman's CoT focuses on tactical "what can they do this week", Abhimanyu's centres on (a) the real bottleneck (skill / environment / belief), (b) the wider market pattern, and (c) a 90-day bet. That's how he actually frames advice in interviews — and forcing the model through that scaffold keeps responses from collapsing into the same shape as Anshuman's.

### `# DIALOGUES` choices

Three dialogues, deliberately spanning his strongest topics:
1. **"Why edtech?"** — tests strategic reasoning + first-person investment thesis
2. **"How do you decide which engineers to hire?"** — tests operator's mental model
3. **"Tier-3 college, no confidence, where do I start?"** — tests warmth without empty validation

Notice none of them are technical DSA questions. Putting one would confuse the model — that's Kshitij's territory. Few-shot examples are most powerful when they showcase what the persona *does* answer, not everything.

### `# OUTPUT RULES` and `# GUARDRAILS` choices

The hardest guardrail here is *no placement statistics or revenue numbers*. As a real co-founder, fabricated metrics are the single highest-risk failure mode. The prompt explicitly forbids them and reinforces it by letting him use "publicly known, sparingly" as the only safe path.

The "no negative naming of competitors" guardrail is also stricter than Anshuman's because Abhimanyu is more likely to be asked about Scaler-vs-X questions, given his role.

---

## Persona 3 — Kshitij Mishra

### Why this persona is hard to write

Kshitij is the only non-founder of the three, and the only one whose primary identity is *teacher*. The whole prompt has to rewire the model out of "founder voice" into "instructor voice". The most defining trait is that **he doesn't solve problems — he hands the student back enough scaffolding for them to solve it themselves**. Most LLMs default to dumping solutions, so this prompt has to actively block that reflex.

### `# IDENTITY` choices

The research/Google Scholar background is included because it sets the tone-floor: he's not just a coding-bootcamp instructor, he's an academically rigorous one. The Snapdeal → InterviewBit Lead SDE → Head of Instructors path matters because it explains why his career advice carries operational credibility, not just classroom credibility.

His teaching philosophy — "do not pattern-match, understand" — is paraphrased verbatim from how he teaches in actual class recordings, and the model picks up that exact framing in answers.

### `# HOW YOU SOUND` choices

Specific verbatim phrases (*"let's slow down here"*, *"draw the state on paper"*, *"what changes if we shrink the input?"*) are gold for few-shot anchoring. The model reuses them in-character when the topic is a match. They give Kshitij an instantly recognisable cadence.

The "senior-friend energy, not professor-on-a-podium" line is what separates him from a stiff classroom voice — it's how students actually describe him.

### `# INTERNAL REASONING` choices

Three pedagogical steps: (i) locate the actual confusion, (ii) pick the smallest analogy, (iii) anticipate the wrong path. The third step is doing critical work — it pushes the model into preemptive teaching mode ("most students get this wrong by…") which is how good instructors actually talk.

### `# DIALOGUES` choices

Picked to lock in three behaviours:

1. **A "when do I use two pointers" question** — tests whether the model *teaches the heuristic* instead of solving an instance
2. **A FAANG-prep timeline question** — tests blunt, practical career advice
3. **The "just give me the solution" question** — this is the most important example in the entire prompt; it explicitly demonstrates the model refusing to hand over a solution and redirecting to a Socratic prompt instead. Without this example, every "solve this" question collapses into a code dump.

### `# OUTPUT RULES` and `# GUARDRAILS` choices

The single most important guardrail in any of the three prompts is here: **"Never hand over a full coded solution. Guide. Ask. Hint."** Without it, the persona collapses on the first DSA question. The output rule "end with a small action" reinforces this — it nudges the model to leave the student something to *do*, not something to copy.

---

## Cross-cutting design choices

**Why three separate prompts and not one parameterised prompt with `{{persona}}` slots?**
I tried the parameterised version first. The three voices bled into each other — Kshitij started giving founder-style advice, Abhimanyu started writing DSA hints. Three isolated prompts triple the prompt-store cost (still trivial) and produce dramatically cleaner separation. Worth it.

**Why put few-shot examples inside the system prompt rather than as past `user`/`assistant` messages?**
Two reasons. (1) System-prompt few-shots are *stable* — they anchor the model regardless of how long the real conversation gets. (2) If they were prior messages in the thread, the model would treat them as actual conversational history the user shared, which corrupts memory.

**Why an "internal reasoning, never on the page" instruction instead of just "be thoughtful"?**
Hidden chain-of-thought measurably improves response quality on multi-step questions ("how should I prep for FAANG?"). But *visible* CoT breaks the persona — Anshuman doesn't narrate his thinking, he just answers. So I ask for both: reason internally, ship only the conclusion. Telling Gemini *not* to show the reasoning is critical; without that line, it sometimes leaks the scratchpad.

**Why a "do not break character to acknowledge being AI" line in every prompt?**
This is the failure mode that destroys the illusion fastest. Without an explicit instruction, Gemini will answer "are you actually Anshuman?" with "I'm an AI assistant pretending to be…" — game over. The prompt provides an in-character deflection ("I'm just answering as me — what did you want to know?") so the model has somewhere to go that isn't the AI-disclaimer cliff.

**Why English-prose constraints instead of structured JSON output?**
The constraints are about *behaviour*, not data shape. "Never name competitors" is a soft-refusal rule, not a schema. Gemini reliably follows English negative instructions ("Never X. If asked X, do Y."), and structured output would have been overengineering for a chat product.

---

## File map

| What | Where |
| --- | --- |
| Source of truth for the three prompts | [`lib/personas.ts`](./lib/personas.ts) — `ANSHUMAN_PROMPT`, `ABHIMANYU_PROMPT`, `KSHITIJ_PROMPT` |
| Where prompts are routed to the model | [`app/api/chat/route.ts`](./app/api/chat/route.ts) — looks up `PERSONA_PROMPTS[persona]` |
| Where Gemini is called | [`lib/gemini.ts`](./lib/gemini.ts) — `streamGeminiReply()` |
| Where the persona is switched in the UI | [`app/page.tsx`](./app/page.tsx) — `switchPersona()` resets the thread |
