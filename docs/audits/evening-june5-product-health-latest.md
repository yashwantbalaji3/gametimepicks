# Evening June 5 Product Health (2026-06-05 ~5:30pm ET)

> Snapshot after the surgical Low-Risk reclass (#283) merged & live. No paid API
> this pass. main = `6eacbd1`.

## Slate state
- Active slate **June 5**; latest settled **June 4**; June 5 graded **absent**.
- June 5 optimizer + MLB board + NBA board + snapshot all present.
- #278/#279/#280/#281/#282/#283 all on main. Mixed tab + Results two-record UX live.

## June 5 counts (post-reclass, live)
- MLB board: 15 games, 687 leans (1 game in-progress: 18:21Z; **preserved**).
- NBA board: 1 game (Finals, tipoff 8:30pm ET, **Scheduled/not started**), 89 leans.
- Optimizer: totalSlips 120, legPool 533 (MLB 448 + NBA 85) — **unchanged by reclass**.
- publicRiskSections (nba/mlb/multi): low 0/6/0 · medium 0/6/6 · high 0/6/6 · longshot 0/6/6.
- Displayed (UI): MLB 7 · NBA 0 (honest empty) · Mixed 5 · All 12.

## Bad Low-Risk legs still visible? 
**No (fixed).** `audit-low-risk-methodology --date 2026-06-05` = **PASS** (12 Low legs, 0 violations). Pre-reclass had 20 violations (8 NBA stale-form incl. Keldon, MLB 70%/50% L10, +127 plus-money). All gone.

## Stale NBA form status
NBA recentGames are stale regular-season (latest 2026-04-10) because the board was generated before the #282 provider fix. The reclass **fail-closes** stale NBA form out of Low Risk. NBA legs still appear in Mixed Medium/High (higher-variance) and their modal still shows stale games — a board-data issue resolved on the next fresh slate (#282 provider fix). NBA-only published = 0 (honest).

## Full-regeneration safety
Still **UNSAFE** today: 1 MLB game in-progress; `generate_mlb_board` is a full overwrite that would drop it. The surgical reclass (#283) was the safe path and is done. Do not run `morning-projections` for June 5.

## V2
`v2_not_ready`, 0 corrected launch candidates (unchanged). Internal only.

*Read-only snapshot. No data/model/grading change beyond the merged #283 reclass.*
