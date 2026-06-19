# June 19 — World Cup projections + Parlay Lab risk matrix

_Branch `june19-worldcup-parlaylab-risk-matrix` off main `5d0593c9` (#529). Audit at 2026-06-19 05:22 UTC._

## Headline finding
**No June 19 slate exists yet** — `world-cup/projections/2026-06-19.json`, `world-cup/parlays/2026-06-19.json`, `parlays/optimizer/2026-06-19.json`, `mlb/boards/2026-06-19.json` are all **MISSING**. So the engine has no current slate to generate from. Generating one would require running the live pipeline (Odds API credits) — out of scope and would risk fabrication. The honest fix is: **attempt every sport × risk bucket and produce a real diagnostic reason ("no current slate")**, and standardize the public risk labels.

## Risk labels
| current internal | current public label | target internal | target public | files |
|---|---|---|---|---|
| low | "Low" / "Lower variance" | low | **Low Risk** | parlays-explorer, game-detail-page, normalize, dual-ladder-board |
| medium | "Medium" / "Balanced" | medium | **Medium Risk** | same |
| high | "High" / "Higher return" | high | **High Risk** | same |
| longshot | "Longshot" | longshot | **Longshot** | same |
- Internal `RiskLevel = "low"\|"medium"\|"high"\|"longshot"` (`parlays/types.ts`) is already canonical. Old strings `lower_variance/balanced/higher_return` map → `low/medium/high`.
- NOTE: MLB optimizer **profiles** ("Conservative/Balanced/Aggressive") are a *separate* taxonomy — not the risk buckets — and are left alone.

## Engine coverage (current)
| scope | card source | issue | planned |
|---|---|---|---|
| WC single-game | `getGameSpecificCardsForGame` ← `loadTodaySlate().gameSpecific` | 0 cards (no slate) | diagnostics: `no_current_slate`; four buckets shown with scoped empties |
| WC multi-game / Mixed | `generateMixedParlays` → `mixedByRisk` | 0 (no slate) | diagnostics per bucket |
| MLB | `generateDailyParlays` → `suggestedBySportRisk.MLB` | 0 (no slate) | diagnostics per bucket |
| UFC | gated by settlement | settled June 15 → stale | excluded from active; results-only |
| Bank Builder candidates | active artifact | Lane A awaiting / Lane B queued | unchanged (no new legs this task) |

## Parlay Lab
| route/component | current | issue | desired |
|---|---|---|---|
| `/picks` + `/parlays` ← `ParlaysExplorer` | sport tabs + risk sections + coverage matrix (#526) | labels "Low/Medium/High"; empty states not reason-backed | canonical "Low Risk/…"; coverage matrix with target+status; scoped empties with top rejection reasons; "Why empty?" drawer |
| `/games/world-cup/[slug]` ← `game-detail-page` | risk labels "Lower variance/Balanced/Higher return" | non-canonical; buckets hidden when empty | canonical labels; all four buckets with scoped empties |
| `/build` | risk filters | non-canonical labels | canonical labels |

## Scope of THIS pass (honest, high-value, no fabrication)
1. **Canonical risk taxonomy** — `lib/parlays/risk-taxonomy.ts`: `RISK_BUCKETS`, `RISK_LABELS` (Low Risk/Medium Risk/High Risk/Longshot), `normalizeRiskBucket`, `riskLabel`, `RISK_GATES`, `CARD_GENERATION_TARGETS`. Tested.
2. **Card-factory diagnostics** — `lib/parlays/card-factory-diagnostics.ts`: pure `buildCardFactoryDiagnostics(slate)` → matrix per scope × bucket with `{attempted, passed, target, rejected{reasons}, message, status}`; `no_current_slate` when the slate is empty. Snapshot written to `public/data/parlays/card-factory-diagnostics.json`. Tested.
3. **Label standardization** to the canonical public labels across the bucket-keyed maps (parlays-explorer, game-detail-page, normalize, dual-ladder-board).
4. **Parlay Lab UI** — coverage matrix uses the four canonical labels + target + status; scoped empty states show the top rejection reasons; a "Why are some buckets empty?" diagnostics drawer; UFC excluded when stale.
5. **WC game-page** — always renders all four risk buckets with scoped diagnostic empties + canonical labels.

## Deferred (documented — not silently skipped)
- New per-bucket generators with the full gate table (Phases 6–9) and WC projection upgrades (xG/projected-score/game-script, Phase 5): the existing generators already attempt every bucket, and there is **no current slate** to generate from, so a rewrite would produce nothing today and the xG/score/game-script fields aren't in the market-implied feed (adding them would fabricate). The diagnostics layer makes the empty state honest and explains exactly why. These become real work once a June 19 slate is generated.

## Guards
- No fabrication (no invented slate/odds/props/xG). Protected `public/data/bank-builder/*` untouched; no settlement changes; no new BB legs. Stale UFC stays results-only. No banned copy; canonical risk labels only.
