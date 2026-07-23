# MLB Public Beta — Usefulness Gap Audit

**Date:** 2026-07-23  ·  **Scope:** the existing public MLB product only (hub, board, simulate lobby, game detail, results, and the committed `app/public/data/mlb/` artifacts).
**Method:** artifact-backed, read-only. Every finding cites an exact route/component/data path and concrete evidence. No code was modified except this document. No builds or servers were run. UFC and event markets are out of scope and were not inspected.

> **HARD RULE (governs all prioritization below):** accuracy-critical and transparency-critical fixes come *before* any cosmetic redesign. A prettier report that still hides when the line was captured, or still shows a batter who is not in the lineup, is worse than a plain one that is honest. Ship the transparency plumbing first.

---

## 1. Current state — is the MLB public beta useful today?

The MLB public beta is already a genuinely honest analytics product, not a tip sheet. It projects pitcher strikeouts and batter hits / total bases / hits+runs+RBIs from MLB Stats API game logs, compares each projection to the posted line, and — on the simulation surfaces — runs a deterministic 10,000-iteration player-prop simulation whose per-prop outcome histograms come straight from the artifact and are never fabricated (`app/src/components/game/mlb-simulation-report-v2.tsx` §7). The product is unusually careful about *not overclaiming*: a prominent model-calibration notice states plainly that the modeled markets do not out-predict the market (`MLB_CALIBRATION_DISCLOSURE`, surfaced at `mlb-simulation-report-v2.tsx:311-318`), candidates are labelled "not market-proven," the four record families are kept structurally separate (`app/src/lib/record-families.ts`), full-game score/win-probability is deliberately withheld as "still validating" (§11), and freshness badges re-compute against the real browser clock so a stale slate never reads as "live." The main shortfalls are not honesty *claims* — those are strong — but honesty *plumbing*: the artifacts already carry a market-capture timestamp, a full probability distribution, and honest "could-not-simulate" gaps that **the primary user surfaces never actually show**, plus a structural blind spot around confirmed lineups that materially affects whether a shown batter prop is even live. In short: the model is honest about its limits, but the UI still under-exposes the very transparency data it already has, and the board surface presents point estimates as if they were certain.

---

## 2. Already handled well (do not "fix" these)

- **Model-calibration honesty is prominent, not buried.** `mlb-simulation-report-v2.tsx:311-318` renders `MLB_CALIBRATION_DISCLOSURE` from `app/src/lib/mlb/model-calibration-status.ts` at the top of the report, and the market-agreement score is explicitly labelled "NOT calibration, NOT a claim to out-perform the market" (`:459-496`). Candidates read "not market-proven" (`:329`).
- **Real probability distributions exist and are shown on the sim surfaces.** `app/public/data/mlb/game-simulations/2026-07-22.json` → `games[].distributions` carries real 10,000-sample histogram `bins`; the report renders them (§7, `:502-527`) and refuses to invent a spread when bins are absent.
- **Full-game overreach is refused on purpose.** §11 (`:593-608`) explains *why* there is no projected score / win probability / run distribution for MLB.
- **Record-family separation is architected and test-guarded.** `app/src/lib/record-families.ts` defines four families; sim-accuracy (`comparison_report_<date>.json`) is never merged with the paper record (`portfolio.json`).
- **Honest freshness + empty states.** `FreshnessBadge` (`app/src/components/ui/freshness-badge.tsx`) re-derives "Latest slate · N days ago" against the browser clock; `simulate-lobby.tsx` has real pending/empty states (`:247`, `:372-374`) and honest per-sport "no games" copy.
- **Shareable, human-readable game URLs.** `gameDetailParams()` (`app/src/lib/game-detail.ts:399-401`) and `detailHrefForTeams` (`:433-436`) route to `/games/mlb/<home>-vs-<away>-<date>` (e.g. `/games/mlb/pit-vs-nyy-2026-07-22`).
- **Dense report is mobile-considered.** Tables use `overflow-x-auto` and progressively hide secondary columns via `hidden sm:table-cell` (`mlb-simulation-report-v2.tsx:359-426`); hub and board use responsive `grid-cols-1 sm:… lg:…`.
- **Consistent glossary + coverage matrix.** `HowToRead` and `SimulationCoverageMatrix` (rendered on `/simulate` and `/mlb`) explain terms and enumerate every market gap with its reason.
- **Per-projection input transparency.** Every lean carries `reasonBullets` (recent-form + season inputs) — e.g. board `leans[].reasonBullets` and sim `generatedPicks[].reasonBullets`.

---

## 3. Gaps (findings)

Each finding is tagged with exactly one class: **accuracy-critical · transparency-critical · usability · growth · cosmetic**.

