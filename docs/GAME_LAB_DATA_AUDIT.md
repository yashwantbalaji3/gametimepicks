# Game Lab — Data Audit + Spec (Plan 0008 · Phase 1A)

**Read-only audit.** 2026-07-07 · for the proposed **Game Lab / Matchup Lab**: click a game → see a GameTime Picks model report → map it to our products. This document changes no code, data, money, cards, model weights, or deployment. Every field below was verified against real artifacts in the repo; anything not present is marked **ABSENT** (never invented).

---

## 1. Executive summary

**Game Lab is buildable now — as a model REPORT, not a simulation theatre.** The repo already persists a rich per-game/per-market projection artifact and already renders much of it (`components/game/game-detail-page.tsx`). What we can ship immediately is an honest, premium "what the model sees for this game" experience built from **real, de-vigged market + model probabilities, edge, confidence, and recent player form**.

**The one hard line:** we do **NOT** run or persist a per-game Monte-Carlo simulation today. The `monte_carlo_*` scripts in `pipeline/` are shadow/experimental or date-aggregated audit trails — **none writes per-game distributions to a frontend artifact, and none is consumed by scoring or UI.** So Game Lab must **not** claim "we ran a 10,000-run simulation of this match," must **not** show a scoreline/margin/total distribution as if it exists, and must **not** fabricate xG/corners/cards/first-scorer. Those are **Phase 3 (pipeline work)**, clearly labelled "not yet simulated" until real per-game outputs are persisted.

**Recommended first build (Phase 2A): the MLB Game Lab** (richest data — `sigma`, `samples`, `recentGames`), then World Cup when a tournament slate is active. Both read an artifact we already produce; zero model/pipeline work; honest placeholders for the distribution modules.

---

## 2. Data availability matrix

### World Cup — `public/data/world-cup/projections/YYYY-MM-DD.json` (`matches[]`) + `player-projections/`
| Field / module | Status | Notes |
|---|---|---|
| Moneyline 90′ (win / draw / away) | ✅ present | `modelProbability` + `marketProbability` + `americanOdds` |
| Double chance · Draw-no-bet | ✅ present | de-vigged probabilities |
| Match total goals (+ line) | ✅ present | Over/Under `americanOdds` |
| BTTS | ✅ present | |
| De-vigged market probability | ✅ present | 3-way vig removed for ML/DC |
| Model probability | ✅ present | ⚠️ WC is **odds-only** (market-implied) — no independent stat model; disclaimer already in the artifact |
| Edge % (model vs market) | ✅ present | often ~0 on odds-only knockout slates |
| Confidence · risk tier | ✅ present | "High"/"Lean"/… · "Low/Medium/High" |
| Settlement support | ✅ present | e.g. `regulation_90` |
| Kickoff (UTC) · team codes · odds provider | ✅ present | `odds_api` |
| Scoreline / margin / total **distributions** | ❌ ABSENT | not simulated/persisted |
| Team totals · xG · shots | ❌ ABSENT | odds-only; no stat/lineup layer |
| Corners · cards · first-goal-scorer | ❌ ABSENT | not offered/persisted |
| Player medians / prop **distributions** | ❌ ABSENT | player props are odds-backed only (anytime scorer, shots, assists) |

### MLB — `public/data/mlb/boards/YYYY-MM-DD.json` + `player-props/` (RICHEST)
| Field / module | Status | Notes |
|---|---|---|
| Game meta (gamePk, venue, status, probable pitchers) | ✅ present | |
| Player lean: `playerId`, `marketKey`, `line` | ✅ present | e.g. `pitcher_strikeouts` 7.5 |
| **`projection` (point estimate)** | ✅ present | e.g. 8.71 K |
| **`sigma` (std dev)** | ✅ present | e.g. 2.23 — enables an honest band |
| **`samples` · `recentSeries` · `recentGames[]`** | ✅ present | `{date, opponent, isHome, value}` recent form log |
| Odds over/under · implied · model prob · edge % | ✅ present | `edgePctOver/Under` |
| Confidence · `reason` / `reasonBullets` | ✅ present | narrative justification |
| Persisted per-game MC distribution | ❌ ABSENT | see §4 |

### NBA — `public/data/boards/YYYY-MM-DD.json` (off-season now)
`leans[]`: playerName, playerId, market (PTS/AST/REB), line, projection, `recent10[]`, confidence, edge, implied prob. No distributions. **Active season only.**

### NFL / NHL
❌ **No live per-game projection artifact.** NHL has schedule only; NFL none. Not Game-Lab-ready.

---

## 3. Sport-by-sport readiness

