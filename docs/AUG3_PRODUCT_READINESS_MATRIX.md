# Aug 3 Product Readiness Matrix (Program 112-115 Stage 1)

Mechanical, artifact-by-artifact. Readiness is **not** inferred from the board existing.

## Artifact chain (all dated 2026-08-03)

| Artifact | Present | Count | Reconciliation |
|---|---|---|---|
| `mlb/schedule` | ✅ | 8 games | canonical MLB StatsAPI slate |
| `mlb/boards` (base, frozen) | ✅ | **211 rows / 7 covered games** | sha256 `d2e81ca3…`, 211→211 identities |
| `mlb/team-markets` | ✅ | 7 games | == 7 covered games ✔ |
| `mlb/player-props` | ✅ | 183 rows / **3 games** | **explained**: this is the credit-bounded provider prop capture (`ODDS_MAX_EVENTS_PER_RUN`), a separate artifact from the board's own odds fetch. Not a gap in the prediction population |
| `mlb/game-simulations` | ✅ | 7 games | == 7 covered games ✔ |
| `mlb/full-game-simulations` | ✅ | **8 games** | all scheduled games; the uncovered one carries `status: unavailable`, 0 picks — correct, since full-game sims need team-market upstream, not player props |
| `mlb/predictions` | ✅ | 8 entries | ✔ |
| `mlb/power`, `parlays/optimizer` | ✅ | Aug 3 | ✔ |
| `research/{terminal-summary,system-status,daily-brief}` | ✅ | settled-through Jul 31 | correct — research context is settled truth |

**No unexplained gap.** The one apparent discrepancy (props 3 games vs board 7) is a known,
deliberate credit control on a *different* artifact, not a missing prediction.

## Public surfaces (verified in a real browser, production)

| Surface | Expected | Actual |
|---|---|---|
| `/today/` | Aug 3 slate, all 8 games | ✅ "Today · Aug 3 · Pregame slate"; **8 unique game links incl. `lad-vs-chc`** |
| `/markets/` | Aug 3 markets + sims | ✅ "GAME MARKETS (7) · PLAYER PROPS (316)"; snapshot labelled "Aug 3 at 12:35 AM ET"; the market-less game correctly absent from a *markets* list |
| Game reports (covered) | render with sims | ✅ e.g. WSH @ PHI, SF @ TEX |
| Game report (uncovered) | explicit unavailable | ✅ "Simulation not yet available… No precomputed model simulation artifact exists" — **but see the defect below** |
| `/results/` | latest settled | ✅ Jul 31, never forced to Aug 3 |
| Model-vs-market caution | visible | ✅ "RECALIBRATE — does not out-score the sportsbook here"; "Simulation ran with incomplete inputs — treat the model side with extra caution" |
| Paper framing | visible | ✅ "Paper-only · educational", 19–14 · $19,065.40 |

## Defect found and fixed in Stage 1

**The "Simulation Ready" badge was hardcoded** in the game-detail hero — every game page claimed
it. On LAD @ CHC the same page rendered *"▶ SIMULATION READY"* directly above *"GENERATED PICKS
0"* and *"No precomputed model simulation artifact exists for this fixture yet."*

That is partial-presented-as-complete: presence of a fixture is not readiness of a simulation
(the same class as "file exists ≠ settled"). The badge is now derived from the artifact's own
`status` and pick count, with an explicit **"Awaiting Simulation"** branch, and pinned by 4
assertions so it cannot drift back to an unconditional claim.

**Verified LIVE on production (HTTP 200, no challenge) after deployment `3b058fff`:**

| Live page | Badge |
|---|---|
| `/games/mlb/lad-vs-chc-2026-08-03/` (no markets) | **Awaiting Simulation** |
| `/games/mlb/wsh-vs-phi-2026-08-03/` (covered) | **Simulation Ready** |

The page no longer contradicts itself.

**Deployment note (correct-by-design, not a defect):** the docs-only tail commit `37c9c3d5` also
built. Its ignored-build check spans from the last *completed* deployment, which at queue time
was still `7749a1ae` — a span containing real `app/` changes. The script is deliberately built to
fail toward building so a docs commit can never strand an app change; a redundant build is the
intended cost of that guarantee.

## Verdict inputs

- All active current-day surfaces: **Aug 3** ✔
- Simulation/prediction chain: **no unexplained gap** ✔
- Deployment: canonical, current ✔
- Protected/public boundary: intact ✔
- One game (LAD @ CHC) has **no posted markets** — books never posted, handled truthfully at
  every surface after the badge fix.

→ **AUG_3_PARTIAL_BUT_CURRENT** (see the founder report for the full statement).
