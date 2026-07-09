# MLB Linescore Settlement Audit (2026-07-09)

**Wiring official MLB final-score settlement for team markets via a guarded, free StatsAPI fetch — into
the SEPARATE internal product-settlement ledger. No official money/record/exposure change.**

Money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, bankroll $19,065.40, exposure $0 —
unchanged.

---

## What was already available (committed)

| data | artifact | fields |
|---|---|---|
| player-prop actuals | `public/data/mlb/results/settled_leans.jsonl` | per-prop `actual`, `line`, `lean`, `outcome`, `gamePk`, `marketKey` (pretty-printed — parse, never substring-match) |
| game ↔ id mapping | `public/data/mlb/boards/<date>.json` (leans) | `gamePk` + `gameId` + `homeTeamAbbr`/`awayTeamAbbr` per game |
| team-market lines | `public/data/mlb/team-markets/<date>.json` (via `getMlbGameCenter`) | moneyline / total line / run-line — **current slate only** (2026-07-09) |
| pure settlement rules | `src/lib/mlb/product-settlement/mlb-markets.ts` | all 8 markets, cross-checked on 18k props |

**The one missing piece:** official FINAL team SCORES (home/away runs) — not committed anywhere.

## What StatsAPI supplies (free, no Odds credits)

`GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=<D>` returns, per game: `gamePk`,
`status.abstractGameState` (Final/Live/Preview), `status.codedGameState`, `teams.{home,away}.score`,
team names, `officialDate`. One call per date. Verified live: gamePk 823202 → Final, TOR 10 @ SF 0,
officialDate 2026-07-08.

- Fetcher: `scripts/fetch-mlb-linescores.mjs` → caches final-only games to
  `data/internal/mlb/linescores/<date>.json` (deterministic — final scores are stable; idempotent
  re-fetch verified). Parser `src/lib/mlb/product-settlement/statsapi-linescore.ts` is pure +
  fixture-tested. Volatile in-progress dates (e.g. July-9 tonight) are NOT committed.

## Settlement source per market

| market | canonical source | needs |
|---|---|---|
| `moneyline` | StatsAPI linescore | final score only |
| `total` | StatsAPI linescore + committed total line | final score + line |
| `run_line` | StatsAPI linescore + committed run line | final score + line |
| `team_totals` | StatsAPI linescore + team total line | final score + line (not ingested for MLB yet) |
| player props | committed `settled_leans` (statsapi box score, via the pipeline) | committed actuals |

## ID-mapping (join key: `gamePk`)

Team-market legs join to final scores by **`gamePk`** — the board's leans carry both `gamePk` and
`gameId`, and the linescore is keyed by `gamePk`. Team names/abbreviations in the linescore are cosmetic
(the join never relies on them). `getMlbGameCenter` is keyed by `gameId`, so the board's `gamePk↔gameId`
map bridges linescore → Game Center lines.

## Which markets grade end-to-end today

- **Moneyline** grades from official final scores on any committed final date — validated across 5
  dates, 0 pending on finals, 0 mismatches vs the official linescore (see the validation doc).
- **Total / run line** are wired (they appear as ledger legs) but grade only when BOTH the committed
  line AND the final score exist for the same date. Today the lines are committed for the current slate
  (2026-07-09, not yet final) and the final scores are committed for past dates (no lines) — so they
  grade via fixtures now and will grade live once the current slate finalizes and its linescore is
  fetched. Never fabricated.
- **team_totals**: rule exists; no MLB team-total lines ingested yet.

## Risks / honesty notes

- Board↔linescore game coverage can differ per date (a sparse board maps fewer games than StatsAPI
  lists); the ledger grades only games it can map, and reports counts honestly.
- Non-final games (`abstractGameState !== "Final"`, or cancelled `codedGameState === "C"`) stay
  `pending`; missing data is `unavailable`; neither is ever a loss.
- The ledger is internal (`data/internal/…`, not web-served), `officialMoneyRecordAffected:false`, and
  never touches `portfolio.json`.
