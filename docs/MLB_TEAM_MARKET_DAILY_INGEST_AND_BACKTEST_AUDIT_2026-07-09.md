# MLB Team-Market Daily Ingest + Backtest Audit (2026-07-09)

**The internal validation foundation for the full-game engine: daily team-market snapshots, independent
context inputs, and a rolling backtest — all internal-only. Verdict: the model is NOT ready; the binding
constraint is that committed team-market lines exist for one date only.** No money/record/exposure/public
change (md5 `affe6b21…`, 19-14, $0).

---

## Data sources

| data | location | dates | notes |
|---|---|---|---|
| team-market lines (ML / total / run line + implied prob) | `public/data/mlb/team-markets/<date>.json` → `getMlbGameCenter` | **2026-07-09 only** | de-vigged; a daily snapshot needs a daily odds pipeline |
| final scores / linescores | StatsAPI schedule (free) + committed `data/internal/mlb/linescores/2026-07-04..08` | 07-04…09 | 07-09 partial-final |
| probable pitchers | StatsAPI `hydrate=probablePitcher` (free) | any date | 13/13 for 07-09; a *probable*, may differ from the starter |
| team run rates | computed from committed linescores | 07-04…08 | thin (~4–6 games/team) |
| park factor / bullpen / weather / pitcher strength | — | — | **missing** (no free committed source) |

## Which dates can be backtested?

Only dates with BOTH committed team-market lines AND official finals. Lines exist for **2026-07-09**
only, so the rolling backtest window is that single date's final games (9 as of writing). Past dates
(07-04…08) have finals but **no committed lines**, and fetching historical odds would spend paid Odds
credits — not done. So the backtest is intrinsically tiny → `insufficient_sample`.

## Market baseline fields (available)

moneyline implied prob · total line + O/U prob · run line + cover prob — all committed for 07-09.
Team totals: not ingested for MLB (honest null).

## Independent context fields

Available (free): probable pitchers (StatsAPI); team run rates (computed, thin). Missing: pitcher
strength ratings, park factor, bullpen rest/usage, lineup handedness, weather. ⇒
`usableForIndependentModel: false` — a probable-pitcher name + a thin run rate is not a predictive model.

## Free vs paid / stable vs live

- **Free + safe:** StatsAPI schedule (finals, probable pitchers), the committed de-vigged Game Center.
- **Paid (avoided):** live sportsbook odds for arbitrary historical dates (would burn Odds credits).
- **Live / not committed volatile:** in-progress linescores (07-09 is partial-final) — graded in memory,
  not committed as a deterministic cache.

## What this pass built (all internal, `activationStatus: internal_only`)

- `scripts/ingest-mlb-team-market-lines.mjs` → `data/internal/mlb/team-market-lines/<date>.json` (idempotent).
- `scripts/ingest-mlb-independent-inputs.mjs` → `data/internal/mlb/model-inputs/<date>.json` (honest missing flags).
- `scripts/backtest-mlb-full-game-sim-rolling.mjs` → `data/internal/mlb/rolling-backtests/…` (leakage-safe, conservative verdict).

## Verdict

The pipeline exists and is honest, but the model is **not ready**: it is still market-anchored, the
independent inputs are far from sufficient, and the backtest sample is one date. The single unlock is
**committing team-market lines daily** (then the rolling backtest grows) plus adding real pitcher/park
inputs. See `docs/MLB_FULL_GAME_SIM_ROLLING_BACKTEST_REPORT_2026-07-09.md`.
