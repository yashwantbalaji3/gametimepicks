# Paper Product Settlement Coverage Audit (2026-07-09)

**What paper settlement can grade, from what committed source, with what join.** This pass extends
coverage to **MLB player props** + **soccer** (both from committed, deterministic sources); it does not
fabricate any final, actual, or outcome. Money untouched (md5 `affe6b21…`).

---

## Coverage matrix

| market | status | committed source | deterministic join key | rule |
|---|---|---|---|---|
| MLB moneyline | **supported** | `data/internal/mlb/linescores/<date>` | leg.gameId → gamePk (board) → score | `settleMlbMoneyline` |
| MLB run_line | **supported** | linescore | gamePk → score | `settleMlbRunLine` |
| MLB total | **supported** | linescore | gamePk → score | `settleMlbTotal` |
| **MLB player props** (batter_hits, batter_total_bases, batter_hits_runs_rbis, pitcher_strikeouts) | **can_extend_now → supported** | `app/public/data/mlb/results/settled_leans.jsonl` (18,227 rows, 05-16…07-08) | (gamePk, marketKey, playerName, line) → `actual` | `settleOverUnder(actual, side, line)`; DNP/`actual==null` → unavailable |
| **Soccer** (moneyline_90, double_chance, draw_no_bet, match_total_goals, btts) | **can_extend_now → supported** | `app/public/data/world-cup/settlement/<date>.json` `finals[]` (FT regulation) | normalized (home, away) team names → `{homeGoals, awayGoals, status}` | FT-regulation rules (below) |
| MLB team_totals | **blocked** | — | per-team line + team side ambiguous on a card leg | leave pending |
| Soccer asian_handicap / team_totals | **do_not_settle** | not settlement-wired in candidate-leg | — | never eligible |

## MLB player-prop join (deterministic)

`settled_leans.jsonl` row: `{playerId, playerName, gamePk, marketKey, line, actual, outcome, date, …}`.
Card leg: `{gameId, marketKey, selection ("<Player> <Market> Over <line>"), side, line}`.

Join: `leg.gameId → gamePk` (via the committed board), then match rows where
`(gamePk, marketKey, normalize(playerName), line)` equals the leg's. **Exactly one match ⇒ grade** via
`settleOverUnder(actual, leg.side, leg.line)` (side-correct — never blindly reuse the row's `outcome`,
which is for the row's own lean). **Zero matches ⇒ pending** (date not committed / not found). **>1 match
⇒ pending** (ambiguous — never guess). DNP (`actual == null`) ⇒ unavailable, never loss.

## Soccer FT-regulation rules (deterministic)

From committed `finals[]` `{homeGoals, awayGoals, status}` (status `FT` = 90' regulation):
- **moneyline_90 / match_result** — home>away⇒home; ==⇒draw; away>home⇒away.
- **double_chance** — `homeOrDraw` wins unless away wins; `awayOrDraw` wins unless home wins;
  `homeOrAway` wins unless draw.
- **draw_no_bet** — pick wins if its side wins; **draw ⇒ push**.
- **match_total_goals** — `settleOverUnder(homeGoals+awayGoals, side, line)`.
- **btts** — yes ⇔ both>0.
- Non-`FT` / missing status (postponed/live) ⇒ **pending**. Knockout ET/PEN: 90' markets settle on the
  committed regulation `homeGoals/awayGoals` (the committed finals are FT-regulation); if a market is
  ET/PEN-dependent it stays pending. Postponed/cancelled ⇒ pending, never loss.

## Today's operated slate (07-09)

Every leg is **pending** — 07-09 is not committed in any final source (linescore / settled_leans / WC
settlement). The extensions above are validated against **committed history** (dates that DO have finals),
not 07-09. Finals for a live slate are never committed (volatile).

## Recommended statuses

`supported`: MLB team markets, MLB player props, soccer (5 markets). `blocked`: MLB team_totals.
`do_not_settle`: soccer AH / team totals. No new provider integration added — both extensions read
**already-committed** artifacts.
