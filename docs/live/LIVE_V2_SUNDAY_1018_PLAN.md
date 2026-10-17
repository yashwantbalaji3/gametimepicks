# Live Hub V2 — NFL Sunday 2026-10-18 capture run sheet

This is the second NFL acceptance window required by the V2 promotion rule (`LIVE_V2_THURSDAY_ACCEPTANCE.md`). It applies the same 23 checks as SEA @ DEN, now across several concurrent games, and with envelope-level player stats (`players=1`).

**Kit:** `docs/live/capture/` (generalized 2026-10-16). It is read-only and makes no paid calls. Self-test: `node --test docs/live/capture/kit.test.mjs`.

## Games (from `origin/main`, 2026-10-16)
Every week-6 game has a player board (17–25 players) and a forecast in `forecasts/latest.json`. No game has a live-props file yet. The market record lists all of them as `PRE_KICKOFF`, and they will become `NO_TARGETS` (see the SEA @ DEN report).

| Window | Game | ESPN id | Kickoff UTC | Kickoff ET | Capture window (−60 / +270 min) | Why |
|---|---|---|---|---|---|---|
| Early | HOU @ JAX (Wembley, London) | **401872996** | 2026-10-18T13:30Z | 9:30 AM EDT | 12:30Z – 18:00Z | The early window. While it is live, the rest of the slate is PRE, which tests mixed-state grouping on /live |
| 1 PM block | NO @ NYG | **401873000** | 2026-10-18T17:00Z | 1:00 PM EDT | 16:00Z – 21:30Z | Largest board (25 players, 69 rows), so the most player-stat comparisons. It overlaps HOU @ JAX and eight concurrent 1 PM games |
| Late | BUF @ LV | **401873005** | 2026-10-18T20:25Z | 4:25 PM EDT | 19:25Z – 00:55Z (Oct 19) | The late window (25 players, 65 rows) |

All three are ET date 2026-10-18, so `--settle-date 2026-10-18`.

**Variants:**
- To halve the request volume, drop NO @ NYG. Two games still give an early and a late window.
- `LAC @ KC` (401873006, 20:25Z) is an equivalent late alternative.
- SNF `DAL @ GB` (401873007, 00:20Z Oct 19, ET date Oct 18) is not included: it would extend Phase A to ~05:00Z.

**Request budget:**
- At most 2 events are active at once (16:00–18:00Z and 19:25–21:30Z). A 5-min pass then makes ≤ 7 requests to our site plus ≤ 2 to ESPN, and screenshots load `/live` plus ≤ 2 game pages at 2 widths every 4th pass.
- That is about 1.4× SEA @ DEN's hourly rate. SEA @ DEN drew 0 bot challenges over 480 requests.
- Over the full 12.5 h Phase A: about 900 requests to our site and about 40 screenshot passes.
- Phase B (every 30 min, ~27 h): about 9 requests per pass.
- If challenges appear, the report counts them separately. **Do not increase the cadence;** raising `--interval` to 600 is the lever.

## Launch (the lead runs this — not as a Claude background task)
The 2026-10-15 capture died at 13:09Z when the session that started it had its background tasks stopped. Launch from a normal Terminal tab (or the desktop Terminal panel). `nohup` makes it survive the tab closing, and `caffeinate` keeps the Mac awake while it runs. Keep the Mac **on AC power with the lid open**: `caffeinate -s` holds only on AC.

```sh
# 1. Freeze the kit version into the evidence folder (so later edits to any worktree cannot change a running capture)
EVID="$HOME/gtp-evidence/live-v2-sun-1018"
KIT=/Users/yashwantbalaji/Downloads/gametimepicks-wt/livehub-sun/docs/live/capture   # or the merged path on main
mkdir -p "$EVID/kit" && cp "$KIT"/capture.sh "$KIT"/git-watch.mjs "$KIT"/report.mjs "$KIT"/shot.mjs "$EVID/kit/"

# 2. Launch any time before 12:30Z Sunday. Passes with no game in its window make NO request; they only log a "pass" line.
cd "$EVID" && GTP_REPO=/Users/yashwantbalaji/Downloads/gametimepicks \
  nohup caffeinate -i -s sh "$EVID/kit/capture.sh" \
    --events 401872996,401873000,401873005 --settle-date 2026-10-18 \
    --interval 300 --until 2026-10-19T01:00:00Z --settle-until 2026-10-20T04:00:00Z \
    --shot-every 4 --out "$EVID/captures" > "$EVID/nohup.log" 2>&1 &

# 3. Confirm it is alive (start line, pid, first pass line)
sleep 5; head -2 "$EVID/captures/captures.jsonl"; cat "$EVID/captures/capture.pid"
```