| Sport | Readiness | Why |
|---|---|---|
| **MLB** | 🥇 Highest | `sigma` + `samples` + `recentGames[]` + edge% → supports an honest projection band, recent-form log, and (with settlement history) confidence calibration. Active season. |
| **World Cup** | 🥈 Good | All core team markets + de-vigged probs + edge% + player props. Lacks distributions + team stats (odds-only). Best when a tournament slate is live. |
| **NBA** | 🥉 Fair | Basic board (recent10/edge/confidence). Off-season; same distribution gap. |
| **NFL / NHL** | ❌ Not ready | No per-game artifact. |

---

## 4. Simulation scripts — persistence status (the honesty gate)

| Script | Output | Persisted per-GAME to frontend? | Consumed by scoring/UI? |
|---|---|---|---|
| `pipeline/monte_carlo_props.py` | stdout JSON only | ❌ no | ❌ no (shadow) |
| `pipeline/monte_carlo_shadow.py` | `public/data/audit/monte_carlo_shadow_YYYY-MM-DD.json` | ❌ no — **date-aggregated** (all leans that day), not per fixture | ❌ no (audit trail only) |
| `pipeline/simulation.py` | none | ❌ no | ❌ no (prototype) |
| `pipeline/monte_carlo_validation.py` | none | ❌ no | ❌ no (test harness) |

**Conclusion:** the repo does **not** produce a persisted, per-game, UI-consumed simulation. **Game Lab must not present a "we simulated this match N times → distribution" module until Phase 3 wires a real per-game MC artifact.** MLB's `sigma`/`samples` let us show an honest *projection ± band* (a model estimate, explicitly not a simulation) without crossing that line.

---

## 5. Immediately buildable modules (0 model/pipeline work — real fields only)

