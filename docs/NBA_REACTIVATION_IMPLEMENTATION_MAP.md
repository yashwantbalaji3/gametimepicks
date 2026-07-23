# NBA Reactivation — Implementation-Level Component Map (Phase 10)

_An implementation-level map of every component the NBA player-prop pipeline needs when the 2026-27 season returns
(~Oct 2026), classifying each for reuse. Companion to the forensic audit
([docs/NBA_ENGINE_FORENSIC_AUDIT.md](NBA_ENGINE_FORENSIC_AUDIT.md)), the reactivation architecture
([docs/NBA_REACTIVATION_ARCHITECTURE.md](NBA_REACTIVATION_ARCHITECTURE.md)), and the timing contract
([docs/NBA_FEATURE_AND_TIMING_CONTRACT.md](NBA_FEATURE_AND_TIMING_CONTRACT.md)). Every classification below cites the
actual file(s) opened and read. NBA is **HISTORICAL_ONLY** — nothing here activates a public/trained model, and the
official money artifacts are untouched (portfolio.json md5 stays `affe6b21071f2b3be96bb2774eb347c3`)._

## Classification legend

| Class | Meaning |
|---|---|
| **reusable-as-is** | Works today; needs no code change to serve real data again (only the season + a healthy data source). |
| **reusable-after-update** | Sound design, real output, but a concrete gap must be closed before it is leakage-safe / trustworthy. |
| **must-be-replaced** | The current implementation is structurally wrong for a re-validated model and must be swapped. |
| **missing** | Does not exist in the pipeline at all; must be built. |
| **prohibited-due-to-leakage** | A tempting shortcut that would inject future information; must NOT be done. |

## Summary

| # | Component | Primary file(s) | Class | One-line reason |
|---|---|---|---|---|
| 1 | Historical board generator | `pipeline/generate_daily_board.py` | reusable-after-update | Produced 21 real boards, but stores a display-only tip-off, passes provider ids raw, and joins odds→game by team full-name. |
| 2 | Schedule provider | `pipeline/providers/nba_api_provider.py`, `espn_provider.py`, `fetch_nba_schedule.py`, `manual_overrides/schedule_overrides.json` | reusable-after-update | nba_api times out from CI; ESPN fallback works but its ISO tip instant is discarded. |
| 3 | Injury / news inputs | `pipeline/manual_overrides/news_signals.json`, `config.py` (`INJURY_DATA_MODE=manual`) | reusable-after-update (+ automated feed **missing**) | Has `createdAt` but no `capturedAt<tipoff` enforcement; no automated feed. |
| 4 | Player / team identifiers | `app/src/lib/sport-identity.ts` (teams) · `generate_daily_board.py:900-908` (players) · **no** identity module | team labels reusable-as-is · **player/game identity must-be-replaced** | No cross-provider reconciliation anywhere; ids drift (Bridges `1628969`↔`3147657`); joins are name-based. |
| 5 | Market ingestion (odds) | `pipeline/generate_daily_board.py` (the_odds_api), `credit_guard.py`, `providers/odds_api_provider.py`, `fetch_game_markets.py` | reusable-as-is | Credit-guarded, pregame snapshot, 10/11 markets available; never fabricates. |
| 6 | Projection output | `pipeline/build_features.py`, `attach_recent10.py`, `score_model.py`, `recent10_extractor.py` | reusable-after-update | Feature code is pure/fine, but the strictly-prior leakage guard is timing-dependent, not structural, on the live path. |
| 7 | Settlement | `pipeline/settle_results.py`, `export_results.py`, `audit_daily.py` | PTS/REB/AST reusable-after-update · **3PM/PRA/STL/BLK must-be-replaced** | `SUPPORTED_MARKETS=('PTS','REB','AST')` short-circuits the other four to 100% invalid; lean id is dropped at settlement. |
| 8 | Results / calibration | `pipeline/export_results.py`, `calibration_report.py`, `results/lifetime_summary.json` | reusable-as-is | Honest derived artifacts (hit 0.4908 shown truthfully); inherits the settlement fixes. |
| 9 | Workflows | `.github/workflows/morning-projections.yml`, `nightly-settle.yml`, `nba-market-probe.yml` | reusable-as-is | Credit-guarded, `skip_nba` escape hatch, dormant off-season. |
| 10 | Public route dependencies | `app/src/app/nba/{page,board,power,parlays,results}/page.tsx`, `app/src/app/results/nba/page.tsx` | reusable-as-is (gated) | Render empty gracefully; must STAY HISTORICAL_ONLY until the validation gate passes. |
| — | ISO tip-off instant | (none — display strings everywhere) | **missing** | #1 timing gap; blocks `boardGeneratedAt < tipoffTime`. |
| — | Cross-provider identity layer | `app/src/lib/nba/identity-contract.ts` (new, Phase 11) | **was missing → now provided** | Deterministic team/player/game identity + crosswalk/lineage. |
| — | Immutable pregame snapshot | `app/src/lib/nba/pregame-snapshot-contract.ts` (new, Phase 12) | **was missing → now provided** | Enforces `capturedAt<tipoff`, immutability, late-update-new-snapshot. |
| — | Expected minutes / confirmed starters | (none) | **missing** | grep-confirmed absent; only "planned" in `app/src/app/nba/power/page.tsx`. |
| — | Historical board backfill (Path B) | — | **prohibited-due-to-leakage** | Pregame odds never retained; reconstructing from closing/settled data leaks. |

