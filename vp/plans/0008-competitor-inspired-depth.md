# Plan 0008 — Competitor-Inspired Product Depth v1

**By:** Claude (VP) · **2026-07-07** (rev. adds Game Lab track) · for **Claude Code** · **run AFTER the July-10 soft launch is stable.** Pairs with `reviews/2026-07-07-competitive-teardown.md` + `product-specs/GTP_V2_FEATURE_PLAN.md`.
**Objective:** reach competitor-level depth (matchup detail, model-vs-market, calibration, better parlays), stand up the **Game Lab** simulation experience, and stand up the daily social engine — using **existing data only**, original GTP branding, no money/model changes.

**Two tracks:** **Track 1** = the depth/social modules (phases 1–8 below). **Track 2 = Game Lab / Matchup Lab** — the marquee "click a game → run a GameTime Picks simulation → full model report → mapped to our flagship products" experience (design + phases in the Game Lab section). *Simulations are the engine; Bank Builder / Moonshot / WC Specials / Top 10 are the packaged outputs.* Track 2's read-only **Phase 1A audit is the recommended first Code send.**

**Absolute guardrails:** do NOT fabricate simulator data, probabilities, or EV · if data is unavailable, render "unavailable" · no sportsbook integration · no real-money claims · no copied competitor UI/text · no model tuning · no LADDER_V2 money · money/card/deploy/brand stay founder-gated · never deploy red.

**Definition of done (every phase):** gates green (money-integrity · forensic · idempotence · health · tsc · tests · build · smoke 9/9); money-md5 unchanged; responsible-copy check passes; report proof.

## Phasing (each phase is independently shippable; stop anytime)

