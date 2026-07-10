# UFC 329 Readiness Sprint (2026-07-10)

**Blunt verdict: UFC 329 (McGregor vs. Holloway 2, July 11) is NOT in the repo, so no predictions can be
generated yet — and none were faked.** The UFC pipeline is real and fail-closed, but its ingested "next
card" is a stale June-15 event. This documents exactly what's missing and the exact ingest needed. No
fabricated fights, fighters, odds, or headshots.

---

## What the repo has (real)

- A real, fail-closed UFC pipeline: `ufc-types.ts` (`UfcEvent/Bout/Fighter/MarketOdds/Projection`,
  `UFC_SUPPORTED_MARKETS = winner / method / rounds_total / goes_distance`), a gated `/ufc` page,
  settlement (`ufc250-settlement`), backtest, and `ops-status-latest.json`.
- A large committed fighter DB (`fighters-latest.json`, 2.5 MB) — it **does** contain Conor McGregor and
  Max Holloway (they're real, historical fighters), and `results-latest.json` has their past results.

## What is MISSING for UFC 329 (the blocker)

| need | status | source needed |
|---|---|---|
| UFC 329 **event** (date/venue) | **absent** — `schedule-latest.json` has 0 events; ops `nextCard` = "UFC Freedom 250" (2026-06-15, stale) | a UFC schedule/event feed for the July-11 card |
| UFC 329 **fight card** (bouts) | **absent** | same event feed |
| **moneyline** odds | absent for 329 | Odds API (UFC) — the same provider the pipeline already uses, scoped to the 329 event |
| **method / round-total / goes-distance** odds | absent for 329 | Odds API UFC prop lines |
| model **projections** for 329 | absent (no card to project) | run the UFC projection model AFTER the card + odds ingest |

Because the **event + fight card + odds are not ingested**, the `/ufc` page correctly shows nothing for
329 — the honest, fail-closed state. Fabricating a McGregor–Holloway card, odds, or win probabilities was
explicitly not done.

## The exact ingest to make UFC 329 first-class (next pass)

1. Ingest the UFC 329 **event + fight card** into `public/data/ufc/schedule-latest.json` (event name,
   date `2026-07-11`, venue T-Mobile Arena, bouts with real fighter ids) via the UFC schedule feed.
2. Ingest **moneyline + method + round-total + goes-distance** odds for the 329 bouts (Odds API UFC,
   credit-guarded) → the pipeline's odds artifacts.
3. The existing `moneylineV1Ready` gate flips on its own once real card+odds exist; the `/ufc` page then
   lights up (market-implied first, model-adjusted if the projection model runs).
4. Only then surface predictions — labelled `market-implied` / `model-adjusted` / `internal readiness`,
   paper-only, with the Generate gate if interactive.

## Nav honesty

Until the event is ingested, the command-rail UFC descriptor is "Coming soon" — which is honest. It
should become "UFC 329 · fight week" ONLY after the real card+odds land (not before). This pass did not
flip it, because that would imply readiness the data doesn't yet support.

## Guardrails

No fake UFC data created. No paid UFC scrape run (no guarded 329 ingest script + no committed 329 event to
justify it). Official money untouched (md5 `affe6b21…`). UFC internal artifacts remain internal.