---

## Component detail

### 1. Historical board generator — `pipeline/generate_daily_board.py` → **reusable-after-update**
Orchestrates one day's board: resolve schedule → fetch/match odds → resolve player identity → score → attach
features → write `boards/<date>.json`. It genuinely worked (21 real-lean boards, 2,204 leans; see the census). Three
concrete updates gate leakage-safety:
- **Display-only tip-off.** `generate_daily_board.py:1018` writes `"tipoff": game.get("tipoff", "TBD")` — always a
  display string (`"8:30 PM ET"`). This is the single reason 0 of 54 boards are timing-provable (census
  `FULLY_RESEARCH_ELIGIBLE=0`). Must emit an ISO tip-off instant.
- **Raw provider ids + name-based joins.** Player id comes from a name string (`resolve_player_id`, `:900`) with an
  ESPN-athlete-id override (`:905-908`); the odds→game join is by team full-name pair (`:812-818`). Route both through
  `app/src/lib/nba/identity-contract.ts` (Phase 11).
- **Feature-degraded days.** 2026-05-06 carried odds on all 140 leans but trailing features on only 58 — the generator
  must mark such rows `insufficient_data`, not silently ship them.

### 2. Schedule provider — **reusable-after-update**
Chain (`resolve_schedule_for_date`, `:138`): manual override → nba_api → ESPN.
- `providers/nba_api_provider.py` is the primary; it is **timing out from CI right now** (`board.json.failureReason` =
  `stats.nba.com … Read timed out`). Its tip-off is `GAME_STATUS_TEXT` (`:342`), not an instant.
- `providers/espn_provider.py` **receives an ISO-UTC instant** (`ev.get("date")`, `:371`) but formats it to a display
  string via `_format_tipoff_et` (`:404-419`) and discards the instant. Persist the ISO instant — it is already in
  hand on the ESPN path.
- `manual_overrides/schedule_overrides.json` is highest-priority and operator-verified (**reusable-as-is**), but also
  stores `"tipoff": "8:00 PM ET"` and a third id namespace (`manual-2026-05-04-NYK-PHI`).
Update: harden egress for nba_api (proxy / alternate runner, per the architecture doc) **and** persist an ISO tip-off.

### 3. Injury / news inputs — **reusable-after-update** (automated feed **missing**)
`config.py:92` sets `INJURY_DATA_MODE=manual`; the layer is `manual_overrides/news_signals.json`. It has a `createdAt`
but **no structural `capturedAt<tipoff` enforcement** — nothing prevents a post-tip edit from applying (the audit's
MEDIUM leakage risk). In the 196-lean sample every `newsAction` was `"none"` (inert). Update: give each signal an
immutable capture timestamp and gate it through `pregame-snapshot-contract.ts` (a late injury update creates a NEW
cadence snapshot, never overwrites an earlier eligible one). An automated injury feed does not exist and is **missing**.

### 4. Player / team identifiers — team labels **reusable-as-is**; player/game identity **must-be-replaced**
- **Teams (reusable-as-is):** `app/src/lib/sport-identity.ts:75-84` carries the NBA label/glyph/accent. But raw board
  tricodes diverge by source (`NY`/`SA` on boards vs `NYK`/`SAS` in overrides) — string compares are unsafe.
- **Players / games (must-be-replaced):** there is **no cross-provider id reconciliation anywhere** in the pipeline
  (verified across `generate_daily_board.py` and `pipeline/providers/*`). Game ids live in three disjoint namespaces
  (nba_api `0042500206`, ESPN `401859967`, manual `manual-…`); the same player drifts across ids (Mikal Bridges is
  nba_api `1628969` on boards through 2026-06-08 and ESPN `3147657` on 2026-06-10/06-13). A name-only or id-only join
  across the record is wrong. **Replacement now exists:** `app/src/lib/nba/identity-contract.ts` (Phase 11) —
  `canonicalTeamId` (NY→NYK, SA→SAS), a player crosswalk (`samePlayer` via linked refs, never name), NBA.com game-id
  decoding (`parseNbaComGameId`), and game lineage for reschedules (`isRescheduleOf`). Unknown refs stay DISTINCT.

### 5. Market ingestion (odds) — **reusable-as-is**
`credit_guard.py` refuses runs over 75 credits, below a 300 floor, or when the key is unset (`:126-163`) — never
guesses. Odds are a pregame snapshot embedded per lean (`oddsSource:"the_odds_api"`); `market-probe-latest.json` shows
10 of 11 prop markets available. The ingestion CODE needs no change. (Data caveat: pregame odds for **un-captured**
dates were never retained — see the prohibited section; that is a data-availability limit, not a code fix.)

