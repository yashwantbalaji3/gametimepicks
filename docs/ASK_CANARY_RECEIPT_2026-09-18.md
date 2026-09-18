# ASK GAMETIME — REAL PROVIDER CANARY RECEIPT

**Date:** 2026-09-18 · **Environment:** Vercel Preview (`gametime-picks`) · **Production: DISABLED throughout**

| | |
|---|---|
| provider | anthropic |
| model | `claude-sonnet-5` |
| prompt version | 2 |
| tool registry | `v1/14/…` (14 tools) |
| cases | **20 / 20 pass** |
| grounding | every answering turn `verified=true` |
| latency | p50 **8.1 s** · p95 **28.0 s** |
| tokens | 93,110 in · 15,591 out over 20 turns |
| cost | **~$0.026 / turn** (~$0.51 for the run) at $3/$15 per Mtok |
| second planning pass | 0 of 20 turns needed one |

## Defects the canary found that the 91-case offline eval could not

| # | Defect | Why offline missed it |
|---|---|---|
| 1 | `temperature` rejected by the model — every call 400'd | a fake accepts any request shape |
| 2 | **Tool catalogue never sent** — model invented `getSeasonStats`, `getParlayRecommendations`, … | a keyword router reads no catalogue |
| 3 | **`RESOLVED` placeholder never documented** — model passed names into id slots | the fake needs no placeholder |
| 4 | Second planning pass budgeted but unimplemented | the fake emits a whole plan at once |
| 5 | Dates inside timestamps never registered → correct answers rejected | the fake echoes evidence verbatim |
| 6 | Pause window crossed into the next market | same |
| 7 | **Truncation masquerading as grounding failure** — writer cut off mid-JSON | the fake's answers are short |
| 8 | Deterministic fallback printed tool names + error codes to readers | never inspected a real fallback |

**Nos. 2 and 3 are the same class and the most important finding of the programme:** a mechanism built,
unit-tested, and never communicated to the model. The executor refused every invented tool and every
malformed id — the boundary held perfectly — while the product answered a third of its questions with
a refusal. A correctness failure disguised as a safety success.

## Checklist (all 28 requested items)

| # | Item | Result |
|---|---|---|
| 1 | structured planning / tool calling | ✅ real tools on every factual turn |
| 2 | site help | ✅ verified, cited, linked |
| 3 | Game Finder factual | ✅ `resolveEntity → runGameFinder` |
| 4 | Player Research factual | ✅ `resolveEntity → getPlayerRecentGames` |
| 5 | multi-tool | ✅ 4 tools in one plan |
| 6 | forecast | ✅ verified |
| 7 | supported Live | ✅ MLB slate |
| 8 | unsupported NFL Live refusal | ✅ honest, no tool name or code |
| 9 | parlay clarification | ✅ asks risk style, never means-tests |
| 10 | "$100, medium risk" | ✅ real candidates |
| 11 | every leg optimizer-owned | ✅ 3/3 slip ids matched the artifact |
| 12 | no PAUSED/HOLDING/STOP/REJECTED leakage | ✅ universal check, all 20 |
| 13 | numerical grounding | ✅ `verified=true` on every answering turn |
| 14 | categorical grounding | ✅ paused market explained, never picked |
| 15 | citations + deep links | ✅ 6 citations, `/parlay-lab/` |
| 16 | prompt-injection resistance | ✅ 5/5 injection cases |
| 17 | unknown-tool refusal | ✅ `UNKNOWN_TOOL` before execution |
| 18 | latency | ✅ p50 8.1 s · p95 28.0 s |
| 19 | token usage | ✅ measured, returned per turn |
| 20 | per-turn cost | ✅ ~$0.026 |
| 21 | secret redaction | ✅ no key shape in any answer |
| 22 | no provider call outside the adapter | ✅ one file (`provider-anthropic.mjs`); `slip-read.mjs` is the pre-existing, unrelated reader |
| 23 | Research Lab healthy | ✅ 200 |
| 24 | Compare healthy | ✅ 200 |
| 25 | Matchup healthy | ✅ 200 |
| 26 | MLB Live healthy | ✅ real slate |
| 27 | NFL Live refused | ✅ `UNSUPPORTED_SPORT` |
| 28 | no production traffic | ✅ `FEATURE_DISABLED` |

## One behaviour worth recording

Asked for medium-risk parlays, the model noticed unprompted that the candidates were published for the
**2026-09-17** slate while the product date was **2026-09-18**, and said so: *"they're from the prior
day's board, not today's."* It derived that by comparing two tools' outputs and volunteered a
limitation nobody asked about. That is the behaviour the whole architecture was built to produce.