What the launch reads, and what it touches:
- `GTP_REPO` is the main checkout. The kit only reads it: `git fetch` (refs only), `git show origin/main:…` and `merge-base`. Screenshots run Playwright from its `app/node_modules`. The working tree is never touched.
- **Stop early:** `kill -TERM "$(cat "$EVID/captures/capture.pid")"`. This writes a `stopped` line. Then run the report by hand:

  ```sh
  cd /Users/yashwantbalaji/Downloads/gametimepicks/app && GTP_REPO=$PWD/.. node "$EVID/kit/report.mjs" "$EVID/captures" > "$EVID/captures/REPORT.md"
  ```
- **Mid-run look**, read-only, safe while it runs: the same report command. It reads files only.

## Schedule (UTC → ET)
| UTC | ET | What |
|---|---|---|
| Sun 12:30Z | 8:30 AM | HOU @ JAX window opens; 5-min passes begin |
| 13:30Z | 9:30 AM | HOU @ JAX kickoff |
| 16:00Z | 12:00 PM | NO @ NYG window opens (2 active) |
| 17:00Z | 1:00 PM | NO @ NYG kickoff (plus 7 other games) |
| ~16:45–17:00Z | ~1:00 PM | HOU @ JAX final expected |
| 18:00Z | 2:00 PM | HOU @ JAX window closes |
| 19:25Z | 3:25 PM | BUF @ LV window opens |
| ~20:15Z | ~4:15 PM | NO @ NYG final expected |
| 20:25Z | 4:25 PM | BUF @ LV kickoff |
| 21:30Z | 5:30 PM | NO @ NYG window closes |
| ~23:40Z | ~7:40 PM | BUF @ LV final expected |
| Mon 01:00Z | Sun 9:00 PM | Phase A ends → Phase B: every event every 30 min |
| Mon ~16:00–22:00Z | Mon ~12–6 PM | **Expected** canonical settlement served (reasoning below) |
| Tue 04:00Z | Tue 12:00 AM | Phase B hard stop (`--settle-until`) unless settled-and-served earlier |

**When settlement is expected.** Nothing settles a prop during the game: `nfl-live-props.yml` is *disabled_manually*, and `nfl-live-props-free.yml` is dispatch-only. The post-final sweep runs inside `nfl-event-window`, on its daily crons (13:00Z Sunday sweep, 14:30Z, 15:00Z, 21:00Z, delivered 1h40m–4h55m late) or on an automated dispatch. The sweep targets games kicked off ≥ 3.5 h earlier.
- The first run after each final writes PROVISIONAL. On 10-16 that was the 13:56Z run for a 03:38Z final.
- A run at least 3 h later (`RECONCILIATION_WINDOW_MS`) promotes the game to CANONICAL; then Vercel deploys.
- Realistically: the Sunday 21:00Z cron, delivered about 22:40Z–02:00Z, gives PROVISIONAL for HOU @ JAX and NO @ NYG, and BUF @ LV if the run lands after its final. Monday's 14:30Z/15:00Z crons give CANONICAL.
- SEA @ DEN for comparison: canonical served 13 h 35 min after the ESPN final.

