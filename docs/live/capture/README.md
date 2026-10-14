# Live acceptance capture kit (read-only)

This is the evidence capture for `docs/live/LIVE_V2_THURSDAY_ACCEPTANCE.md`. It reads only:
- our Production gateway and pages;
- `origin/main` via `git`.

It never writes to the repo, never triggers a workflow and never calls a paid provider.

| File | What it does |
|---|---|
| `capture.sh` | **Phase A:** every `interval` seconds until `until`, it saves the slate and event envelopes, the `/live` and game-page HTML, `build-info.json` and a frozen-forecast fingerprint. It screenshots at 390 px and 1440 px on every 3rd pass. **Phase B:** every 30 minutes until `settle_until`, to catch the canonical settlement run. Every request is logged to `captures.jsonl` with its HTTP status and size, so a failed capture is recorded, never skipped. Output is mirrored to `$HOME/gtp-evidence/live-v2-<event>/` |
| `shot.mjs` | Takes the screenshots (Playwright from `app/`). Records per shot: horizontal overflow, broken visible images, and headshot/logo counts |
| `report.mjs` | Builds a lifecycle timeline (one row per state, period or score change) and runs the checks: states observed, player rows, frozen-forecast stability, overflow and broken images. It ends with a **Missing or incomplete evidence** list: non-200 responses, unreadable envelopes, slate/event disagreement, capture gaps, failed screenshots and an unclean finish |

Run it from the repo root:
```
sh docs/live/capture/capture.sh 300 2026-10-16T05:00:00Z 2026-10-17T02:00:00Z
node docs/live/capture/report.mjs "$HOME/gtp-evidence/live-v2-401872995/captures"
```

Dry run 2026-10-14T20:23Z (event PRE):
- all 5 endpoints returned 200;
- 4 screenshots;
- game page: 80 headshots and 66 logos, 0 broken;
- 0 px overflow at 390 and 1440;
- the report correctly lists LIVE and FINAL as not yet observed.

## Schedule for SEA @ DEN (`401872995`)
Confirmed 2026-10-14 by both the ESPN summary and our gateway.

| Point | UTC | ET |
|---|---|---|
| Capture start | 2026-10-15T23:15Z | **Thu Oct 15**, 7:15 PM EDT |
| Kickoff | 2026-10-16T00:15Z | **Thu Oct 15**, 8:15 PM EDT |
| Phase A ends (5-min cadence) | 2026-10-16T05:00Z | Fri Oct 16, 1:00 AM EDT |
| Settlement watch ends (30-min cadence) | 2026-10-17T02:00Z at the latest | Fri Oct 16, 10:00 PM EDT |

**Why the settlement watch runs so long:** last Thursday's game (TB @ DAL, also a 00:15Z kickoff) first appeared settled in `data/internal/nfl/settlement/2026-10-08.json` on main at **2026-10-09T16:09Z**. The original 16:00Z cut-off would have missed it.

Each pass records:
- whether the event is in `data/internal/nfl/settlement/2026-10-15.json` on `origin/main`;
- whether Production serves a build that contains that commit.

The watch ends one pass after the settled state is served. A replay on last Thursday's game confirmed this early stop.
