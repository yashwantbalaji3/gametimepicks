# Step 5 Brazil+NBA emergency review — June 13, 1:40 PM ET

Run: 2026-06-13 ~18:51 UTC · Base `98d8101`. Target: Brazil (WC) + NBA Finals Game 5 final
card. Outcome: **NBA leg now READY (real recommendations); Brazil leg BLOCKED (no
API-Football); Step 5 cannot publish → Review Pending — Brazil is the only remaining blocker.
No card invented, nothing fabricated.** Bank Builder unchanged: $3,623.97 / 4-0 / Step 5/5.

## Credentials (names/flags only)
`ODDS_API_KEY` present · `ODDS_DRY_RUN=true` · **`API_FOOTBALL` / `API_FOOTBALL_KEY` /
`APIFOOTBALL_KEY` absent** across `.env`, `.env.local`, `app/.env`, `pipeline/.env`.

## World Cup / Brazil — BLOCKED (unchanged hard blocker)
No API-Football credential → the WC model hard-stops; no June-13 WC projections → a Brazil
leg has no real odds + model probability. Brazil candidate legs reviewed: **none** (no data).

## NBA Finals Game 5 — now READY (real recommendations)
- Earlier the board was 100% `No Play / insufficient_data` ("no player game logs available").
- **Diagnosed the root cause**: stats.nba.com rate-limits aggressively; the bulk slate fetch
  failed and tripped the provider circuit-breaker. Verified empirically: with an 800ms gap,
  **18/18 Game-5 players return full game logs** (the system python's broken pyarrow/NumPy
  stack was a second layer — the project's `pipeline/.venv` imports nba_api cleanly).
- **Fix shipped** (`pipeline/providers/nba_api_provider.py`): a configurable request throttle
  (`NBA_API_THROTTLE_MS`, default 700) + bounded retry/backoff (`NBA_API_MAX_RETRIES`) on the
  game-log fetch — cached reads don't throttle; never invents data. Python provider tests
  green (6/6). This keeps local/CI bulk fetches from tripping the breaker.
- Meanwhile the **server auto-refresh** (committed board `98d8101`) produced a real Game-5
  board: `isDemo=false`, dataMode=Live, NY @ SA, **196 model-recommended legs (112 Over / 84
  Under)**, 98 High-confidence with real odds + model probability + edge (e.g. Wembanyama REB
  Under 11.5 @ -122 mp 0.72 edge 20.5; Mikal Bridges PTS Over 10.5 @ -120 mp 0.71). NBA
  candidate legs reviewed: **available and model-supported** → the NBA leg is **READY**.

## MLB — live (PR #470)
698 props, 18 suggested slips. (The parlay snapshot generator is MLB-only by config; surfacing
NBA cards in the snapshot lanes is a separate generator-config task, not done here. NBA props
+ recommendations are live on /nba and fixtures regardless.)

## Bank Builder Step 5 — REVIEW PENDING (Brazil + NBA)
- Brazil leg: **BLOCKED** — no WC data / no API-Football.
- NBA leg: **READY** — model-recommended Game-5 legs with real odds.
- Best Brazil+NBA pair: cannot be formed (Brazil unavailable). Combined odds / return: n/a.
- **Card NOT published.** No MLB substitute (target is Brazil+NBA). No `official-step5-candidate`
  artifact written. `/bank-builder` panel (data-driven, PR #471) now shows **NBA → READY,
  Brazil → BLOCKED** — verified live on production.

## Next operator action (the single remaining unblock)
**Add an `API_FOOTBALL_KEY` to `.env`**, then run the WC pipeline for 2026-06-13 via
`pipeline/.venv/bin/python`. With a real Brazil leg, the Step 5 gate re-runs and — since the
NBA leg is already ready — the Brazil+NBA card publishes automatically if combined ≥ +176.
