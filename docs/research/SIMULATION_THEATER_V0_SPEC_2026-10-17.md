# Simulation Theater v0: post-launch spec built only from saved outputs

**Status:** proposal for after launch, not built. It cross-references COMP-001 (R1, R2 and R4) and the master roadmap's LIVE-001 and RESULTS-001. It adds **no new pages, no per-visit computation and no invented data**: every element renders fields already present in committed artifacts, verified on `main` `8330f989d7`.

## What we actually have, by sport
| Sport | Saved artifact | Fields usable as-is | What is NOT saved |
|---|---|---|---|
| MLB | `app/public/data/mlb/full-game-simulations/<date>.json` (10k runs per game) | `winProbability`, `runs`, `teamTotals`, `totalRuns{mean, median, p10, p90, distribution[]}`, `runDifferential{…distribution[]}`, `runLine`, `finalScores[]` (scoreline → probability), `extraInningsProbability`, `players.batters[]` (per-player means: PA, H, TB, HR, R, RBI, BB, K), `gameStory` | individual sampled games, line scores, play-by-play. The engine generates them and discards them (COMP-001 R3) |
| NFL | `app/public/data/nfl/world-model-v2/<event>.json` (published copy, read by `lib/sports/nfl/world-model-v2/read.mjs`; internal runs live under `data/internal/nfl/world-model-v2/runs/`) | `sampledWorlds[5]` at margin quantiles 0.1…0.9: winner, OT flag, points, scoring breakdown (TDs, FGs, XPs, 2PT, safeties), volume (attempts, completions, yards, carries); percentiles; `limitations[]`, `unsupported[]` | drive or play order: the engine models scoring outcomes, not drives |
| EPL | `soccer/epl/forecasts/latest.json` | 1X2, goal and total distributions, `topScorelines` | sampled matches, goal minutes |
| UFC | `ufc/card-latest.json` | winner probability, method (DEC/KO/SUB), rounds | round-by-round |

## v0 components (client-rendered from existing JSON; no new static pages)
1. **Typical game card (R1).**
   - **NFL:** the 0.5-quantile `sampledWorld`, showing the score, scoring mix and volume. **MLB:** the top `finalScores` entry phrased as a frequency ("4–3 happens in 3.2% of 10,000 simulations").
   - **Required banner:** "Simulated · not a real game · 1 of 10,000"; for NFL, add the experimental label.
   - **Placement:** the existing game pages and `/simulate`. No new routes.
2. **Outcome range strip (R2).** The p10–p90 band, the median and the posted line (when one is captured) on the MLB total and run differential and on NFL team points. The bins already exist in the JSON, and the strip rule follows DS-001 §2.
3. **Five worlds strip (NFL).** The five saved worlds side by side, labelled by margin quantile. It never claims more worlds than are saved.
4. **Pregame ↔ final overlay (R4).**
   - On the game page, once the official final exists (the reconciled final behind the D-04 SETTLED rule), mark the actual result on the frozen pregame distribution and state its percentile: "landed at the 71st percentile of the pregame total".
   - It is descriptive, never a grade, and only from the canonical final.

## Data and cost budget
- **Payload:** use the existing artifacts. MLB per-game bins are already on the board and game pages; if a component needs more, fetch the same JSON client-side, lazily. Adds 0 HTML pages; at most ~5–10 KB of JSON per game view.
- **Compute:** none at request time and none added at build time.
- **Vercel cost:** no new build triggers. Every artifact above is already a build input, including the NFL WM2 published copy under `app/public/data/nfl/world-model-v2/`.

## Honesty rules (acceptance criteria)
- Every simulated element carries the "Simulated · not a real game" banner and the run count from the artifact.
- No element appears unless its field exists in the artifact for that game. A missing field is a stated absence, never a zero.
- The NFL experimental and validation status from `status` and `limitations[]` is shown beside any NFL world.
- The pregame overlay uses only the frozen, served pregame artifact; it is never regenerated.
- Mobile: 390 px with no overflow; strips readable at 320 px; ≥ 44 px targets.

## Out of scope for v0, and why
- **Playback or animation:** retired as ceremony in P242. It is honest only if every frame is a recorded engine event: MLB after R3 (save 5 real sampled games with line scores), NFL only after a drive engine (NFL-002).
- **Live re-simulation** (LIVE-003): needs new compute and a cost review.

## Implementation order (post-launch)
1. R2 range strip.
2. R1 typical game.
3. R4 overlay, which depends on D-04 SETTLED final rendering.
4. NFL five-worlds strip (data already public; experimental labelling required).
5. R3 saved MLB samples (engine change plus aggregate-hash invariance tests).
