# June 24 Product Status Inventory

| Product | State | Detail |
|---|---|---|
| MLB Featured Plays | ✅ **LIVE** | derives from June 24 board (12 games, 243 props) |
| MLB Homer Nukes | ✅ **LIVE** | June 24, 5 legs (+49828, $9,985 return), real headshots+opponents |
| MLB Player Props | ✅ **LIVE** | 243-row board, filters, photos |
| MLB Pitcher Props | ✅ **LIVE** | derives from board |
| MLB Game Explorer | ✅ **LIVE** | 12 games, collapsible |
| Bank Builder | ⛔ **BLOCKED** | orchestrator returns NO_QUALIFIED_LAUNCH for June 24 — 0 eligible legs; needs methodology projection run (not the raw Odds ingest). Last live: ladder Jun 13 / dual-lanes Jun 15. **System is honest, not broken.** |
| Mr Dub Daily Portfolio | ⚠️ **STALE** | June 23 (settled); June 24 needs BB/Moonshot regen (blocked, above) |
| Moonshot | ⚠️ **STALE/STOPPED** | June 19, status `stopped`; needs projection run |
| WC Specials | ⚠️ **STALE** | June 23 (settled to history); June 24 needs WC projection+odds pipeline |
| WC Parlays | ⚠️ **STALE** | June 23; needs WC pipeline |
| Results / History | ✅ **LIVE** | product ledgers (bank-builder/moonshot/wc-specials) + WC specials history populated (PR #584) |
| Product Ledgers | ✅ **OPERATIONAL** | registry + performance engine + persisted ledgers |
| Settlement Pipelines | ✅ **OPERATIONAL** | unified soccer engine + official fetch + seed-model BB settle |

## Headline
The **MLB flagship is fully live for June 24**. The **projection-driven products** (Bank Builder, Moonshot,
WC Specials/Parlays, daily portfolio) are blocked on the methodology projection pipeline — the BB
orchestrator *correctly* refuses to launch without qualified legs (NO_QUALIFIED_LAUNCH), which is the
honest, no-fabrication behavior. Generating them requires running `pipeline` projection stages for June 24.
