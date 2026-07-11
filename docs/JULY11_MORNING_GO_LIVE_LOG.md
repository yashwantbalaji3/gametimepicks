# July-11 Morning Go-Live Log

- **Start:** Saturday 2026-07-11 (founder ~5:46 AM ET) · **Starting HEAD:** `af72743c` → fast-forwarded to
  `c1fcfea6` (nightly settle drift, money-clean) → this go-live.
- **Money md5:** `affe6b21071f2b3be96bb2774eb347c3` — **unchanged throughout** (verified before + after the
  refresh; the refresh self-verified "✓ canonical money untouched"). Record 19-14 · bankroll $19,065.40 ·
  crown $20,465.40 · exposure $0.

## Origin drift
Nightly settle bot pushed 2 commits (03:23, 05:07 ET) → `c1fcfea6`. Portfolio md5 unchanged (`affe6b21`);
diff = settlement/grading artifacts only. **Fast-forwarded** (linear).

## Keys (masked)
`.env` at repo root: `ODDS_API_KEY`=present, `API_FOOTBALL_KEY`=present, `BALLDONTLIE_API_KEY`=absent (NBA
off-season). Founder awake → refresh authorized.

## Refresh run
`bash scripts/refresh_daily_products.sh --date 2026-07-11` → exit 0, then
`generate-mlb-game-simulations.mjs --date 2026-07-11 --write` (free/deterministic, needed after slate
advance). Both money-safe (md5-guarded / no money touch).

### Results
- **World Cup 07-11:** 2 quarterfinals — **England @ Norway, Switzerland @ Argentina** — projections, board,
  96 player props (87 matched), 2 World Cup Specials, expanded markets.
- **MLB 07-11:** 15-game board + odds + props + team markets; **game-simulations artifact** 15 games / 114
  picks / 10,000 runs.
- **Daily portfolio:** 1 active lane. **Bank Builder = no-play** for 07-11 (proposal generated, awaiting a
  founder-approved card — the documented `bank-builder-approved.json` → promote flow). **Moonshot** = $25
  paper lane. Official bankroll + crown unchanged; official exposure $0.
- **UFC:** unchanged (already fresh) — 12/14 model reads, market-implied moneylines.

## Verification
- `portfolio.json` **byte-identical** before/after · money md5 `affe6b21…` · forensic **✓ MATHEMATICALLY
  PERFECT** · health **✓ HEALTHY** (1 freshness warning, deploy may proceed).
- Full suite **2118/0** (fixed 1 over-strict test: a BB proposal without an active lane is the honest
  awaiting-approval state, not an inconsistency; +6 fixed by generating the MLB sim artifact).
- Build exit 0 · **July-11 live on Home + Today** · WC QFs on the games board · `data/internal` absent from
  `out/` · no forbidden claims · no external images.

## Not done (founder)
- **Bank Builder July-11 card not promoted** — needs the founder to author `bank-builder-approved.json` for a
  specific card (the flow does not infer the card). Currently honest no-play.
- **Deploy** — refresh does not deploy; a Vercel rebuild/deploy is a separate founder step (the pushed
  artifacts will deploy on the next build).
