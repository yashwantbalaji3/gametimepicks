# Diagnosis — May-31 morning-projections timeout (NBA on CI)

**Date:** 2026-05-31 (evening) · **Status:** root-caused; **fix #1 (circuit
breaker) now implemented** with operator approval (see §5). §4 records why no
fix was shipped on the first pass.

## 1. What happened
The scheduled `morning-projections` run for **May 31** (`26715992048`, 13:30 UTC
slot) **timed out and was cancelled after 25 minutes** (the job's
`timeout-minutes: 25`). Because it never reached the commit step, **May 31 got
no real projections** — only the empty `boards/2026-05-31.json` placeholder
(0 leans, `dataMode: NoGames`) that yesterday's run wrote forward.

`morning-projections` normally finishes in ~1–2 minutes (May 29: 1m38s, May 30:
2m28s), so this was a hang, not normal load.

## 2. Root cause (from the run log)
Repeating, ~25 s apart, for player after player:
```
pipeline.fetch_nba_data WARNING [game_logs] nba_api failed for player <pid>:
  nba_api game logs failed: HTTPSConnectionPool(host='stats.nba.com', port=443):
  Read timed out. (read timeout=25)
pipeline.fetch_nba_data WARNING [game_logs] espn_scoreboard failed for player <pid>:
  espn.fetch_player_game_logs — not supported by this provider
```

So, per NBA player on the slate:
1. **nba_api (`stats.nba.com`) read-times-out after 25 s** — NBA.com throttles/
   blocks GitHub Actions runner IPs. *(Same systemic cause as the settlement gap
   fixed in PR #202.)*
2. The **next provider in the chain (`espn_scoreboard`) does not implement
   `fetch_player_game_logs`** ("not supported by this provider"), so it fails
   instantly.
3. `fetch_player_game_logs` then returns `[], "none"` → that player's projection
   is suppressed.

At ~25 s wasted per player × a full NBA roster, the orchestrator blows past the
25-minute job budget → cancelled → **nothing committed**.

## 3. Why the existing recent10 fallback didn't save it
`pipeline/recent10_cache_fallback.load_stale_recent10_cache()` (the "existing NBA
recent10 fallback") reads the same `pipeline/cache/nba_api_gamelogs_*.json` cache
the nba_api provider writes on healthy days. **But it is wired only into the
display/enrichment path (`attach_recent10.py`), not into the projection-model
fetch (`fetch_nba_data.fetch_player_game_logs`).** So the model-input path has no
fast fallback when nba_api is down — it just slow-fails every player.

## 4. Why no fix was shipped tonight (deliberate)
- **May 31 is unrecoverable.** By the time this was diagnosed (~7:30pm ET) the
  slate was over (MLB 14 Final / 1 Live, **no NBA games** May 31). Dispatching
  `morning-projections` now would generate **post-hoc** data for finished games,
  violating the snapshot-before-games integrity guarantee. **Not done.**
- **Unvalidatable locally.** The projection orchestrator can't run in this
  environment (nba_api not installed; no Odds API key; live network providers).
  Unlike the settlement fix — which was validated end-to-end locally before
  shipping — any projection-pipeline change here would be unverified until the
  next live CI run. The projection generator is the most critical product path;
  an unvalidated change risks breaking **every** future slate.
- **The best fix is a semantic decision, not a mechanical one.** Feeding the
  14-day stale cache into the *projection model* (vs. only the recent10 display)
  changes projection semantics — and `recent10_cache_fallback`'s own docstring
  warns it is "NOT a way to invent recent-game values." That belongs to an
  operator design call, not a unilateral late-night edit.

## 5. Recommended fixes (operator, validate against a live run)
In rough priority — each should land with tests and be watched on the next
`morning-projections` run:

1. **✅ IMPLEMENTED — Circuit-breaker around the NBA provider chain.**
   `pipeline/provider_circuit_breaker.py` (new) + `pipeline/fetch_nba_data.py`
   (refactored). A process-wide breaker, **shared across game-logs / roster /
   box-score**, trips a provider when its *slow* failures (elapsed ≥ 10 s) reach
   4 in a row **or** cumulative failed-time reaches 120 s, then skips it for the
   rest of the run. Fast failures (`ProviderNotImplemented`, ~0 s) never trip it;
   any success resets the streak; an unexpected (non-`ProviderError`) exception is
   contained, recorded, and the walk continues (no single provider can abort
   failover). **Bound:** a hung host wastes ≤ ~125 s total per run regardless of
   roster size (verified: 500 players cost ~100 s vs. the old ~12,500 s). The
   success/healthy path is byte-for-byte unchanged. When everything fails the
   result is empty and the player's projection is honestly suppressed — **no
   data invented, stale cache NOT auto-consulted in the model path.** Covered by
   `pipeline/fetch_nba_data_test.py` (37 assertions) + an independent
   three-lens adversarial review.
2. **Wire `load_stale_recent10_cache` into `fetch_player_game_logs`** as a
   fallback *after* nba_api fails — so NBA projections still generate from honest
   cached game logs when nba_api is blocked. **Requires an operator decision** on
   using stale cache for model inputs (keep the R1 guardrail intact).
3. **Reduce the nba_api read timeout** (25 s → ~8 s) and/or **raise
   `timeout-minutes`** (25 → 35) as stopgaps. Weaker: a shorter timeout can
   false-fail slow-but-healthy responses; a longer job budget still wastes CI
   minutes hammering a blocked host.
4. **Implement an ESPN (or alternate) `fetch_player_game_logs` provider** so the
   chain has a real second source instead of "not supported by this provider."

## 6. Current honest state (verified)
- `/projections` shows **today (May 31) = 0 games / 0 projections** with
  yesterday's full May-30 slate available — honest, not fabricated.
- `/parlay-lab` shows the May-30 slate as **SETTLED** ("kept for transparency",
  links to Results) — it does **not** present a stale May-30 slate as today's
  pregame.
- `/bank-builder` shows the honest empty state (no pending unsettled slip).
- `/results` correctly shows **May 30** as latest settled; **May 31 is not
  settled** and has no fabricated record.
- No fabricated projections/odds/parlays were created for May 31.

## 7. Next clean cycle
- `nightly-settle` (07:00 UTC Jun 1) settles **May 31** — but there are no May-31
  suggested parlays to grade (none generated), so the track record simply has no
  May-31 row. Honest.
- `morning-projections` (13:30 UTC Jun 1) generates **June 1** — now with the
  circuit breaker in place. **Watch this run:** it should finish in its usual
  ~1–2 min, or — if NBA.com is blocking the runner — finish *fast* with NBA
  honestly suppressed (MLB board still committed) instead of timing out. The
  breaker only changes behaviour when a provider hangs; a healthy run is
  unaffected. If June 1 still stalls, the next levers are fix #2 (wire the
  recent10 cache into the model fetch, operator-approved) and #3/#4.
