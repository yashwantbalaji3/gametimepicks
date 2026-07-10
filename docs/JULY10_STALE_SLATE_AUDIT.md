# July 10 Stale-Slate Audit + Fix (2026-07-10)

**Fixed.** On the morning of July 10 the public site was still spotlighting July 9 everywhere. The
July-10 slate has been generated + committed, so the site is now July-10-current. Official money md5
`affe6b21…` unchanged (the refresh md5-guards `portfolio.json`), 19-14, official exposure $0.

---

## What was stale (before)

| surface | showed | source |
|---|---|---|
| `/simulate`, `/games` | July-9 games | newest MLB board = `boards/2026-07-09.json` |
| `/picks` top-10 | "Model Top 10 picks · 2026-07-09" | newest board / `currentSlateDate()` |
| top rail | "Latest slate · Jul 9" | `freshness-display.ts` on the July-9 slate date |
| `/today` | July-9 hub | newest board |

Root cause: every slate-derived page reads the **newest committed board date** (`currentSlateDate()`), and
that was `2026-07-09` because the July-10 slate had been generated-then-held-back last mission.

## What was generated (July 10)

Ran the money-guarded `refresh_daily_products.sh --date 2026-07-10` (paid Odds, credit-guarded) +
`generate-mlb-game-simulations.mjs --date 2026-07-10` + the candidate pool:

- `public/data/mlb/boards/2026-07-10.json` — 15 upcoming games (all Preview at 10 AM ET).
- `public/data/mlb/{props,team-markets,schedule}/2026-07-10.json`.
- `public/data/mlb/game-simulations/2026-07-10.json` — 13 games, 98 picks, 10,000-run (deterministic).
- `public/data/world-cup/*` July-10 (projections/board/props/specials/parlays).
- `daily-portfolio.json` + `master-ledger.json` regenerated (display lanes; **official money md5
  unchanged**).

## Date-honesty

The top-rail badge is client-clock-aware (`freshness-display.ts` re-derives with the real browser ET
clock post-hydration): with the slate now July-10 and today July-10, it reads **"Live today"** — never a
false "today" on a stale slate. `/simulate` is dominated by July-10 games; the few remaining July-09
tokens are incidental game-detail links, not the featured spotlight (the lobby derives from the newest
slate date).

## Money / guardrails

`portfolio.json` md5 verified `affe6b21…` before + after the refresh (the script fails closed if it
moves). Official exposure stays $0; the `$150` figure is the **paper display** exposure of the daily
lanes (Bank Builder $100 + Moonshot $50), which is the normal daily-portfolio behavior — not real money.
The `today-hub` invariant test was updated from "today is no-play / $0" (a July-9-specific assumption) to
a slate-agnostic consistency check (active lane ⟺ display exposure present). No formula, pick, or official
record changed; internal artifacts remain 404.

## Residual / next

MLB player-prop + team-market settlement for July-10 happens tonight once games are final (pending until
then — never scored early). Picks Lab top-picks rebuild, `/build` alias, and the homepage single-CTA are
deferred (see the mission report).