### F1 — Market/line capture time is in the artifact but shown to no one — **transparency-critical**
- **Evidence:** `app/public/data/mlb/game-simulations/2026-07-22.json` carries both `games[].freshness.sourceCapturedAt` and `games[].marketSnapshot.capturedAt` = `2026-07-22T15:22:20Z`. A grep for `capturedAt`/`sourceCapturedAt` across `app/src/components/` returns **zero** render sites. The richest surface only shows the *sim* `generatedAt` and only at day granularity: `mlb-simulation-report-v2.tsx:616` renders `generatedAt.slice(0,10)`; `game-simulation-runner.tsx:59-67` `freshnessLabel()` outputs "generated today / N days ago" from `generatedAt`, never the odds-capture time.
- **Why it matters:** odds move intraday. A line captured at 15:22 UTC can be stale by first pitch, and the user cannot tell how old the price they are being compared against is. The data is already there — this is a display gap, not a data gap.
- **Fix:** surface `marketSnapshot.capturedAt` (as a real time, e.g. "line captured 11:22 AM ET · ~5 h before first pitch") on the report §10/§12 and on the board.

### F2 — No confirmed-lineup signal for MLB batters — **accuracy-critical**
- **Evidence:** `normalizeMlbLeans` (`app/src/lib/normalize.ts:215-251`) never sets `lineupStatus`; it hard-codes `status: "public_projection"`. The pre-lineup banner that *does* exist (`app/src/components/ui/player-props-explorer.tsx:79-87`, keyed on `p.lineupStatus`) therefore never fires for MLB — it is a World Cup-only path. Board games carry only `awayProbablePitcherId/Name` + `homeProbablePitcherId/Name` (`boards/2026-07-22.json → games[]`); there is no confirmed-lineup or scratched flag for batters, and the player-props artifact rows (`player-props/2026-07-22.json → props[]`) have no lineup field at all.
- **Why it matters:** a batter who is rested, benched, or a late scratch will still be shown a full projection and a lean, with nothing telling the user the prop may not be live. This is the single largest silent-accuracy risk in the product.
- **Fix:** ingest StatsAPI confirmed lineups; add a `lineupStatus` for MLB (`confirmed` / `projected` / `out`) and gate or badge batter props on it. Until confirmed lineups are available, label batter props "projected lineup — not confirmed."

### F3 — Board surfaces present point estimates with no uncertainty band — **transparency-critical**
- **Evidence:** board leans carry `projection`, `sigma`, and `samples` (`boards/2026-07-22.json`), but `app/src/components/mlb/mlb-projection-gap.tsx` consumes `sigma` only to scale the fill cap (`:52`) — it renders **no visible range/interval**. The `/mlb` hub (Projections / Player Props tabs, `app/src/app/mlb/page.tsx:200-230`) and `/mlb/board` therefore show a single projected number and a directional bar. The real distribution histogram exists but is rendered only on the sim/game report (`mlb-simulation-report-v2.tsx` §7), not on the board that is the primary MLB entry point.
- **Why it matters:** a 6.33-strikeout projection with `sigma` 2.38 (i.e. a wide spread) looks identical on the board to a tight one. The confidence the model actually has is hidden on exactly the surface most users see first.
- **Fix:** render at least a ±σ band or a projection ± range on the board rows (data is already present); optionally link each row to its histogram.

### F4 — "Why the model differs from the market" is never reconciled in words — **transparency-critical**
- **Evidence:** `reasonBullets` explain the projection *inputs* only (e.g. "Last 3 starts averaging 7.0 strikeouts · Season average 5.5") — see `boards/2026-07-22.json` and `game-simulations/2026-07-22.json → generatedPicks[].reasonBullets`. Model probability and market probability are shown side by side (report §4 tables), but nothing bridges them: there is no sentence of the form "the market implies ~52%; our recent+season blend lands near the line, hence the Under lean." The model-vs-market difference field (`edgePct`) is a number with no narrative.
- **Why it matters:** the entire value proposition is "here is where our number and the market's number disagree." Users are shown *both numbers* and *our inputs*, but never *why the two diverge*, which is the question the product implicitly promises to answer.
- **Fix:** add a one-line, artifact-derived reconciliation per pick (market-implied vs model-implied, and which input drives the gap). No new modeling required — it is a templated sentence over fields already present.

### F5 — Honest "could-not-simulate" gaps are dropped by the flagship report — **transparency-critical**
- **Evidence:** `game-simulations/2026-07-22.json → games[].unavailableModules` includes real per-prop gaps, e.g. `props_missing_sigma` → "2 props lacked the sigma needed to simulate a distribution (Jose Caballero Hits; …)". Only `app/src/components/game/mlb-simulation-result-summary.tsx` and `app/src/components/game/mlb-game-center.tsx` render `unavailableModules`; a grep confirms the flagship `mlb-simulation-report-v2.tsx` does **not**. So the report's honest per-prop "we could not simulate this" list is silently omitted on the main report path.
- **Why it matters:** silently dropping a prop reads as "no signal" rather than "insufficient inputs," which is exactly the distinction the coverage matrix elsewhere works hard to make.
- **Fix:** thread the sport-relevant `unavailableModules` (esp. `insufficient_inputs`) into `mlb-simulation-report-v2.tsx` §7/§12.

