# Program 171 — NFL end-to-end live activation

**Window** 2026-08-13 00:10 → 08:30 ET (04:10 → 12:30 UTC) · **Start anchor** `078d7e686` ·
**Final HEAD** `95912fbef` = origin/main · **Production** `76d72aa3` (Vercel, one commit behind
by timing; the covering gate for `95912fbef` was still running at report time) ·
**Worktree** clean, single checkout, no stray worktrees · **Owned background tasks at close** 0

The public outcome: **NFL's first product layer is live** — `/nfl` now publishes the authorized
sportsbook market for the current slate (9 preseason games, 11 books each, de-vigged consensus,
absolute capture stamp) as market facts with attribution. Every model layer remains correctly
private, and each unavailable layer states its own reason.

## Release register

| Release | Commit | Outcome | Tests | Production proof | Credits |
|---|---|---|---|---|---|
| Phase 0 | — | baseline verified | 4,153 / 0 fail | — | 0 |
| A · role shares | `40702d08e` | SHIPPED | +11 | private research | 0 |
| B · prop heads | `89bc197d4` | SHIPPED | +11 | private research | 0 |
| C · TD + Vault | `030a19bf3` | SHIPPED | +9 | private research | 0 |
| D · odds acquisition | `f323c80dc`, `27b94311e`, `14f43c959` | SHIPPED | +6 | 4 CI captures | 12 |
| E · shadow simulations | `706caad4e` | SHIPPED | +5 | 6 committed artifacts | 0 |
| F · public activation | `03321d7b9`, `e3c8dcd8a`, `5b49337a8` | SHIPPED | +9 | **live on /nfl** | 0 |
| G · automation + admin | `19d7de712` | SHIPPED | +6 | CI run 31699036622 green | 0 |
| H · settlement | `76d72aa36` | PROVEN + WATCH ARMED | +6 | watch armed | 0 |
| I · assurance | `95912fbef` | SHIPPED | +8 | — | 0 |

Rollback boundary: every release is one commit; reverting any one leaves the others coherent
because each writes its own artifact class and no release mutates a predecessor's output.

## Credit report

| Item | Value |
|---|---|
| Founder ceiling | 3,000 cumulative (Program 171), no balance floor |
| Screenshot context | 4,171 used / 15,829 remaining (founder-supplied, treated as context) |
| **Provider-verified opening** | **4,342 used / 15,658 remaining** (response headers, first free call) |
| Paid requests | 4 bulk calls × 3 credits |
| Free requests | 10 (sports index + events per key), 0 credits, all recorded |
| **Cumulative spend** | **12 of 3,000** |
| Closing provider balance | 15,616 remaining |
| Secret leakage | none — endpoints redacted, artifacts leak-scanned before write, key fingerprint only |

The screenshot was 171 credits optimistic; the machine truth from the headers is what the ledger
records. The first bulk call (3 credits) joined **zero** usable events — the provider serves NFL
under two sport keys and August is preseason. That call is recorded at full cost rather than
hidden, and it is what proved the key split.

## NFL layer table

| Layer | State | Evidence |
|---|---|---|
| Schedule / identities | LIVE | daily capture, 21 events; registry 2,991 players |
| Results | LIVE | id-joined; the lineage-less CAR@ARI final stays quarantined |
| Team simulation | PRIVATE_ONLY | preseason variant is RESEARCH_ONLY (test logLoss 0.6995 vs coin 0.6931) |
| Role shares | EVALUATED | held-out 2025 TV 0.4637 beats all four baselines |
| Passing | RESEARCH_ONLY | beats every baseline on MAE, but interval coverage 0.569 — honest under-coverage |
| Rushing | PUBLIC_ELIGIBLE (by policy) | MAE 15.4 vs 21.2 rolling-4; coverage 0.741; ECE 0.030 |
| Receiving | SHADOW_ELIGIBLE | yards + receptions beat all baselines; coverage 0.82 / 0.86 |
| Scoring bridge | CALIBRATED | P170-B, consumed unchanged |
| Anytime TD | CALIBRATED, not publishable | LL 0.5492 vs const-λ 0.5525; ECE 0.0148; n=3,570 |
| Market prices | **LIVE (public)** | 9 events × 11 books, pre-kickoff, attributed |
| Shadow artifacts | 6 committed | contract-valid, append-only, settlement targets pinned |
| Automation | DEPLOYED, cadence UNPROVEN | one workflow, 3 crons; a file is not a receipt |
| Settlement | PROVEN + ARMED | exactly-once verified behaviorally; watch trigger exact |
| End Zone Vault | NO_PLAY | participation + market gates unmet; correction lineage appended |