**Phase 1 — Audit (read-only).** Inventory current pages, routes, and the data artifacts available per matchup (what odds/probabilities/monte-carlo-shadow fields exist vs. don't). Output: a data-availability matrix so later phases only surface real fields. *No changes.*

**Phase 2 — Game Detail page shell (existing data only).** Build `/game/<slug>` with: matchup header + "probabilistic, not a prediction" badge, odds snapshot (de-vigged book), model output (win prob / margin / total / BTTS where present), distributions **only where monte-carlo-shadow data exists (else "unavailable")**, match markets, player table, biggest leans, footer disclaimer. Original GTP layout. Link back to the Trust Center.

**Phase 3 — Market Agreement / Model-vs-Market module.** Per market: model prob vs de-vigged book prob + gap + **SUPPORTED/NEUTRAL/OPPOSED** tag + no-play when thin; a headline agreement score framed as a **sanity check, not an edge claim**. Reuse existing edge/reliability data. No EV-to-bet language.

**Phase 4 — Parlay Lab v2 clarity.** Clearer suggested vs no-play, correlation warning on same-game legs, confidence band, plain-language "why these legs belong (or don't)." Model/true odds shown **only if data-backed.** Paper-only framing intact.

**Phase 5 — Daily Social Pack generator (docs/data output ONLY).** Generate `docs/social/<date>.md` (or a data artifact) with the X thread, Discord drop, IG carousel, TikTok script, "3 model leans," "best no-play," "settlement recap" — pulling real facts from the day's brief/results, running the responsible-copy check, marked DRAFT → Head → Yash. **No posting, no scheduling code, no API keys.** *(This is the highest-value, lowest-risk phase — safe to pull forward first.)*

**Phase 6 — Trust Center improvements.** Consolidate tracked record, open exposure, settled vs pending, the **no-play log**, model-review archive, and "misses & lessons" into one `/trust` surface (or an upgraded `/results`+`/mr-dub`).

**Phase 7 — Tests, copy-safety, smoke.** Add render/route tests for every new page (0 undefined/NaN, "unavailable" renders correctly, no banned copy), a copy-safety unit test, and extend the production smoke checks.

**Phase 8 — Deploy only if green.** Build → deploy → smoke 9/9. Any red → stop + report.

---

# TRACK 2 — Game Lab / Matchup Lab (the simulation experience)

**Product thesis:** click any game → **Run a GameTime Picks simulation** → branded animated sequence → a full, honest model report → the report shows how that game feeds our flagship products. *Simulations are the engine; signature products are the packaged outputs.* Inspired by SimTheGame, **original in brand, copy, and layout** — darker sportsbook-inspired GTP, paper-only, tracked receipts, no-play discipline, flagship integration.

## A. User flow
1. **Game list** (per sport, today's slate) → 2. **Game Detail page** (`/game/<slug>`) → 3. **"Run Simulation"** button → 4. **Branded animated simulation sequence** (UX only unless the model truly generates the steps shown) → 5. **Results page** = the full model report → 6. **Product mapping** panel: how this game contributes to Bank Builder / Moonshot / WC Specials / Top 10 / Parlay Lab / no-play log. Every report footer links to the **Trust Center**.

## B. Simulation animation (UX-only, honesty-bounded)
Sport-specific, branded, and **explicitly framed as "translating market prices into thousands of plausible scorelines,"** never as live play-by-play (we do not generate play-by-play). Ideas: **Soccer** — stylized pitch, ball drift, shot/goal pulses on a 90' timeline; **MLB** — diamond with an inning-tick feel; **NBA** — half-court with possession/shot-chart pulses; **NFL** — field with a drive-progress bar; **NHL** — rink with puck-movement pulses. A step tracker ("pulling market snapshot → building game scripts → running simulations → aggregating → surfacing gaps"). **Rule:** the animation may be decorative, but any *number* it reveals must be a real model output; if the step implies data we don't compute (e.g. a live goal), it stays abstract/branded, not a fake event.

## C. Simulation result modules (render only what's data-backed; else "unavailable")
| Module | Buildable now (existing fields)? |
|---|---|
| Market snapshot (de-vigged book) | ✅ yes (WC board carries odds + de-vig) |
| Win / draw / away probability | ✅ yes (moneyline home/draw/away model probs) |
| Total over/under, BTTS, Double Chance, DNB | ✅ yes |
| Biggest model leans + supported/neutral/opposed | ✅ yes (derive from edge sign + gap size) |
| Market agreement / calibration score | ✅ yes (model prob vs de-vig book prob; frame as sanity check) |
| "What the model likes / what breaks it" | ✅ yes (reliability weights + edge) |
| Projected score / most-likely scorelines | ⚠️ **needs model work** (persist a scoreline distribution) |
| Margin & total **distributions** (histograms) | ⚠️ **needs model work** (monte-carlo outputs not persisted per game) |
| Team totals grid | ⚠️ partial — needs per-team goal distribution persisted |
| Corners / cards | ⚠️ only if a data source is added — likely **unavailable** today |
| Player prop grid | ⚠️ MLB props exist per board; WC player props thin/pending — **label per sport** |
| First goal scorer | ⚠️ only if priced props exist — else **unavailable** |

## D. Product mapping (per game)
A panel on each report showing flagship contribution, e.g.: **"Used in today's Bank Builder Lane A," "Appears in Moonshot Lane B," "Top 10 lean," "No-play: edge inside noise," "Not used in flagship products today."** Source of truth = the day's approved card + Top 10 board + no-play log; **display-only, never implies a live bet.**

## E. Data-honesty rules (hard)
Existing data only · no distribution → "distribution unavailable" · no player model → "player props unavailable" · no corners/cards data → "unavailable" · **do NOT fabricate a 10,000-run simulation unless the repo has that engine wired to persist per-game outputs** · no invented EV/probabilities · **label market-derived probabilities honestly** (our probs are de-vigged from posted odds + reliability weighting, not an independent monte-carlo unless/until that engine is productionized).

## F. Game Lab implementation phases
- **Phase 1A — Simulation Data Audit + Game Lab Spec (read-only).** *First send.* See prompt below.
- **Phase 2A — Game Lab shell** with existing fields only (market snapshot, win/draw/away, total, BTTS, DC/DNB, leans, market agreement, "likes/breaks it") + product-mapping panel. Original GTP layout; Trust Center link.
- **Phase 3A — Simulation loading animation** (branded, UX-only, honesty-bounded per §B).
- **Phase 4A — Report modules** for every data-backed field; "unavailable" states for the rest.
- **Phase 5A — Product mapping module** wired to the approved card / Top 10 / no-play log.
- **Phase 6A — Market agreement module** (headline score + per-market, sanity-check framing).
- **Phase 7A — Player prop grid** where data exists (MLB first; WC per availability).
- **Phase 8A — Tests + copy-safety** (render/route: 0 undefined/NaN, "unavailable" renders, no banned copy; animation implies no fake live play).
- **Phase 9A — Deploy only if green.**
*Distributions/scorelines (the ⚠️ modules) are a later, explicitly-scoped model-work item — NOT built from fabricated data.*

---

## G. First Code send — Phase 1A (read-only audit + spec). RECOMMENDED FIRST.
Zero-risk, unblocks the whole Game Lab, and tells us honestly which modules are real today vs need model work.

### Copy-paste prompt — Phase 1A
> **Read-only audit + written spec. Change NO code, NO data, NO money. Do not fabricate anything.**
> For GameTime Picks' proposed "Game Lab" (click a game → run a GameTime Picks simulation → model report), produce `docs/GAME_LAB_DATA_AUDIT.md` answering:
> 1. **What per-game fields exist today** (inventory the real artifacts — e.g. world-cup/round-of-32 board, mlb boards, game_outlook, monte_carlo_* outputs): win/draw/away probs, totals, BTTS, DC/DNB, de-vigged odds, player medians, scoreline distributions, margin/total distributions, corners, first-goal-scorer.
> 2. **What fields are missing / not persisted to the frontend** (e.g. are monte_carlo_props.py / simulation.py outputs written per game, or shadow-only?).
> 3. **Which sports can support Game Lab first** and **whether World Cup can be first** (assess data richness per sport).
> 4. **Which report modules can be built immediately from existing fields** vs **which require new model/pipeline work** (distributions, scorelines, corners, player grids).
> 5. **How to connect simulation outputs to Bank Builder / Moonshot / WC Specials / Top 10 / no-play log** (what artifacts identify a game's flagship usage today).
> 6. A recommended **Phase 2A build scope** = only the modules that are real now.
> Output the doc as a data-availability matrix + written findings. Read-only — inventory and report, invent nothing, mark unknowns "needs verification." Confirm money-md5 unchanged (no writes). Report the file.

---

## Track 1 — suggested first phases (unchanged, run in parallel/after)
**Phase 1 (audit) + Phase 5 (Daily Social Pack, docs/data-only)** remain the top *Track 1* growth investment. Sequence overall: **Game Lab Phase 1A first (read-only)**, then Daily Social Pack (Phase 5), then build Game Lab Phase 2A + the depth modules using only audit-confirmed fields.

### Copy-paste prompt — Track 1 Phase 5 (Daily Social Pack, when ready)
> **Docs/data only. No posting, no scheduling, no API keys, no money/model changes.** Build a generator that writes docs/social/<date>.md from the day's real brief/results — X thread, Discord slate drop, IG carousel bullets, TikTok script, "3 model leans," "best no-play," "settlement recap" — real facts only, responsible-copy check (no lock/guaranteed/risk-free/real-money), marked DRAFT → Head → Yash. Run tsc/tests/build, confirm money-md5 unchanged, add a copy-safety test, commit as docs/data, report file list + gate output.