### F6 — Slate completeness is inconsistent: board exists without props/sims on some dates — **accuracy-critical**
- **Evidence:** `app/public/data/mlb/boards/` contains `2026-07-15.json`, but `app/public/data/mlb/player-props/` and `app/public/data/mlb/game-simulations/` **skip 07-15** (both jump 07-21 → 07-11). On such a date the board shows leans while the simulate/game surfaces are empty for the same slate.
- **Why it matters:** the same slate is "populated" or "empty" depending on which surface the user lands on, undermining trust and making the product look broken on a subset of dates.
- **Fix:** treat a slate as complete only when board + player-props + game-simulations all exist; otherwise show a single honest "partial slate" state across surfaces (the freshness/liveness machinery already exists to carry it).

### F7 — Uncertainty/distribution is gated behind the sim reveal, not offered on the board path — **usability**
- **Evidence:** distributions live only inside the runner/report reveal (`game-simulation-runner.tsx:422` gates prices/props/distributions behind the reveal); the board and hub props tabs never link a row to its histogram. Reaching a distribution requires leaving the board, opening a game, and revealing the sim.
- **Fix:** add a "see the spread" affordance from board/props rows to the matching `distributions` key (e.g. `pitcher_strikeouts__543037__6.5`).

### F8 — No prop-level shareable/deep-link URLs — **growth**
- **Evidence:** game URLs are shareable slugs (`game-detail.ts:399-401`), and the hub slate tiles anchor to `#game-<gamePk>` (`app/src/app/mlb/page.tsx:127`), but there is no per-player/per-prop deep link. A user cannot share "Gerrit Cole Ks Under 6.5."
- **Fix:** stable per-prop anchors/URLs keyed on the existing prop id (`<gameId>-<player>-<market>-<line>`).

### F9 — `/mlb/parlays` is a live route that is an intentional empty placeholder — **usability**
- **Evidence:** `app/src/app/mlb/parlays/page.tsx` is a "placeholder so MLB has the same five-tab structure … We intentionally do NOT surface MLB parlay candidates yet." Meanwhile the `/mlb` hub *does* render a "Suggested Cards" tab (`app/src/app/mlb/page.tsx:232-243`). The standalone placeholder route remains reachable and near-empty.
- **Fix:** redirect `/mlb/parlays` to the hub's Suggested Cards tab, or clearly frame the placeholder as "coming later" rather than an empty five-tab peer.

### F10 — Freshness is shown as a date, not a time-to-first-pitch — **cosmetic**
- **Evidence:** report freshness is `generatedAt.slice(0,10)` (`mlb-simulation-report-v2.tsx:616`) and the runner label is day-granular (`game-simulation-runner.tsx:59-67`). Adequate for slate age, but coarse once F1's capture time is exposed.
- **Fix:** once F1 lands, render capture and first-pitch times so "how fresh is this price" is answerable at a glance. Low priority relative to F1.

### Context (not a UI gap to "fix"): modeled-market accuracy ceiling is real but disclosed
`app/public/data/mlb/results/lifetime_summary.json` shows lifetime projection `hitRate` ≈ 0.5041 (18,701 decisive), consistent with the demotion finding that the modeled markets do not out-predict the market. This is **already disclosed** honestly (F-section §2, calibration notice) and is *not* counted as a UI gap. It is recorded here only so no one mistakes the transparency fixes above for a claim that the model is predictive — it is not, and the product correctly says so.

---

## 4. Priority order (per the Hard Rule)

1. **F2 — confirmed lineups (accuracy-critical).** Biggest silent-accuracy risk; a shown batter prop may not be live.
2. **F6 — slate completeness (accuracy-critical).** Same slate must not be "full" on one surface and "empty" on another.
3. **F1 — show market capture time (transparency-critical).** Highest-leverage single fix: the data already exists; wiring it in tells users how stale the compared price is everywhere at once.
4. **F3 — uncertainty band on the board (transparency-critical).**
5. **F4 — model-vs-market reconciliation sentence (transparency-critical).**
6. **F5 — surface `unavailableModules` on the flagship report (transparency-critical).**
7. Then usability (F7, F9), growth (F8), cosmetic (F10).

Cosmetic redesigns (F10 and any visual polish) must wait behind every accuracy- and transparency-critical item above.
