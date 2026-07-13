# FreeSim-Level Gap Analysis — blunt (2026-07-13)

Benchmark = a mature simulation product (deep per-sport sims, broad markets, player props, clean nav, mobile-
first, fast path to simulate). Not a scrape — the founder's product standard. Money untouched.

## What GameTime Picks already does well
- Honest freshness (real-ET liveness, no stale-as-live), money integrity (forensic-locked 19-14), route hygiene
  (internal routes 404, aliases fixed, no `-internal-` leak).
- Real market-implied reads for World Cup (1X2/DC/DNB/total/BTTS) + MLB (ML/RL/total) + a real 10k MLB
  player-prop sim where artifacts exist. Per-game answer-first reports exist.
- Two genuine flagship products with a real settled track record (Bank Builder $100→$19,065.40).

## What feels tangled (see structure audit)
- No pillar layer; 3 front doors (`/`/`/today`/`/simulate`); 2-3 "pick" hubs; sport pages don't read as
  simulation centers; `/projections` + `/sports` orphaned/off-season.

## Where the simulation experience is SHALLOW (the real gap vs FreeSim)
| area | gap | class |
|---|---|---|
| **Soccer depth** | market-IMPLIED only — no independent goal model, no score distribution, no player props | validation + provider |
| **MLB full-game** | market-implied, NOT an independent score sim; no run-distribution/win-prob curve | validation |
| **Player props breadth** | MLB has K/hits/TB (10k) ONLY; soccer/UFC have none | provider + model |
| **Market breadth** | missing: soccer scorer/shots/corners/cards/correct-score; MLB team-totals/F5/alt-lines; UFC method/round/distance | **provider feeds** |
| **Bracket/context** | WC bracket context thin; no "path to final" | UI |
| **Nav clarity** | no simulation-first pillar structure | UI (easy win) |

## Gap classification (blunt)
- **Data-source gaps (need a paid provider feed):** soccer player props / set pieces (corners, cards, shots,
  scorer); UFC method/round/distance odds; MLB F5 + alt lines. **Cannot be built without ingesting a feed — and
  must never be faked.** These are the bulk of "missing markets FreeSim has."
- **Settlement gaps:** MLB team totals (no settlement source yet); soccer AH (push/half-win). Predictable but
  not gradable → excluded from products until settlement proven.
- **Validation gaps:** independent soccer sim; independent MLB full-game sim; UFC model. Today these are
  market-implied/experimental — honest, but not "deep sim." Need backtested models before claiming more.
- **UI gaps (easy wins, no data needed):** pillar nav, simulation-first homepage, per-sport "Simulation Center"
  framing, the **coverage matrix** (shipped this pass), unsupported-market notices, `/projections` cleanup.

## Priorities
- **P0 — launch clarity (UI, days):** pillar nav, sim-first homepage, `/simulate` hub + coverage matrix (started),
  per-sport "Simulation Center" labels, demote `/build`/`/projections`, link `/sports`.
- **P1 — simulation depth parity (UI + light modeling, 1-2 wk):** WC bracket/path context, MLB run/win
  distributions surfaced, model-vs-market panels, methodology badges everywhere.
- **P2 — market expansion (PAID provider work, weeks):** soccer player props + set pieces; UFC method/round;
  MLB F5/alt lines/team-total settlement. Each is a feed + settlement + tests.
- **P3 — validated modeling (ongoing):** independent soccer + MLB full-game sims, backtests, calibration curves,
  automated settlement, sample-size disclaimers.

## The honest verdict for the founder
The product is **organized enough to succeed as a launch, but not yet "FreeSim-level deep."** The gap to FreeSim
is **~70% paid data-provider + validation work** (player props, set pieces, method/round odds, independent sims)
and **~30% UI/IA** (pillars, per-sport centers, coverage transparency). The UI 30% is cheap and starts now (this
pass); the data 70% is a budgeted provider roadmap — and until those feeds exist, the right move is exactly what
the new coverage matrix does: **show the gap honestly** rather than fake it. See
`SIMULATION_FIRST_PRODUCT_ROADMAP.md`.
