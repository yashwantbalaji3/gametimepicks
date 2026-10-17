# Thursday SEA @ DEN: acceptance readiness (2026-10-15)

**Event:** ESPN `401872995`, SEA (away) @ DEN (home), Empower Field. Kickoff `2026-10-16T00:15Z` = **Thu Oct 15, 8:15 PM EDT**. ESPN and our gateway agree.

**Capture:** a detached process, independent of any Claude session.
- Launched with `setsid`, so it is its own session leader with PPID 1.
- Held by `caffeinate -i -s`; no system setting is changed.
- Kit: `~/gtp-evidence/live-v2-401872995/kit/`. Evidence: `~/gtp-evidence/live-v2-401872995/captures/` (internal disk).
- Schedule:

| Phase | From | Until |
|---|---|---|
| Every 5 min | 2026-10-15T23:15Z (T−60 min) | 2026-10-16T05:00Z |
| Every 30 min (settlement watch) | 2026-10-16T05:00Z | one pass after the SETTLED state is served by Production, or 2026-10-17T02:00Z at the latest |

**What would stop it:** a closed lid, a reboot, or loss of network.

**Live Hub V2 stays in preview.** Promotion needs the acceptance plan's checks 1–12 passing on this game and on one more NFL window, plus one MLB game, with 0 V2/production disagreements.

| Requirement | Evidence recorded each pass | Judged by (`report.mjs`) |
|---|---|---|
| Pregame forecasts | Frozen fingerprint from `origin/main` (git): forecast rows for the event + player-board hashes; game-page HTML | "Frozen forecast fingerprint: identical at every capture" |
| Kickoff transition | Gateway slate + event envelopes (`state`, `period.phase`); ESPN `status.type.state` | Lifecycle timeline row at the first LIVE; ESPN state at the same pass |
| Live scores | Envelope `competitors.*.score`; ESPN summary scores | "score differs from ESPN at the same pass" problems (none expected); scores never present while PRE |
| Game-state changes | Envelope state/phase/period/clock | Timeline: one row per state, period or score change |
| Frozen forecast values | Git fingerprint (forecasts + boards) and the live-props `frozenHash` (frozen identity + frozen projection/market per row) | Fingerprint and `frozenHash` unchanged across all passes; any change is listed as a problem |
| Player-prop progress | Gateway `players=true` envelope (`playerStats`); committed live-props artifact: rows with a live stat, phase | "Live-props artifact" line: max rows with a live stat; "Player stat rows" max |
| Official finals | Envelope FINAL states; ESPN `post`; live-props `finality` | Timeline reaches FINAL / FINAL_PENDING_SETTLEMENT; finality CANONICAL |
| Settlement | `data/internal/nfl/settlement/2026-10-15.json` on main; whether the deployed build contains it; live-props `settlement` counts | "Canonical settlement on main: first seen … · served by Production: from …" |
| Unavailable vs pending vs live vs final | Envelope state per pass; settlement `no-file-yet` / `pending` / `settled`; live-props `NO_MEASUREMENT` counted separately from settled | States listed in order; pending never counted as settled; unavailable stats never shown as 0 (checked from the HTML and screenshots in review) |
| Logos / portraits / mobile parity | Screenshots at 390 and 1440 px every 15 min (headless) | Horizontal overflow, broken visible images, headshot and logo counts |
| Bot challenge vs real failure | `x-vercel-mitigated` header per request | Challenged requests are reported separately as `VERCEL_BOT_CHALLENGE`, never as failures; ESPN and git evidence keep the timeline |

## Replay on Monday's game (`401872994`, already settled)
- Settlement was detected on main and served by Production.
- Live-props: phase FINAL, finality CANONICAL, 41/50 rows with a live stat, 41 settled, 9 NO_MEASUREMENT, frozen values unchanged.

## Known limits, stated before the game
- **Client-rendered live UI** (chip, progress rails) appears only in screenshots. Headless screenshots can be challenged by Vercel mitigation. The challenge seen at 00:49Z cleared by 03:55Z after this session stopped polling. Avoid other automated traffic to Production during the game.
- **The live-props artifact** for last Monday's game was committed only at settlement. In-game player progress may therefore rest on the gateway envelopes alone.
- **Settlement timing:** last Thursday's game first settled on main at 16:09Z the next day. The watch runs to 02:00Z Saturday.
