# v2 Dataset Inventory (auto-generated)

> `app/scripts/audit-v2-dataset-inventory.mjs --write-report` · READ-ONLY · deterministic · no paid API.
> What settled evidence v2 has, and which features are available vs missing.

## Settled validation data (public era ≥ 2026-05-27; May 25/26 banned)

### MLB settled leans (`pipeline/validation/mlb_settled_leans.jsonl`)
- Rows: total 4906, public-era 3356. Dates: 2026-05-27, 2026-05-28, 2026-05-29, 2026-05-30, 2026-06-01, 2026-06-02, 2026-06-03
- Outcomes (public era): **1682W / 1674L** · push/pending 0
- Markets: pitcher_strikeouts=154, batter_hits=1317, batter_total_bases=565, batter_hits_runs_rbis=1320
- model probability: yes · odds inline: no (join board for odds/de-vig)

### NBA settled leans (`pipeline/validation/settled_leans.jsonl`)
- Rows: total 2308, public-era 794. Dates: 2026-05-28, 2026-05-30, 2026-06-03
- Outcomes (public era): **421W / 373L**
- Markets: AST=232, PTS=294, REB=268
- odds inline: yes (oddsOver/Under). NBA recent-form fails closed (ordering unverified).

### Boards & graded
- MLB boards: 19 dates (2026-05-16 … 2026-06-04). Two-way odds: 426/426 on 2026-06-04.
- NBA boards: 35 dates (2026-05-04 … 2026-06-07).
- optimizer-graded: 9 dates; public-era 7 (2026-05-27, 2026-05-28, 2026-05-29, 2026-05-30, 2026-06-01, 2026-06-02, 2026-06-03).

## Leakage posture
- Settled-only (outcomes from the settled log); recent form sourced from THAT date's pregame board (no future leakage).
- May 25/26 + pre-era excluded by date filter. Per-slate board scoping (no cross-slate leakage).

## Feature availability matrix
| Feature | Status | Source / note |
|---------|--------|---------------|
| recentSeries (full season) | AVAILABLE | MLB board `leans[].recentSeries` (oldest→newest) |
| true L5 / L10 | AVAILABLE | derived from board recentSeries (MLB only; NBA ordering unverified → fail closed) |
| Low gate (L5 5/5) | AVAILABLE | derived; gated as shadow_watchlist |
| odds cutoff (≤ -150) | AVAILABLE | board oddsOver/oddsUnder |
| model probability | AVAILABLE | settled_leans modelProbOver/Under |
| market probability (de-vigged) | AVAILABLE | board impliedOver/Under → two-way de-vig |
| home / away | AVAILABLE | board homeTeamAbbr/awayTeamAbbr vs playerTeamAbbr |
| line bucket | AVAILABLE | board/settled line |
| market type | AVAILABLE | marketKey (4 MLB markets) |
| batter handedness | MISSING | no handedness field in any source |
| pitcher handedness | MISSING | no handedness field |
| platoon split | MISSING (market-calibrated) | needs handedness; prior study: market already prices it |
| confirmed starter | MISSING | no confirmed-starter field |
| park / weather / umpire | MISSING | not collected |
| NBA injury / minutes / usage | MISSING | NBA pregame features not collected; board ordering unverified |
| alternate lines | MISSING | provider request scope excludes *_alternate markets (see alternate-lines-readiness) |

## Implication
- The de-vigged unbiased MLB sample is the strongest evidence and is fully usable.
- New *features* (handedness, platoon, confirmed starter, park/weather, NBA pregame, alternate lines) are **missing** — they cannot be validated until collected; they are not under-sampled, they are absent.
- More *volume* (settled slates) is what the available recent-form gates need to clear the hardened launch gates.

*Read-only; no public/model/data change.*
