# MLB-005 · next research milestone: `mlb-coherent-worlds-v4` (plan, 2026-10-10; nothing registered or computed yet)

**Status:** plan only. Before any v4 number is computed, each mechanism below gets its own **preregistration**, made before it touches any evaluation outcome.

**Exposure, disclosed up front:** 2024 has been looked at four times by now, 2025 once (the spent retrospective) and 2026 repeatedly. Any v4 result on those seasons is **development evidence only**. Independent evidence comes only from the **live pregame capture** (Option A), with receipts verified before first pitch. The failed home-field v3 and every other negative result stay on record.

## Known limitations, and the mechanism for each

| Limitation (measured) | Mechanism for v4 | Data needed | Status |
|---|---|---|---|
| Simulated PA per starting batter 4.16 against 4.01 actual; team PA high | Double plays (a ground-ball DP on outs with a runner on first and < 2 outs) and caught stealing / pickoffs, at **walk-forward league rates** | GIDP, caught stealing and pickoffs per team-game from box scores: **not in the current capture fields** | Needs the extra-field capture (founder decision) |
| Totals about 0.25 runs low | Reach-on-error and wild pitch / passed ball rates (engine switches exist, at 0 in the published parameters), set to walk-forward league rates | Team errors and pitcher WP / PB per game: **not in current fields** | Same decision |
| No home-field term (P(home) 0.500 against 0.527); v3's per-PA multipliers did not pass | A **game-level** home effect fitted on earlier games' run differential and applied as a per-PA log-odds shift for both offense and run prevention, plus the park run factor (captured pregame for 2026; static per venue) | Park factors exist pregame for 2026. For 2024–2025, venue mapping only, and no park factors without leakage | Registrable for live capture; development on 2026 only |
| Bullpen as one aggregate | Bullpen by **availability**: relievers' pitches over the last 1–3 days (`bullpen` pregame capture, 99% coverage) shifting the pen's rates | Pregame `bullpen` capture (2026, live) | Registrable for live |
| Batter accounting (starter-only lines vs slot) | Already checked by invariants. Add **pinch-runner** runs to the slot (needs 0-PA lines in the capture) | Capture limitation; extra fields | Same decision |
| Posted-line accuracy (worse than the market everywhere) | Use the market's own information is **not** allowed as an input; the gap is to be closed by the mechanisms above, and measured only on live receipts | Live receipts with lines | Option A |

## Order of work

1. Founder decision on the extra box-score fields (GIDP, CS, SB, errors, WP/PB, and 0-PA lines); about 7,400 free requests.
2. Preregister v4a (advancement: DP / ROE / WP at walk-forward league rates). Development read on 2026 only, labelled exposed.
3. Preregister v4b (game-level home field + park) and v4c (bullpen availability). These are live-capture-only evaluations.
4. When registered, add each version as a new model in the live capture (a new code fingerprint, never a change to an existing receipt).

## Acceptance for the milestone

- Invariants: 0 violations.
- Mean PA within ±0.05 of actual on the development season.
- Mean total within ±0.10 runs.
- P(home) bias within ±0.01.
- **No qualification claim.** That requires the live receipts and the registered gates.
