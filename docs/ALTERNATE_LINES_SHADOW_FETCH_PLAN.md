# Alternate Lines — Shadow Fetch Plan (paid; requires approval)

> Plan only. **No fetch has been performed. No credits spent.** Fetching
> alternate markets requires the **paid Odds API** and therefore an explicit
> operator STOP-and-ask approval before any run. This documents exactly what the
> spike would do so the decision is informed.

## 1. Why a paid fetch is required
`pipeline/config.py` requests only standard player-prop markets (NBA
`player_points/rebounds/assists`; MLB `batter_hits`, `batter_hits_runs_rbis`,
`batter_total_bases`, `pitcher_strikeouts`). The Odds API exposes **alternate**
variants (e.g. `batter_hits_alternate`, `batter_total_bases_alternate`,
`batter_rbis_alternate`, `pitcher_strikeouts_alternate`,
`batter_home_runs_alternate`; NBA `player_points_alternate`, etc.). These are a
**separate market request per event** → each added alternate market multiplies
per-event credit cost (markets × regions × events).

## 2. Credit-cost estimate (from config)
- Cost model in `config.py`: ~`events × markets × regions` credits per run.
- MLB June-4 = 9 games. Adding, say, 4 MLB alternate markets at 1 region ≈
  **9 × 4 × 1 = ~36 credits** for one shadow pull (on top of the standard run).
- Guardrails already exist on the workflow: `max_per_run` (default 75) +
  `min_remaining` (default 300). A spike stays within them, but it is **not free**.

## 3. Recommended spike (smallest informative)
- **Scope:** MLB `batter_hits_alternate` + `batter_total_bases_alternate` for the
  current slate only (the two highest-volume markets; best first per the readiness
  doc). One region (`us`), existing bookmakers (`draftkings`, `fanduel`).
- **Mode:** shadow-only — write to a NON-public path
  (e.g. `pipeline/cache/alt_lines/<date>.json`), NOT `app/public/data`.
- **No optimizer/UI consumption.** Validation reads it via audits only.

## 4. Exact steps (only after approval)
1. Add an `ODDS_ALT_MARKETS` list (default empty) + a `--alt` flag to the odds
   fetch path; default OFF so the normal cron is unchanged.
2. Run the fetch for the current date with the alt markets, writing to the shadow
   cache path. (Paid — approval required.)
3. Normalize to `AlternateLineRecord[]` (helper schema), de-vig with
   `deVigAlternateLine`, validate with `validateAlternateLineRecord`, classify
   with `classifyAlternateLineCompleteness`.
4. After the slate settles, grade each rung off `actual` (see
   `alternate-lines-grading-plan-latest.md`) — no extra API.
5. Feed settled rungs into the hardened candidate search as new segments.
6. Build an internal ladder simulation (no public write).
7. Public neutral-ladder UI ONLY after a corrected launch candidate + approval.

## 5. Risks / stop conditions
- **Credits:** real, non-zero (≈36/run for the recommended scope). STOP-and-ask
  before each run; no repeated dispatches without re-approval.
- **Overwrite risk:** never write alt data into `app/public/data`; shadow cache
  only, so production June-4 outputs are untouched.
- **Provider availability:** if the provider returns no alternate markets for the
  slate, log the gap; do not fabricate rungs.
- **NBA:** only fetch NBA alternates on NBA game days (June 4 is an off-day).

## 6. What is already built (no network, no cost)
- `app/src/lib/alternate-lines.ts` (+ tests): de-vig, validate, completeness,
  group-by-player-market. Ready to normalize/validate a future fetch.
- `alternate-lines-readiness-latest.md` (provider keys, schema, UI rules).
- `alternate-lines-grading-plan-latest.md` (grading off existing `actual`).

**Decision required before any fetch: approve the paid alternate-market spike?**
Until then, alternate lines stay blocked and unpriced.