**Not in this plan (the lead's decision).** Dispatching `nfl-live-props-free` during the games would put an in-game live-props artifact on main, plus earlier PROVISIONAL settlement. This plan triggers no workflow. Without it, in-game player values reach the page only through the gateway (`use-live-props.ts` merges `players=1`), which is exactly what the envelope check below measures.

## Evidence
- `$EVID/captures/captures.jsonl`: one JSON line per request, pass, settlement watch, screenshot, start, finish or stop.
- `$EVID/captures/<stamp>-…`: per pass:
  - `slate.json`, `live.html`, `build-info.json`;
  - per event: `event-<id>.json`, `game-<id>.html`, `espn-<id>.json` and `frozen-<id>.txt`;
  - PNGs `live-390/1440` and `game-<id>-390/1440`.
- `$EVID/captures/REPORT.md`, written at finish.
- `$EVID/nohup.log`, `watch-errors.log`, `shot-errors.log`.
- Disk: about 0.8 MB per active event-pass in play (ESPN summary ≈ 0.4 MB, game HTML ≈ 0.4 MB), plus screenshots. Expect ≈ 0.5 GB.

## Expected checks (what the report and the review must show)
Numbers refer to `LIVE_V2_THURSDAY_ACCEPTANCE.md`.

| # | Check | Expected on Sunday | Report line |
|---|---|---|---|
| 1, 10 | Frozen before kickoff | Forecast and board hash unchanged from the first pass at or after kickoff; no receipt added after kickoff. The forecast rolls off `forecasts/latest.json` after the post-game window run; that is **expected**, and the board hash must still match | "Frozen forecast…", "Player board hash…" |
| 2 | Kickoff transition | Gateway LIVE no earlier than ESPN `in`, at 5-min resolution | Lifecycle timeline |
| 3 | Score | 0 score disagreements vs ESPN at the same pass; no score while PRE | Missing-evidence list |
| 4 | Quarter/clock | Matches ESPN; halftime/end-of-period labels; no clock once final | Timeline |
| **5** | **Live player stats, envelope level (new)** | On LIVE passes `event.playerStats` is a non-empty array of `{playerId, market, value}` for `player_rush_yds`, `player_receptions` and `player_reception_yds`. The in-game values equal ESPN's box via the producer's own `statFor`, except where the gateway's cache (`TTL_SECONDS.LIVE` = 25 s, `lib/live/freshness.mjs`) and a different fetch instant explain a difference (informational). **At the final: strict equality**. A player with no box-score row has no entry, never a 0 | "Envelope player stats…: x/y equal"; final differences become problems |
| 6, 16–18 | Frozen vs observed, rails, over/under, TDs | Screenshot review. Anytime TD reads "Not tracked live · settled from the official box score" | Screenshots |
| 7, 14, 19–21 | Delay, freshness bands, provider failure | Seen only if they occur; otherwise **NOT OBSERVED** | Timeline (`fetchedAt`), envelope `policy` |
| 8 | Provisional final | "Final · grading pending" on /live and the game page until settlement; no WIN/LOSS | Screenshots |
| **9** | **Canonical settlement** | Provisional, then CANONICAL in `live-props/<id>.json`, plus the ledger `prop-settlement/2026-10-18.json` (`canonical == rows`). **Served**: build-info contains the canonical commit, and/or a GitHub Production deployment (±60 s). Ledger `noMeasurementWithValue == 0`. `decided` is expected to be **0**: every board reads `marketCoverage.priced: 0`, so no line was frozen. The market record stays `NO_TARGETS`. Neither is a failure | "Provisional final on main…", "Canonical settlement on main…", "Prop-settlement ledger…", "Market paper record…" |
| 11, 22, 23 | Mobile, parity, layout | 0 px overflow at 390 and 1440; 0 broken images; same facts at both widths | Site-wide checks |
| 12 | Unsupported sports | /live coverage line unchanged (NBA, Premier League, UFC "not tracked live yet") | Screenshot |
| 13, 15 | Poll cadence, aria-live | Client-side; **NOT OBSERVED** by this kit (a real-browser spot check if wanted) | — |
| new | Concurrency | With 2 games live (16:00–18:00Z, 19:25–21:30Z), /live shows both as live, and the slate envelope agrees with each event envelope on state and score | "slate and event envelopes disagree" problems |

Reconciliation after canonical uses the same method as SEA @ DEN:
1. Compare `results/latest.json` on main with ESPN's final.
2. Re-derive every ledger row from the last ESPN summary with `statFor`.
3. Check that live-props equals the ledger, and that Production's copy equals main's.

## Known risks
- **Local connectivity:** on 10-16, 3 passes (10:12–11:12Z) had no network at all. The report now names such passes as offline. If it happens during a game, ESPN ground truth for those passes is lost too; nothing can backfill them.
- **Host sleep:** late passes (39 and 57 min on 10-16) point to sleep or stalls. Keep the machine on AC power with the lid open; `caffeinate -i -s` is held for the whole run.
- **Bot challenge:** see the request budget. Challenged passes are evidence gaps, not failures.
- **Settlement after `--settle-until`:** if canonical lands later, the served time can still be read from the GitHub deployments, as for SEA @ DEN: `node git-watch.mjs … --gh 1`.

## Multi-sport
Equivalent live tracking for MLB, NBA, UFC and soccer is listed in `docs/live/LIVE_V2_MULTISPORT_PREREQS.md`.
