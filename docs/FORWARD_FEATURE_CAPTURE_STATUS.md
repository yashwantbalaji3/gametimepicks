# Forward Feature Capture Status (2026-07-31 close)

| Family | State | First artifact | Blocker |
|---|---|---|---|
| pitcher_workload_rest | **LIVE** | `data/internal/research/pitcher-workload/2026-08-01.json` (30 slots, 29 OK, 100% pregame-eligible) | none — wire into pregame-capture's first daily run for automation |
| market_movement | READY (patch stream shipped) | first append-only patch day | none — forward-only rollout gate |
| confirmed_lineup | AVAILABLE (existing pregame-archive capture, provable pregame timestamps, free official source) | already accumulating since 2026-07-21 | none — NOT vendor/rights blocked |

No production model consumes any family; preregistration protocol should cite these three
families with forward start 2026-08-01. See `FORWARD_RESEARCH_CORPUS_V1.md`.
