# MLB Team-Market Daily Ingest + Independent-Input Audit (2026-07-09)

**The evidence pipeline for the internal full-game engine — what can accumulate safely, what is
honestly missing, and whether daily wiring is safe.** Verdict: daily team-market accumulation IS safe
(Path A + B); independent inputs are still thin (park factors are the only real add; pitcher strength
stays neutral); the model stays **internal-only, market-anchored, not ready**. No money / record /
exposure / public change — md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $0.

Supersedes nothing; complements `MLB_TEAM_MARKET_DAILY_INGEST_AND_BACKTEST_AUDIT_2026-07-09.md`
(the prior pass's data-source audit) with the daily-wiring decision + the pitcher/park input plan.

---

## 1. Existing pipeline map

| stage | producer | output | committed? |
|---|---|---|---|
| slate board | `pipeline/mlb/generate_mlb_board` | `app/public/data/mlb/boards/<date>.json` | yes (public) |
| props ingest | `app/scripts/ingest-mlb-slate.mjs` | `app/public/data/mlb/props/…` | yes (public) |
| **team markets** | `app/scripts/ingest-mlb-team-markets.mjs --write` (~3 Odds credits) | `app/public/data/mlb/team-markets/<date>.json` | yes (public) |
| de-vig read | `getMlbGameCenter(date, gameId)` (`src/lib/mlb-team-markets.ts`) | in-memory ML / total / run line + implied probs | — |
| **internal line snapshot** | `app/scripts/ingest-mlb-team-market-lines.mjs` (this layer) | `data/internal/mlb/team-market-lines/<date>.json` | yes (internal) |
| finals / linescores | StatsAPI schedule (free) + committed `data/internal/mlb/linescores/<date>.json` | scores | 07-04…08 committed; 07-09 live |
| product settlement | `data/internal/mlb/product-settlement/<date>.json` | graded legs | 07-04…09 |

**The daily refresh already runs the money-guarded `refresh_daily_products.sh`, which calls
`ingest-mlb-team-markets.mjs --write` every slate** and md5-guards `portfolio.json` (exits 1 if money
moves, never deploys). So the committed team-market data the internal snapshot needs is *already
produced daily* — the internal snapshot just has to read it and write to `data/internal/`.

### Answers (team-market ingest)

1. **Where do MLB ML / total / run-line lines originate?** The Odds API via
   `ingest-mlb-team-markets.mjs`, committed to `public/data/mlb/team-markets/<date>.json`, then de-vigged
   by `getMlbGameCenter`. No line is ever fabricated.
2. **Which dates have committed team-market lines?** **2026-07-09 only.** The Odds ingest only runs for
   the current slate; historical odds would cost paid credits (not spent).
3. **What fields are normalized today?** moneyline (home/away odds + de-vigged win prob + favorite),
   total (line + over/under prob + lean), run line (line + favorite + cover prob). `teamTotals: null`
   (honest — not ingested for MLB).
4. **Idempotent / deterministic?** Yes — `asOf = date`, no wall-clock, stable ordering.
5. **Internal-only / non-web-served?** Yes — `data/internal/…`, `public:false`, not under `app/public`,
   404 on prod.
6. **What blocks multi-date backtesting?** Exactly one thing: only one date has committed lines. Finals
   exist for more dates, but without lines there is no market baseline to grade against.

## 2. Independent-input availability matrix

| input | classification | detail |
|---|---|---|
| probable pitchers | `available_free_fetch` | StatsAPI `hydrate=probablePitcher`; 13/13 for 07-09; a *probable*, may differ from the actual starter |
| team run rates | `available_committed` | computed from committed final linescores (07-04…08); thin (~4–6 g/team); **filter to strictly-earlier dates** for leakage safety |
| park / stadium id | `available_free_fetch` | StatsAPI schedule carries `venue`; mapping is stable |
| **static park factors** | `available_static_documented` | approximate, publicly-established, rounded season-level run factors (this pass adds them); confidence `approximate`; **not authoritative** |
| pitcher strength ratings | `unsafe_for_pregame_use` (for backtest) / `missing` (committed) | no committed per-start data; live season stats fetched *now* include post-date games ⇒ would **leak** into a past-date backtest ⇒ kept **neutral** |
| bullpen rest / usage | `missing` | no free committed source |
| lineup handedness | `missing` | not ingested |
| weather | `missing` | not ingested |
| injuries | `missing` | not ingested |

## 3. What can be built safely now

- **Daily team-market line accumulation** — safe via **Path A (workflow-integrated, guarded)** *and*
  **Path B (operator-run daily script)**. The refresh already produces the committed source + md5-guards
  money; the internal snapshot only writes `data/internal/`.
- **Static park-factor table** — the one genuinely real independent input (park factors are structural
  constants, not live/leaky data). Encoded conservatively, rounded, per-entry confidence, neutral
  fallback for any park we are not sure about.
- **Extended independent-input artifact** with an honest `modelInputCompletenessScore`.
- **Engine mode selection** — market-anchored by default; a *bounded, shadow-only*
  `market_anchored_with_independent_adjustments` mode when a non-neutral park factor exists.
- **Leakage-safe rolling backtest** that grows automatically as lines accumulate.

## 4. What stays blocked

- **Pitcher-strength ratings** — kept **neutral** (`usableForIndependentModel:false`). A leakage-safe
  rating needs committed *as-of-date* per-start data we do not have; fabricating one would poison the
  backtest. Honest not-ready.
- **Bullpen / lineup / weather / injuries** — missing, marked missing.
- **An independent (non-market) predictive model** — the inputs are nowhere near sufficient. The engine
  stays market-anchored.
- **Any multi-date backtest** — until lines accumulate across ≥5 dates / ≥50 games.

## 5. Daily-wiring safety decision

**Safe to wire — Path A + Path B.** Rationale:

- `refresh_daily_products.sh` is fail-closed and **md5-guards `portfolio.json`** (exits 1 if money moves)
  and **never deploys**. Adding a step that only reads committed public data and writes `data/internal/`
  cannot change money, exposure, the record, or the public site.
- The step is **non-fatal** (`|| true`-guarded): if the internal snapshot fails, the money-critical
  refresh is unaffected.
- The **operator-run script** (`ingest-mlb-team-market-lines-daily.mjs`) remains the primary manual entry
  and carries a **no-overwrite guard** (`--force`/`--refresh` required to replace a historical snapshot),
  so accumulation is append-only by default.

## 6. Verdict

The pipeline can now **accumulate a real multi-date sample daily** and the input coverage is **honestly
represented** (park factors real-but-approximate; pitcher strength neutral; bullpen/lineup/weather
missing). The model remains **internal-only, market-anchored, not ready** — the single unlock is
*time*: committing lines daily until ≥50 graded games exist, plus real pitcher/bullpen inputs. Nothing
here touches money, the record, exposure, product cards, or the public site.
