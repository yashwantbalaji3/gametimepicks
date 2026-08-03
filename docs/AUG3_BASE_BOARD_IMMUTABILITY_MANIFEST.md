# Aug 3 Base Board — Immutability Manifest (Program 108-111 §4.3)

> ## ⚠️ CORRECTION — 2026-08-03 12:45 ET
>
> **The file hash below is stale, and my 10:20 "cutover" did not bind the production pipeline.**
> The scheduled `morning-projections` ran at **12:04 ET** and regenerated the board — which is
> *permitted*, because the whole-slate rule allows regeneration while every game is still pregame
> (first pitch 18:40 ET). A cutover I declared unilaterally in a document does not stop a
> scheduled writer; only code does.
>
> | Field | At my cutover (10:20) | Actual now (after the 12:04 run) |
> |---|---|---|
> | file sha256 | `d2e81ca3…bebf41` | **`7d54aee717bea203d99c743097557d2bd7dfe5cb430edf4ab137d6acf2401fb6`** |
> | generatedAt | `04:34:02Z` | `16:03:45Z` |
> | rows / covered | 211 / 7 | **211 / 7 (unchanged)** |
> | identity digest | `5e69fa7b…ed7ed69` | **unchanged — guard green** |
> | model values | — | **unchanged on every shared row** |
> | capturedAt | `04:34Z` ×211 | `16:03Z` ×211 ← **restamped** |
>
> **What this proves about the guard:** it pinned the *prediction population*, not the bytes —
> exactly as designed — so a legitimate re-serialization passed while a row swap would still fail.
> The population is genuinely untouched.
>
> **What it exposed:** the 12:04 run spent **0 credits** (`"after": "cache"`) yet moved
> `capturedAt` on all 211 rows. Cached provider data was being re-stamped as a fresh capture —
> the exact condition the patch validator refuses, occurring in the canonical generator. Fixed in
> `95d05491`: cache hits now carry `x-gtp-observed-at` and the generator stamps from the real
> observation instant. No leakage resulted (16:03Z still precedes the 22:40Z first pitch), but the
> timestamp had stopped describing when the prices were actually read.
>
> The identity-digest pin below remains the binding invariant and is still green.

**Cutover declared 2026-08-03 10:20 ET.** From this point the Aug 3 base board is immutable;
any later byte change is a production error. All further coverage must arrive as append-only
official-addition patches.

## Why cutover is now (not after a 09:30 regeneration)

The 09:30 ET scheduled `morning-projections` **did not fire** (GitHub cron miss — the documented
best-effort behavior). The watchdog correctly does not dispatch, because its contract is to
recover a *missing* board and a current board exists. The 00:34 ET board is therefore the final
base version, and the LAD @ CHC gap becomes exactly the case the append-only path exists for.

## Frozen manifest

| Field | Value |
|---|---|
| File | `app/public/data/mlb/boards/2026-08-03.json` |
| **SHA-256** | `d2e81ca342aa15b298fd16fe3feb9f2eb197650462cd5436d5ac82e584bebf41` |
| Rows | **211** |
| Unique row identities | **211** (1:1 — see the identity fix below) |
| Identity digest (sorted ids, sha256) | recomputed by the guard; base digest pinned in `base-immutability.test.mjs` |
| generatedAt | `2026-08-03T04:34:02.979544+00:00` |
| capturedAt distribution | `04:34:03` ×70 · `04:34:04` ×74 · `04:34:05` ×67 |

### Event schedule and coverage at cutover

| gamePk | Matchup | First pitch (UTC) | Base coverage |
|---|---|---|---|
| 823431 | WSH @ PHI | 22:40 | COVERED |
| 823520 | STL @ NYY | 23:05 | COVERED |
| 823757 | PIT @ MIL | 23:40 | COVERED |
| **824647** | **LAD @ CHC** | **2026-08-04T00:05** | **UNCOVERED** ← patch target |
| 822867 | SF @ TEX | 2026-08-04T00:05 | COVERED |
| 824160 | TOR @ HOU | 2026-08-04T00:10 | COVERED |
| 824324 | TB @ COL | 2026-08-04T00:40 | COVERED |
| 825095 | SD @ AZ | 2026-08-04T01:40 | COVERED |

Every base row's `capturedAt` (04:34Z) precedes every first pitch (22:40Z+) by **18+ hours**.

## Defect found at cutover — and fixed before any patch went live

Computing the identity digest revealed **211 rows → 206 identities**. The rows were not
duplicates: they were different players (Tena/Nunez, Herrera/Caballero/Fermin,
Pena/Gimenez/Sanchez) whose `playerId` and `player` are both `null` in production, so the
identity composite fell back to the literal `"team"`.

Consequence had this shipped: an official-addition patch for a different player at the same
market/line/side would have been **refused as a duplicate identity**, silently dropping a
legitimate prediction — the precise class of silent data loss the patch contract exists to
prevent. Fixed in `ee56b83c`: identity prefers the pipeline's canonical row `id`. Live board is
now 211 → 211.

**This is the value of the cutover ritual:** the manifest computation itself surfaced a
production-blocking defect that no synthetic fixture had caught.
