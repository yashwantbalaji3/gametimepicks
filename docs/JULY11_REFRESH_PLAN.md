# July-11 Refresh Plan (2026-07-11 morning)

## Keys (masked — never printed)
- `ODDS_API_KEY` — **present** (repo-root `.env`)
- `API_FOOTBALL_KEY` — **present** (repo-root `.env`)
- `BALLDONTLIE_API_KEY` — absent (NBA off-season — not needed)

## Refreshes run
`bash scripts/refresh_daily_products.sh --date 2026-07-11` — the one-command WC + MLB daily refresh.
Credit-guarded, **md5-guards `portfolio.json`** (cannot change official money), **never deploys**.

- **World Cup** — 2 quarterfinals for 07-11 (England @ Norway, Switzerland @ Argentina): projections, board,
  96 player props, World Cup Specials, expanded markets.
- **MLB** — 07-11 board + odds + projections (whatever games are scheduled).
- **UFC** — not part of this script; UFC odds are already same-day fresh (no refresh needed).

## Not run (paid / unapproved)
- Paid **historical** UFC odds backfill (validation) — explicitly out of scope; would need separate approval.
- Any NBA refresh (off-season, no key).

## Money safety
`portfolio.json` md5 recorded before the run (`affe6b21…`) and verified unchanged after. The refresh writes
only daily WC/MLB display artifacts + the daily portfolio DISPLAY lanes (not the official ledger). Official
record 19-14, exposure $0 — untouched.
