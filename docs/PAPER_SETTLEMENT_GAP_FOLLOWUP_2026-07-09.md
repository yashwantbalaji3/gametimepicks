# Paper Settlement Gap Follow-up + Next-Slate Readiness (2026-07-09)

Where paper settlement stands after the player-prop + soccer extension, and why the next slate isn't
ready to preview yet. No money/public/exposure change (md5 `affe6b21…`, 19-14, $0).

---

## MLB coverage

| market | status | source / missing field |
|---|---|---|
| moneyline | **supported** | committed linescore → `settleMlbMoneyline` |
| run_line | **supported** | committed linescore → `settleMlbRunLine` |
| total | **supported** | committed linescore → `settleMlbTotal` |
| pitcher_strikeouts | **supported** | `settled_leans.jsonl` join → `settleOverUnder(actual, side, line)` |
| batter_hits | **supported** | `settled_leans.jsonl` join |
| batter_total_bases | **supported** | `settled_leans.jsonl` join |
| batter_hits_runs_rbis | **supported** | `settled_leans.jsonl` join |
| team_totals | **blocked** | needs per-team runs + an unambiguous team-side mapping on the card leg (leg carries only home/away, not which team's total) |
| batter_home_runs | **retired/blocked** | Homer Nukes retired; not a candidate market |

## Soccer coverage

| market | status | source / missing field |
|---|---|---|
| moneyline_90 / match_result | **supported** | committed `world-cup/settlement/<date>.json` FT score |
| double_chance | **supported** | FT score |
| draw_no_bet | **supported** | FT score (draw ⇒ push) |
| match_total_goals | **supported** | FT score |
| btts | **supported** | FT score |
| asian_handicap | **blocked** | not settlement-wired in candidate-leg (`SOCCER_SETTLEABLE` excludes it); needs a tested AH quarter-line settler |
| team_totals | **blocked** | needs per-team goals + line mapping (committed finals give match goals, not a per-team line rule) |
| anytime_scorer / player props | **blocked** in paper settlement | committed WC settlement has FT team scores; player-level actuals are not joined into paper settlement here |

## Blocked-market detail

- **MLB team_totals** — a card leg has `side: home|away` but no over/under + team-total line binding that
  `settleMlbTeamTotal` can consume unambiguously. Wire only when the candidate leg carries
  `{ team, overUnder, line }` explicitly.
- **Soccer asian_handicap / team_totals** — no tested deterministic settler; `settlementSource` is already
  `none` for these in `candidate-leg.ts`, so they can't even be promoted. Correct to leave blocked.

## Next slate (2026-07-10) readiness

**Not ready to preview.** No committed source data exists for the next slate:

| artifact | 2026-07-10 |
|---|---|
| `app/public/data/mlb/boards/2026-07-10.json` | **absent** |
| `data/internal/multi-sport/candidate-pool/2026-07-10.json` | **absent** |
| `app/public/data/world-cup/projections/2026-07-10.json` | **absent** |

Generating them requires the daily refresh (`refresh_daily_products.sh`), which fetches **paid Odds
credits** and is fail-closed without `ODDS_API_KEY`. That is an operator-initiated step, not something
this internal ops pass runs (no credit burn, no fabrication). **Next-slate previews therefore resolve to
`no_play` / awaiting-data**, and **no card is promoted** (also correct — promotion needs explicit founder
approval + committed legs, neither of which exists for 07-10 yet).

**Operator action to prepare 07-10:** `bash scripts/refresh_daily_products.sh --date 2026-07-10` (with
`.env` keys) → then `build-multi-sport-candidate-pool.mjs` + `build-founder-review-previews.mjs --date
2026-07-10 --write` → review → (optionally) promote with explicit approval.
