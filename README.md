# prommer.net — press-feed agent pipeline

A multi-step agentic workflow that turns a press-article URL into a validated
card for prommer.net's press feed. Four distinct steps with real handoffs — not
a single prompt.

```
fetch ──▶ extract ──▶ validate (grounding gate) ──▶ publish
 (I/O)    (LLM)        (guardrail)                   (render + upsert)
                           │
                           └── fails ──▶ needs-review.json  (human owns the call)
```

Built to the site's own doctrine: **production-first, human-in-the-loop,
measurable**. The gate is the human-in-the-loop seam — a card only goes live if
its pull-quote is verifiably real.

## The steps

| # | Step | Trigger | Tool | Output | Feeds |
|---|------|---------|------|--------|-------|
| 1 | `FetchAgent` | a press URL | fetch / fixture | normalized `Article` (text + outlet) | step 2 |
| 2 | `ExtractAgent` | an `Article` | LLM (`LlmClient`) | structured `PressCard` JSON | step 3 |
| 3 | `ValidateAgent` | a `PressCard` | schema + grounding | pass, or issues | gate |
| 4 | `PublishAgent` | a *passed* card | fs render | `feed.json` + card `.html` | live feed |

## Run it

```bash
npm install
npm start        # happy path -> PUBLISHED, writes output/feed.json + card html
npm run break    # forces a hallucinated quote -> BLOCKED at the gate
npm test         # 5 tests incl. the grounding + normalization cases
npm run live     # real Anthropic client (needs ANTHROPIC_API_KEY)
```

## Where it broke (and the fix)

v1 wired `extract → publish` directly. The extract step is an LLM, so its
pull-quotes were only *usually* verbatim — a paraphrase would get attributed to
a named outlet, which for a real press feed is a credibility/legal problem.

Fix 1 — inserted `ValidateAgent` between extract and publish as a hard gate:
the pull-quote must appear **verbatim** in the source text or the card is parked
in `needs-review.json` instead of shipping.

Fix 2 — the first grounding check false-rejected *real* quotes because sources
use curly quotes, em-dashes and odd spacing. I normalize (NFKC + quote/dash
folding + whitespace collapse) before the substring match. A unit test then
caught a second, subtler bug: I stripped the trailing period *before* trimming,
so a quote ending in `". "` kept its period and failed against mid-sentence
source text. Reordered to trim-then-strip. All grounding tests green.

## Design notes

- **DIP** — agents depend on `LlmClient` / port interfaces, never a vendor SDK.
  `MockLlmClient` (offline, deterministic) and `AnthropicLlmClient` are
  interchangeable; the composition root in `index.ts` is the only place that
  knows concrete classes.
- **SRP** — each agent does one thing; the extractor never decides what ships.
- **OCP** — add an agent (e.g. a translate step) without editing the orchestrator.
- **DRY** — one `step()` runner owns timing, tracing and bounded retry.
- **YAGNI** — no queue, DB or vector store; a JSON feed + fs output is enough to
  prove the workflow. The seams are where those would slot in later.
