# MLB card polish + game jump — progress log

**Branch:** `feature/mlb-card-polish-game-jump`
**Base:** `main` @ `04fe441`
**Started:** 2026-05-16

## Scope of this PR
- Pipeline: emit structured `reasonBullets` on every MLB lean.
- UI: rewrite MLB lean row with NBA-style bullet reasoning, big LINE / PROJECTION / EDGE stat tiles, projection-vs-line gap bar full-width.
- UI: scan mode keeps the line/proj/edge trio inline so the numbers still pop while sweeping.
- UI: `/mlb` and `/mlb/power` game tiles now deep-link to `/mlb/board#game-{gamePk}` with a "View props" affordance; `mlb-game-section` exposes the stable anchor + scroll-margin.
- Parlay Lab: sport-mode stubs already shipped in PR #41 — unchanged here (no fake multi-sport candidates).
- Power Board: untouched beyond the tile-link parity.

## Out of scope
- MLB settlement (6 final games would be settle-able; deserves its own PR — `pipeline/mlb/settle_mlb_results.py` + `/results` MLB tab).
- Multi-sport Parlay Lab — still blocked on candidate snapshot persistence.

## MLB game finality audit (2026-05-16, free MLB-StatsAPI)
- 15 games on slate
- 6 **Final** (gamePks: 824278, 823060, 824359, 822737, 823382 + 1 more)
- 7 **In Progress**
- 2 **Pre-Game**

Settlement would be possible right now for the 6 final games via the free MLB-StatsAPI boxscore endpoint. Out of scope this PR.

## Credit conservation note (internal)
- **Credits remaining:** 368 (unchanged on this branch)
- **Paid Odds API calls this PR:** 0 — used the warm 24h disk cache
- **Worst-case cost** for a full May 16 refresh at current 3-market config: 45 credits (15 events × 3 markets × 1 region). All cached.

### How to regen the MLB board without spending
```bash
python3 -m pipeline.mlb.generate_mlb_board --date 2026-05-16 \
    --markets pitcher_strikeouts,batter_hits,batter_total_bases
```
The `is_event_cached` check in `pipeline/mlb/mlb_odds.py` makes
`fetch_event_odds` a 0-cost cache hit for the next ~24h after each
paid run. The orchestrator's pre-run gate also computes cache-adjusted
cost, so warm-cache reruns are not blocked by the 350-credit floor.

### Avoiding duplicate paid runs
- Default `--min-credits-remaining 350` — floor guard refuses any run that would drop below 350 remaining.
- Default `--max-credits-per-run 75` — cap per single invocation.
- Use `--dry-run` to probe events and cost without spending.
- Use `--markets` to scope to a subset when cost is tight.

### Recommended market fetch schedule (when not cached)
- Daily morning (e.g. 9 AM ET) — fetches before any tipoff so all 15 events have lines posted: 15 × 4 markets × 1 region = 60 credits at 4 markets, 45 at 3.
- Don't refresh in-game: books pull lines after first pitch, so events drop out of the listings; partial refresh wastes credits for events still posted while losing the rest.
- Once-daily morning fetch comfortably stays under the 500/month free tier (60 × 30 = 1800 worst case, but only ~20 game-days/month in practice).

### Public UI on credits
- Public copy stays silent on credit counts.
- "Educational analytics only" framing remains.
- Internal docs (this file + handoffs) carry the operational detail.

## Verified
- pipeline regen: 183 leans across 8 events with cached payloads (other 6 events past tipoff and dropped by books — honest reflection of live state)
- types-mlb.ts adds `MlbReasonBullet` + optional `reasonBullets` field
- mlb-lean-row.tsx renders bullets, big stat tiles, scan trio
- mlb-game-section.tsx exposes `id="game-{gamePk}"` + scroll-margin
- /mlb + /mlb/power tiles deep-link to that anchor with "View props →" affordance

(File intentionally untracked.)