1. **Market snapshot** — per game: win/draw/away (WC) or moneyline (MLB), de-vigged market probability + American odds, per outcome. *(real)*
2. **Model vs market** — model probability vs de-vigged market probability side-by-side, per market; the `edgePct` as the agreement signal. *(real)*
3. **Totals / BTTS / DC / DNB read** — the model's lean + odds for each team/game market present. *(real)*
4. **Biggest leans** — rank the game's markets by `edgePct` (or model−market gap); "what the model likes most / least here." *(real)*
5. **Supported / neutral / opposed** — bucket each market by whether the model agrees with, is neutral to, or opposes the market price. *(real, from edge sign/size)*
6. **Recent player form log** — MLB `recentGames[]` / NBA `recent10[]`: last-N values vs opponent, home/away, with the `projection ± sigma` band (MLB). *(real; MLB/NBA only)*
7. **What breaks it** — the honest risk note: `settlementSupport` caveats (e.g. WC knockout ET/penalties don't count on 90′ markets), `riskTier`, sample size, odds-only disclaimer. *(real)*
8. **Product mapping strip** — see §7. *(real; derived from the same board the products already use)*

## 6. Unavailable modules (require model/pipeline work — Phase 3, label "not yet simulated")

- Scoreline / margin / total **distribution histograms** (needs persisted per-game MC).
- **Player-prop distribution / volatility** ("62% sim hit rate") (needs per-player MC saved per game).
- **xG / shots / team-total heat map** (needs a stat/lineup data layer — WC is odds-only).
- **Corners · cards · first-goal-scorer** grids (not offered/persisted).
- **Consensus across books** (needs multi-book collection; today one `oddsProvider` per fixture).
- **Injury / confirmed-lineup impact** (no per-fixture artifact).

Each of these must render as an explicit, honest placeholder ("Simulation distributions coming later — not yet run for this match"), never as fabricated data.

---

## 7. Product mapping plan (how a game connects to our products)

Each Game Lab page ends with a **"where this game shows up"** strip, derived from the SAME artifacts the products already read (no new logic, no fabrication):

- **Bank Builder** — if the game carries a draw-protected/favourite team-market leg the survival selector would pick (DC/DNB/ML/totals), show "Eligible for a Bank Builder lane" + link `/bank-builder`. If the model passed, show nothing (never imply a placed card).
- **Moonshot** — if the game contributes a high-odds team-market longshot leg to today's Moonshot pool, link `/moonshot`.
- **WC Specials** — if a structured 2-leg-per-game special exists for this fixture, link `/world-cup` specials.
- **Top 10** — if the game's best lean appears on the Top 10 board, badge it + link.
- **Parlay Lab** — "Add this game's legs to a custom parlay" → `/picks` (Parlay Lab).
- **No-play log** — if the model passed on this game (no qualified card in any product), show the honest "why we passed" (the same skipped-card reasoning already used), never a fake pick.
- **Trust Center** — link each market family to its settled track record (`/results`) so a claim is always one click from its receipts.

**Rule:** the mapping is descriptive and reversible — it points at products; it never approves a card, moves money, or asserts a result.

---

## 8. Source of truth for Game Lab

**Primary:** `public/data/world-cup/projections/YYYY-MM-DD.json` (WC) and `public/data/mlb/boards/YYYY-MM-DD.json` (MLB) — the richest per-game/per-market artifacts, **already consumed** by `components/game/game-detail-page.tsx` via `lib/game-detail.ts` + `lib/normalize.ts`. Game Lab **extends this existing page**, it does not fork a new data path. **MLB board is the single richest** (adds `sigma`/`samples`/`recentGames`).

No new source-of-truth artifact should be invented for Phase 2A. A future per-game simulation artifact (Phase 3) would live at e.g. `public/data/{sport}/game-simulations/YYYY-MM-DD.json` and be **additive** — Game Lab reads it only when present, else shows the honest placeholder.

---

## 9. Risk / copy / legal notes

- **No fabricated simulation.** Never say "10,000 simulations / distribution / X% of sims" for a game until a real per-game MC artifact is persisted and consumed. Until then: "model projection" (a point estimate ± `sigma` band for MLB), not "simulation."
- **Paper-only / educational** framing on every Game Lab surface; no real-money or guarantee language; show losses honestly (Trust Center link).
- **WC is odds-only** — the model probability is market-implied; the page must say so (the artifact already carries this disclaimer). Don't present it as an independent stat model.
- **Settlement honesty** — carry `settlementSupport` caveats (90′ vs ET/PEN) into the copy so a "supported" read isn't over-claimed.
- **No Bank Builder risk-mode words** (survival/value/aggressive/safest) leak into the mapping strip; lanes are neutral **Lane A / Lane B**.
- **Assets** — team flags/logos via the existing components (FlagBadge / TeamLogo / PlayerAvatar), official-source only, initials/monogram fallback; never a broken or fabricated mark.
- **Money-safe** — Game Lab is read-only display; it must never write `portfolio.json` / `banked-ladders.json` (md5 must not move) or settle/approve anything.

---

## 10. Recommended Phase 2A implementation scope

**Build the MLB Game Lab first** (then WC when a slate is live), extending the existing game-detail page — 0 model work, honest placeholders for distributions:

1. A `/games` (or `/lab`) grid → click a game → the Game Lab report.
2. Modules from §5 only: market snapshot · model-vs-market · totals/BTTS/DC · biggest leans · supported/neutral/opposed · recent form log (MLB `sigma`/`recentGames`) · what-breaks-it · product-mapping strip.
3. Every §6 module renders as a labelled "coming later — not yet simulated" placeholder, gated on the (absent) simulation artifact — so adding Phase 3 is drop-in, never a rewrite.
4. Pure derivation in a new `lib/game-lab/` (reads the existing board/projection artifact; no fetch, no money, no fabrication) + tests pinning: no simulation claim without the artifact, no fabricated fields, product mapping is descriptive-only, no undefined/NaN, paper-only copy.
5. All gates green + money md5 unchanged; branch-only until reviewed.

### Exact next Code prompt (Phase 2A)

> **Claude Code — Plan 0008 Phase 2A: MLB Game Lab (read-only, real fields only).** Build a per-game "Game Lab" report for MLB, extending the existing `components/game/game-detail-page.tsx` / `lib/game-detail.ts`, sourced ONLY from `public/data/mlb/boards/<date>.json` (+ `player-props/`). Add a pure `lib/game-lab/` that derives, per game: (1) market snapshot (odds + de-vigged implied prob), (2) model-vs-market with `edgePct`, (3) biggest leans ranked by edge, (4) supported/neutral/opposed buckets, (5) recent-form log from `recentGames[]` with the `projection ± sigma` band, (6) a "what breaks it" risk note, (7) a product-mapping strip (Bank Builder / Moonshot / WC Specials / Top 10 / Parlay Lab / no-play / Trust Center) that only LINKS, never approves. Every distribution/xG/consensus module renders as an explicit "coming later — not yet simulated" placeholder (do NOT fabricate; there is no persisted per-game MC — see docs/GAME_LAB_DATA_AUDIT.md §4). HARD RULES: read-only; no canonical money change (portfolio.json md5 unchanged); no settlement; no card approval; no model-weight change; paper-only/educational copy; no "simulation"/"N runs"/distribution claims without a real persisted artifact; team assets via FlagBadge/TeamLogo/PlayerAvatar with fallbacks; no survival/value/aggressive/safest language. Add tests (no-sim-claim-without-artifact, no fabricated fields, mapping-is-link-only, 0 undefined/NaN). Run all gates (tsc · full tests · build · money-integrity · forensic · health · render smoke); deploy only if green, else branch-only. Report the buildable modules shipped, the placeholders, files changed, tests, gates, money md5 before/after, deploy y/n.

---

**Answers to the audit questions (index):** Q1 §2 · Q2 §2 · Q3 §4 · Q4 §3 · Q5 §3+§10 · Q6 §5 · Q7 §6 · Q8 §7 · Q9 §8 · Q10 §10. **Bottom line:** ship the honest model-report Game Lab now (MLB first) from real fields; gate every simulation/distribution module behind a real persisted artifact we do not yet have.
