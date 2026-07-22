# MLB Pregame Archive — Settlement-Join Pipeline (2026-07-22)

Internal research infrastructure. Joins immutable `FINAL_PREGAME_FREEZE` records + captured market-lean keys to **official MLB Stats API** postgame box scores, in **separate** research-join artifacts, so the archive can begin counting settled-eligible rows toward the 500-row research gate. **No modeling. No public output. No Bank Builder / Moonshot / product / official-settlement / money change.** Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged.

## Phase 1 — joinable-family audit

| family | classification | official evaluation target |
|---|---|---|
| **team markets** (h2h / spreads / totals) | **directly settleable** | moneyline / run line / game total from final score |
| **player-prop markets** (K, outs, ER, hits, TB, HR, RBI, runs, H+R+RBI) | **directly settleable** | the player's official box-score stat vs the line |
| pitcher_status (probables) | **contextual** | linked to the starter's actual outs / K / ER (not graded as a bet) |
| confirmed_lineup | **contextual** | linked to per-batter PA / hits (not graded) |
| environment (weather/roof) | **contextual** | linked to game total runs / team runs (not graded) |
| umpire | **contextual** | linked to game total runs (not graded) |
| bullpen / plate_appearance_opportunity | **no valid outcome target** | not captured / no deterministic grade — recorded as `unsupported` |

**Directly settleable** rows can become **settled-eligible** (count toward the gate). **Contextual** rows are research-linked to an outcome but are **never graded and never counted** ("do not claim these features are predictive"). **No-target** families are recorded as `unsupported`.

## Pipeline

`app/scripts/join-mlb-pregame-settlements.mjs` (pure node, free StatsAPI, no Odds credits, no npm deps).

**Inputs:** immutable freezes (`freezes/<date>/<gamePk>.json`) · captured market-lean keys (`market-snapshots/**/normalized.json` where locally available) · official `statsapi.mlb.com/api/v1.1/game/<gamePk>/feed/live`. `settled_leans.jsonl` is a *secondary* internal cross-check only, never a replacement for official outcomes.

**Join keys:** gamePk first → providerEventId → (date + home/away) guarded fallback; playerId first → normalized name guarded fallback (a mismatch is **ambiguous**, never a silent grade); market + line + selection for player props.

**Output (separate, never mutates freezes):** `settlement-joins/<date>/<gamePk>.json` — schemaVersion, `public:false`, date, gamePk, providerEventId, freezeId + freeze hash, source snapshot ids, `researchEligibleFamilies` (copied from the freeze), official source/provenance, game final status, team outcome, `marketRows[]` (graded), `contextualRows[]`, per-status counts, joinStatus (`joined`/`pending`/`unsupported`), createdAt, contentHash.

**Durability:** market payloads (`raw/normalized.json`, ~1 MB) are gitignored → artifacts. So the join file carries the small market-lean **keys** forward (committed, compact); once a game is final, a later run grades those carried keys from the official box score — no odds payload needed at grade time. Idempotent (contentHash; final games are terminal and not re-fetched). Files are compact and stay under the 128 KiB commit size guard.

## Phase 3 — deterministic markets (12)

moneyline · run line · game total · pitcher strikeouts · pitcher outs · pitcher earned runs · batter hits · batter total bases · batter home runs · batter RBIs · batter runs scored · batter H+R+RBI.

Honesty rules (shared with, and parity-tested against, `src/lib/mlb/product-settlement/mlb-markets.ts`): equal-to-line = **push** (never loss); missing stat / game-not-final = **pending** (never loss); postponed/suspended/cancelled = **pending**; DNP = **unavailable**; ambiguous player/team = **ambiguous**; anything outside the 12 = **unsupported**. **Settled-eligible = a pregame-`researchEligible` lean with a DECISIVE outcome (win|loss).** Pushes, pending, ambiguous, unsupported, and ineligible-but-graded rows are counted separately and **never** toward the 500 gate.

## Phase 5 — audit / status

`audit-mlb-pregame-archive.mjs` → `status/latest.json.settlementJoins` and `monitor.json`: settlementJoinDates, gamesFinal/Pending, joinRows, **settledEligibleRows**, settledPush/pending/unavailable/ambiguous/unsupported/ineligibleGraded, distinctSettledPlayerMarkets, joinCoverageByFamily, joinCoverageByMarket, progressTo500, and an **earliest-valid-research-date** computed from observed collection math (never a promise).

## Phase 8 — validation (2026-07-22)

Ran on the earliest archived date whose games are final (**2026-07-21**) plus **2026-07-22** (to durably capture its market-lean keys before the gitignored payloads are lost):

| date | games | joined (final) | pending | settled-eligible | contextual linked | market leans carried |
|---|---|---|---|---|---|---|
| 2026-07-21 | 15 | 9 | 6 (late games not yet Final) | **0** | 32 | 0 (no market capture on 2026-07-21) |
| 2026-07-22 | 17 | 0 | 17 (first pitch ~14 h out) | **0** | 0 | 396 (h2h/spreads/totals + props, all pending) |

Grading verified against the official box score (e.g. 822787 TOR 2 – TB 12: Gausman outs 10 / K 1 / ER 4; Rasmussen outs 15 / K 5 / ER 2 — all correct).

**Settled-eligible rows gained: 0.** This is the honest state, not a pipeline defect: the only date with **final** games (2026-07-21) has **no market capture** (paid capture began 2026-07-22), and the earliest date **with** markets (2026-07-22) is not final yet. The first settled-eligible rows accrue when 2026-07-22's games are final and re-joined (the CI `--lookback 3` window does this automatically).

**Gate progress:** dates 2/30 · **settled-eligible 0/500** · gate **NOT met** (expected). Binding constraint: settled-eligible rows — a date needs *both* pregame market capture *and* final games.

## Phase 6 — CI

A non-blocking `Settlement join` step runs after the freeze (free StatsAPI, `--lookback 3 --write`), before audit/monitor. Never on `pull_request`; writes only `settlement-joins/` (committed by the existing path-scoped + size-guarded metadata step); pending stays pending; idempotent; final games terminal.

## Remaining data limitations

- **No settled-eligible rows until a market-capture date is final** (temporal: markets started 2026-07-22).
- 2026-07-21 lineups were mostly not pregame-eligible (single early snapshot), so lineup contextual coverage is thin; multi-snapshot cadence raises it going forward.
- A single high-coverage game's join file could exceed 128 KiB → routed to artifact-only by the size guard (designed behavior); typical props game ≈ 115 KiB.

## Guardrails

Official StatsAPI box scores only. Freezes/snapshots immutable (never modified). Ineligible pregame values stay ineligible. Pending never a loss. No modeling / calibration / feature scoring / public prediction. No money / official-settlement change. Guards: `app/src/lib/mlb-pregame-settlement-join-guards.test.mjs` (14).
