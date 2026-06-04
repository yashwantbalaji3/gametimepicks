# v2 June-4 Simulation — INTERNAL ONLY (auto-generated)

> `app/scripts/audit-v2-watchlist.mjs --write-report` · READ-ONLY · deterministic.
> Simulates what the watchlist gate **would** surface on the active slate.
> **Nothing is applied:** no write to `app/public/data`, no optimizer/projection/
> UI change. v2 is not live.

## Active slate: 2026-06-04

### What the watchlist gate would flag
- **19** MLB legs match the Low-gate watchlist condition (L5 5/5 & odds ≤ −150).
- By market: batter_hits=14, batter_hits_runs_rbis=4, batter_total_bases=1.
- Across 8 game(s).
- **1** of these are already in the current published Suggested Parlays; 18 are not.

### Hypothetical change if the gate were live (NOT applied)
- The Low gate is **`shadow_watchlist`**, not a launch candidate, so **no live
  re-ranking, additions, or removals are made.** Official Suggested Parlays for
  June 4 continue to use the **current-live** model.
- If (hypothetically) the Low section were restricted to watchlist legs, it would
  draw from the legs above — but that is exactly the unconfirmed edge the hardened
  gates reject, so it is not done.

### Why no live change
- The watchlist segment fails the corrected CI + adjusted p + single-date checks
  on the settled sample (7 slates). It needs **more settled MLB slates** before
  the corrected lower bound clears de-vig without single-date reliance.

### NBA note
- June 4 is an **NBA off-day** (ESPN: 0 NBA events; games fall on Jun 3 & Jun 5).
  NBA absence does not affect this MLB-only simulation and is not a data failure.

**Internal only. No public effect.**