### 6. Projection output — **reusable-after-update**
`build_features.py` is pure and explainable (rolling/season/home-away/dispersion, floors σ_reb≥3.0). The **leakage
guard is timing-dependent, not structural**: `attach_recent10.py`'s live-fetch path (`:272`) has no target-date
filter, and only the stale-cache fallback drops on/after-slate games (`recent10_cache_fallback.py:134-137`).
Empirically 0 leaks held (the 2026-06-13 board's 1,960 source games are all ≤ 2026-06-11), but that depended on fetch
timing. Update: apply `sourceGamesStrictlyPrior` (from `feature-timing-contract.ts`) on **every** path. Separately, the
model is not yet calibrated (lifetime hit 0.4908) — recalibration is the validation gate, not an ingestion fix.

### 7. Settlement — PTS/REB/AST **reusable-after-update**; 3PM/PRA/STL/BLK **must-be-replaced**
`settle_results.py` grades each lean against an official box score (nba_api joins on `(gameId, playerId)`; ESPN on
`(gameId, playerName)`; `:503-530`), post-game only (ESPN `completed` guard, `:285-296`). It is clean for the three
supported markets (invalid = 0 of 1,230 REB). But `SUPPORTED_MARKETS=("PTS","REB","AST")` (`:80`) short-circuits every
other market to `invalid` (`:576-581`), and the box-score field maps omit three-pointers/steals/blocks — so
**3PM/PRA/STL/BLK graded 100% invalid (903/903)**. Extend the whitelist + field maps and synthesize PRA. Also: the
board lean id (`YYYY-MM-DD-<playerId>-<MARKET>`, `generate_daily_board.py:1216`) is **dropped at settlement**
(`export_results.py:47-69`) — tie-back is only reconstructable and the id drift (component 4) can break it. Persist a
stable lean id through settlement.

### 8. Results / calibration — **reusable-as-is**
`export_results.py` → `settled_leans.jsonl` + `lifetime_summary.json` (hit 0.4908 shown honestly);
`calibration_report.py` is a read-only re-aggregation. These are truthful derived artifacts; they simply inherit the
settlement fixes above.

### 9. Workflows — **reusable-as-is**
`morning-projections.yml` (cron `30 13 * * *` = 9:30 AM ET, credit-guarded, with a `skip_nba` escape hatch and a
`nba_data_provider` override), `nightly-settle.yml` (05:30 + 07:30 UTC), `nba-market-probe.yml` (manual dispatch).
Dormant off-season. On season return, confirm `skip_nba` is OFF and the provider override is default (or ESPN if
nba_api is still blocked).

### 10. Public route dependencies — **reusable-as-is (gated)**
`app/src/app/nba/{page,board,power,parlays,results}/page.tsx` and `app/src/app/results/nba/page.tsx` render the empty
current board gracefully today. The routes need no change, but they must **stay HISTORICAL_ONLY** — no re-exposure as a
public model until the validation gate ([architecture §5](NBA_REACTIVATION_ARCHITECTURE.md)) passes and the founder
approves, one market at a time.

---

## Cross-cutting MISSING pieces (built or specified this phase)

- **ISO tip-off instant** — absent everywhere (display strings only). It is the #1 gap: without it,
  `boardGeneratedAt < tipoffTime` is unprovable and the entire historical corpus is `TIMESTAMP_UNPROVEN`
  (see `status/nba-historical-date-census.json`). The ESPN path already has the instant in hand (`espn_provider.py:371`).
- **Cross-provider identity layer** — was missing; now `app/src/lib/nba/identity-contract.ts` (+ test).
- **Immutable pregame snapshot / `capturedAt<tipoff` enforcement** — was missing; now
  `app/src/lib/nba/pregame-snapshot-contract.ts` (+ test): eligibility rule, immutability, late-update-new-snapshot.
- **Expected minutes / confirmed starters** — grep-confirmed absent; enumerated as MISSING candidate fields in the
  snapshot catalog and the REB feature schema (`rebounds-prototype-contract.ts`).
- **Stable lean id through settlement** — dropped at settlement; must be persisted.

## PROHIBITED-DUE-TO-LEAKAGE (do NOT do these)

- **Backfilling NEW historical boards for un-captured dates (Path B).** Pregame odds were never retained and the
  historical-odds endpoint is paid; reconstructing a "pregame" board from now-available box scores or closing odds
  injects future information. (`status/nba-historical-backfill-feasibility.json` marks Path B INFEASIBLE_NOW for this
  reason.)
- **Using closing/settled odds as the pregame de-vig baseline.** The baseline must be the pregame-captured odds already
  on the 21 boards; closing odds are post-information.
- **Imputing missing pregame injury/lineup state from postgame availability** (e.g. "he must have been active, he has a
  box score"). A missing pregame value stays missing — never inferred from the result.
- **Reusing the 16 settled dates as an out-of-sample test without a train-only calibration refit.** The historical
  window was in-sample for the dynamic calibration; reusing it as "OOS" leaks calibration. A clean test reserves a
  chronological holdout and refits calibration ONLY on the train split (`REB_EVALUATION_PLAN` in
  `rebounds-prototype-contract.ts`).

_End of map. Read-only analysis; no money or public surface changed. NBA stays HISTORICAL_ONLY._
