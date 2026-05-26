# Live Tracking — design doc

Status: **design only, no MVP shipped yet**. Created 2026-05-26 (PR #104).
This PR introduces a no-op loader + a small "Live tracking beta · coming
soon" UI badge so the surface is wired but never lies about live state
until the actual feed is implemented.

---

## Goal

Suggested parlay legs should update during live games:
- `not_started` — game hasn't tipped off / pitched
- `live` — game in progress, leg's stat is below/above the line right now
- `won` — leg has cleared the line and the game is over
- `lost` — leg cannot clear the line anymore
- `push` — final stat exactly equals the line
- `pending_final` — game ended but the stat hasn't been confirmed yet
- `dnp_or_unavailable` — player didn't appear in the box score

NBA + MLB only in v1. Cricket comes later (separate live feed needed).

---

## Data sources (all free, all already in the pipeline)

- **NBA**: ESPN summary endpoint
  `site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<id>`
  + nba_api `boxscoretraditionalv2` for in-progress stats.
- **MLB**: MLB Stats API
  `statsapi.mlb.com/api/v1.1/game/<gamePk>/feed/live` for full live
  state + `boxscore` for per-batter stats.
- Both already used by `pipeline.settle_results` and
  `pipeline.mlb.settle_mlb_results` for final settlement. The same
  endpoints return in-progress data when the game isn't over.

**No paid provider needed for v1.**

---

## Architecture

```
                       morning cron / live cron (every 5-10 min)
                                       │
                                       ▼
           ┌─────────────────────────────────────────────┐
           │   pipeline.live.update_live_parlays          │
           │   ───────────────────────────────────────    │
           │   1. Load optimizer-graded/<today>.json       │
           │      (or optimizer/<today>.json pre-cron)     │
           │   2. For each unique leg, look up the         │
           │      (sport, gameId, playerId) in the         │
           │      relevant live endpoint.                  │
           │   3. Compute leg status (W/L/live/pending).   │
           │   4. Write app/public/data/parlays/live/      │
           │      YYYY-MM-DD.json.                         │
           └─────────────────────────────────────────────┘
                                       │
                                       ▼
                  app/public/data/parlays/live/<date>.json
                                       │
                                       ▼
           ┌─────────────────────────────────────────────┐
           │   getLiveParlayState(date) — TS loader        │
           │   ParlayTicketCard + ResultsCard overlay      │
           │   "Live tracking beta · last updated <time>"  │
           └─────────────────────────────────────────────┘
```

### Why a separate live file (not optimizer-graded itself)
- `optimizer-graded/*.json` is the source of truth at cron time and
  must not be polluted mid-game. The settlement contract assumes
  final stats only.
- The live file is **ephemeral** — overwritten every poll, never
  committed back to git unless the workflow deliberately commits
  the date's snapshot for the cron audit log.
- Falls back gracefully: when the live file is absent, the UI
  renders exactly today — no overlay.

---

## Schema

```jsonc
{
  "date": "2026-05-26",
  "generatedAt": "2026-05-26T18:32:15Z",
  "lastPollSource": "manual" | "cron",
  "games": {
    // gameId → live status the legs reference
    "<gameId>": {
      "sport": "nba" | "mlb",
      "status": "scheduled" | "in_progress" | "final",
      "period": "Q3" | "T7",
      "clock": "5:42",
      "homeScore": 78,
      "awayScore": 71
    }
  },
  "slips": [
    {
      "slipId": "opt_2026-05-26_balanced_abc123",
      "profile": "balanced",
      "status": "live",
      "legs": [
        {
          "legId": "...",
          "playerName": "Donovan Mitchell",
          "market": "PTS",
          "side": "Over",
          "line": 26.5,
          "currentStat": 18,
          "needed": 9,
          "legStatus": "live",
          "gameStatus": "in_progress",
          "lastUpdated": "2026-05-26T18:32:15Z"
        }
      ]
    }
  ]
}
```

### Status derivation rules

| Leg market | Live "won" rule | Live "lost" rule |
|---|---|---|
| Over X.Y | currentStat > line | game final AND currentStat ≤ line |
| Under X.Y | game final AND currentStat < line | currentStat ≥ line OR (currentStat == line AND game final → push) |
| Cricket | not in v1 | not in v1 |

**Honest framing**:
- For Over markets, a leg can be marked "won" mid-game (the threshold
  is irreversible once cleared).
- For Under markets, a leg cannot be marked "won" until the game is
  final (the stat can still climb above the line).
- "live" never claims certainty.

---

## Polling cadence

GitHub Actions cron (free):
- Active windows: roughly 18:00 UTC to 04:00 UTC (1 PM ET to 11 PM ET,
  spanning NBA + MLB primetime).
- Every 5 minutes during active windows: `*/5 18-23,0-3 * * *`
- The script self-throttles: if no games are in progress, exits
  immediately without writing.

Vercel cron is an option but adds vendor lock-in. Stick with GitHub
Actions to share infrastructure with the existing nightly settle.

### Polling load
- ESPN summary: ~5-10 KB per request.
- MLB Stats API: ~50-100 KB per game's live feed.
- ~5-10 games on a typical evening = under 1 MB per poll. Both
  endpoints are unrate-limited for normal use.

---

## UI hooks

### `ParlayTicketCard` (homepage + parlay-lab)
- When `live` file exists AND a slip's `slipId` is present, overlay:
  - Per-leg status chip: `Live · needs 9 PTS`, `Hit ✓`, `Miss ✗`
  - Slip-level status (`Live · 3/5 alive`)
  - Footer micro-copy: "Live tracking beta · updated 18:32 ET"
- When live file absent: render exactly as today (no overlay, no
  empty chip).

### `/results` cards
- Same overlay. Optional "Show live games only" filter.

### Honesty rail
- Static disclaimer near the top of `/results` and the homepage when
  live tracking is active:
  > "Live tracking may lag by a few minutes. We never claim
  > sportsbook-grade settlement until games are final."

---

## What this PR ships vs defers

**This PR (PR #104) ships**:
- This design doc + provider roadmap doc.
- A no-op TS loader (`getLiveParlayState`) that returns `null` when
  no live file exists (which is always, today).
- A small UI badge — when implemented, renders "Live tracking beta ·
  coming soon" on the homepage hero. (Optional, not added in this PR
  unless the diff stays small.)
- The IPL odds wiring fix (separate from live tracking but in the
  same PR for cron-allowlist convenience).

**Deferred to a follow-up PR**:
- `pipeline/live/update_live_parlays.py` — actual live polling.
- GitHub Actions live-cron workflow.
- `ParlayTicketCard` overlay + `Results` overlay.
- `Live tracking beta` honesty rail copy.
- Cricket live overlay.

This staging keeps PR #104 reviewable (cron-wiring fix + research +
no-op loader) and pushes the substantive UI/automation change into a
future PR where it can land with proper test coverage.
