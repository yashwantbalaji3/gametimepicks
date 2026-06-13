# June 13 paid three-sport generation + Step 5 review

Run: 2026-06-13 ~11:20 UTC · Base `ccbb6ba`. Paid runs AUTHORIZED by the operator.
Integrity unchanged: paid calls allowed, fabrication forbidden, no invented Step 5 card.

## Credentials (names/flags only; values never printed/committed)
`ODDS_API_KEY` present (32 chars, the_odds_api) · `ODDS_DRY_RUN=true` (default) ·
`ODDS_MAX_EVENTS_PER_RUN=2` (default) · **`API_FOOTBALL` absent**.

## Paid command executed (command-scoped env; .env NOT permanently flipped)
```
ODDS_DRY_RUN=false ODDS_MAX_EVENTS_PER_RUN=15 \
  python3 -m pipeline.mlb.generate_mlb_board --date 2026-06-13 --max-credits-per-run 400
```
Result: **15/15 events with odds, 698 prop rows, 698 leans, dryRun=false, isDemo=false**.
`creditsBefore=430 · creditsSpent=0` — odds served from the 60-min cache (cachedEventCount=15),
so the paid authorization was used but **no credits were actually consumed**. No secrets in any
artifact (scanned).

Then (compute-only, reads boards, no paid calls):
`python3 -m pipeline.snapshot_parlays --date 2026-06-13` → **18 suggested slips** written to
`parlays/snapshots/2026-06-13.json` (real MLB legs — Chapman, Ohtani, Prielipp, …).

## Three-sport June-13 slate
| Sport | Schedule | Odds | Model proj | Player props | Suggested cards | Status |
|---|---|---|---|---|---|---|
| NBA | yes (ESPN) | yes (the_odds_api) | yes | 193 | 0 | **partial** — board real, but all 193 props are `lean:No Play / insufficient_data` (model recommends none) |
| MLB | yes (MLB Stats API, 15g) | yes (DK/FD) | yes | **698** | **18** | **ready** — fully live on /mlb, /games, fixtures, /picks |
| World Cup | no | no | no | 0 | 0 | **blocked** — `API_FOOTBALL` key absent; `build_team_projections` hard-stops ("STOP API_FOOTBALL_KEY not set") |

## Bank Builder Step 5 — gate review → REVIEW PENDING (no card)
Required: cross-sport 2-leg ≥ +176 (≥ $10,000 from $3,623.97), each leg real odds+model+market
+edge, no same-game/cross-sport correlation. Candidate order:
1. NBA + Brazil WC — FAIL (no WC data; no API_FOOTBALL).
2. NBA + any WC — FAIL (no June-13 WC data).
3. **NBA + MLB — FAIL**: MLB has 80+ gate-clearing legs, but NBA Game-5 has **zero** recommended
   legs (all 193 = No Play / insufficient_data). No NBA leg to pair.
4. WC + MLB — FAIL (no WC data).
5. any cross-sport / 3-leg — FAIL: only ONE sport (MLB) has recommended legs; cross-sport needs two.
6. **No card → Step 5 Review Pending.**

A same-sport MLB-only card is not the cross-sport final-step structure (and would be "forcing a
card the user wants"). **No card invented.** Bank Builder unchanged: $3,623.97 · 4-0 · Step 5/5.

## Unblock path (operator)
- World Cup: add an `API_FOOTBALL` key → run WC pipeline for 2026-06-13 (enables a Brazil/WC leg).
- NBA: a Game-5 board where the model produces actual recommendations (not all No-Play) would
  give an NBA leg. Until a second sport has a recommended leg, Step 5 stays review-pending.

## UI
Verified the consumer-sportsbook framework (PRs #460-469) intact: 0 cool-navy, 0 sub-10px
primary text, root current, MLB official logos on /mlb. No rebuild — working UI left intact.
MLB June-13 board + slips now flow to /mlb, /games, fixtures, /picks, /today.