## GO / NO-GO per market family

| Family | Decision | Exact next evidence required |
|---|---|---|
| Market prices (ML/spread/total) | **GO — live** | — |
| Team score / win probability | NO-GO | a REGULAR-season event: the model abstains in preseason by its own card |
| Passing yards | NO-GO | interval coverage into [0.72, 0.88] — model QB in-game exits, then re-evaluate |
| Rushing yards | NO-GO (model ready, window wrong) | regular-season participation + an offered market; the head already meets policy |
| Receiving yards / receptions | NO-GO | same, plus coverage tightening into band |
| Anytime touchdown | NO-GO | the provider must offer the market (probed: absent) + participation evidence |
| End Zone Vault | NO-GO | every gate above, plus a fresh scorer price |

Three of these are blocked by **reality, not engineering**: preseason has no participation
evidence and the provider offers no NFL player markets this window.

## Defects the program's own guards caught

1. **Key gate refused a valid key** — the capture checked for state `"OK"`; the contract's healthy
   state is `PRESENT`. Failed closed in CI (zero calls, zero spend), then pinned by a guard.
2. **Wrong sport key for the window** — `americanfootball_nfl` returned 272 events and joined 0.
   Cost 3 credits, produced the season-aware key plan.
3. **Empty player registry** — `buildPlayerRegistry` takes the whole roster artifact; I passed
   per-team objects, so participation counts came back `{}`. Fixed in both call sites.
4. **Blockquote-split receipt term** — the parser missed "do not retry / blindly" across quoted
   lines and refused a valid authorization. Fail-closed worked; normalization fixed it.
5. **`teamAbbr` matching neither side** silently read the away score — now REFUSES (P171-C).
6. **Ancient stash hazard** (memory-documented) — a short-circuited `&&` let a bare `stash pop`
   partially apply a months-old stash onto 4 MLB files. Caught immediately, restored byte-exact
   to HEAD, both stashes left intact. Never use bare `git stash pop` here.

No guard was weakened to make anything pass. Three guards were *extended* (sport-gate,
completion-matrix, route-inventory) to record new evidence, each keeping its original invariant.

## Known-failing, pre-existing

Two Playwright redirect tests (`/parlay-lab/`, `/sports/`) fail at `078d7e686` too — verified in
an isolated worktree build. Out of Program 171 scope; spawned as its own task.

## Next ten tasks, dependency-ordered

1. **Observe the settlement watch** (fires 2026-08-14 ~14:30Z automatically; trigger and
   acceptance in `data/internal/nfl/settlement/WATCH.json`).
2. Confirm the first `nfl-event-window` scheduled run lands a terminal receipt → promotes cadence.
3. Set `OPS_WEBHOOK_URL` (founder) so NFL failures leave the Actions tab.
4. Re-probe player markets at regular-season open — the NO_MARKET finding is window-scoped.
5. Model QB in-game exits, then re-evaluate passing interval coverage.
6. First regular-season event: the team model stops abstaining; run the shadow ladder to
   `CURRENT_PRE_EVENT` with a fresh odds capture.
7. Participation source for game-day actives — `ACTIVE_CONFIRMED` is currently unreachable.
8. Snap-scenario ingestion so preseason players can leave `ROLE_UNCERTAIN` honestly.
9. Per-team injury split in `event-assembly.mjs` (still artifact-wide; needs `providerTeamId`).
10. Fix the two pre-existing redirect failures.

## Protected state — unchanged

Record 19–14 · bankroll $19,065.40 · crown $20,465.40 · open exposure $0 ·
`portfolio.json` md5 `affe6b21071f2b3be96bb2774eb347c3`, asserted by the assurance sweep and
~10 pre-existing guards. `vp/` and `test-results/` were never staged. The NFL settler is
structurally incapable of naming any money artifact.
