# MLB Research Timestamp-Leakage Incident + Repair

_Detected: 2026-07-22 (observation-quality `status: BLOCKED`, `leakage: 246`). Repaired: 2026-07-23._

Internal research archive only — **no public product, no money, no official record was affected.** Money md5 stayed
`affe6b21071f2b3be96bb2774eb347c3`; the modeling gate stayed BLOCKED throughout.

## 1. Exact root cause

The settlement join **copied an inherited `researchEligible` flag without re-validating it against the join's own
authoritative event start.**

- Market captures compute eligibility correctly at capture time: `researchEligible = capturedAt < ev.commence_time`
  (`capture-mlb-pregame-markets.mjs:74`, `capture-mlb-pregame-player-props.mjs:84`), where `commence_time` is the
  Odds-API scheduled start.
- The settlement join's `slimLean` (`join-mlb-pregame-settlements.mjs`) **dropped each row's own `eventStartTime`** and
  copied `researchEligible` verbatim (`researchEligible: l.researchEligible === true`). `mergeLeanKeys`/
  `gatherCapturedLeans` kept the row with the **latest `capturedAt`**, not the latest *eligible pre-start* capture.
- The join then stamped the game's authoritative first pitch from the freeze (`eventStartTime: freeze.eventStartTime`
  — the official MLB StatsAPI start).

When the Odds-API `commence_time` used at capture differed from the official first pitch — or a game simply started
before a slate-wide market snapshot ran — a row captured **after** the official first pitch kept `researchEligible=true`.
The join never re-checked `capturedAt < freeze.eventStartTime`. That is the leak.

## 2. Where it originated

**Carry-forward / merge selection + settlement-join assembly.** NOT capture (capture computed the flag correctly
against the data it had), NOT normalization, NOT the freeze (the freeze's eventStartTime is correct), NOT settlement
grading. The defect is that the join trusted an inherited boolean instead of re-validating timestamps at its boundary,
and its merge selected the newest capture rather than the newest *eligible pre-start* capture.

## 3. How many rows

**278** market rows carried `researchEligible=true` with `capturedAt >= eventStartTime`. Of those, **246 were settled
(win/loss)** — exactly the `leakage: 246` in the committed observation-quality report. Split across three capture
timestamps (20:07:51.878Z ×8, 20:07:52.822Z ×250, 23:55:34.501Z ×20).

## 4. Which dates/games

**A single date, four games, all 2026-07-22:**

| gamePk | matchup | eventStart (official) | offending capture | delta |
|---|---|---|---|---|
| 824004 | Cardinals @ Angels | 20:07:00Z | 20:07:51.878Z | +52s |
| 822784 | Rays @ Blue Jays | 23:07:00Z | 23:55:34.501Z | +48m |
| 824408 | Twins @ Guardians | 22:40:00Z | 23:55:34.501Z | +75m |
| 824896 | Padres @ Braves | 23:15:00Z | 23:55:34.501Z | +40m |

The `eventStartTime` values are correct UTC first pitches; the captures genuinely ran post-first-pitch for these games.

## 5. Why the public deterministic simulations were NOT affected

The public `game-simulations/<date>.json` is a **separate system**. It is seeded from a pregame market snapshot
(`marketSnapshot.capturedAt` = 15:22Z on 2026-07-22, well before first pitch) and carries a `status:"ready"` pregame
guard; the social/export pipeline additionally refuses any game whose market was not frozen before `commenceTime`. The
leak lived only in the **internal research settlement-joins** (`data/internal/…`), which the public product never reads.

## 6. Why affected rows cannot count toward model research

A value captured at/after first pitch is not pregame information — it can encode in-game state. Counting it would let
post-start information leak into a "pregame" research row, invalidating any leakage-safe backtest. Equality
(`capturedAt == eventStart`) is treated as ineligible for the same reason.

## 7. Code paths repaired

- **`scripts/lib/research-eligibility.mjs`** (NEW, canonical gate) — `revalidateMarketEligibility({inherited,
  capturedAt, availableAt, eventStartTime})`: inherited flags are never trusted; a row is eligible only if
  `capturedAt < eventStartTime` (and `availableAt < eventStartTime` when known). The single source of truth.
- **`join-mlb-pregame-settlements.mjs`** — re-validates every marketRow against `freeze.eventStartTime`; preserves
  `availableAt` in `slimLean` so the check is complete going forward.
- **`build-mlb-research-observations.mjs`** — re-validates each settled row and **excludes** post-start rows from the
  observation dataset (they are quarantined, never emitted).
- **`quarantine-mlb-research-eligibility.mjs`** (NEW) — re-validated the committed joins, downgraded the 278 rows to
  `researchEligible=false` + `eligibilityReason` **without touching any timestamp**, and wrote the audit artifact
  `data/internal/mlb/research-quarantine/2026-07-22.json`. Idempotent + deterministic.
- **`monitor-mlb-research-quality.mjs`** — separately fixed a false-positive: `spreads` settle on a *signed* run margin
  (a negative `actual` is legitimate), so its `impossibleStats` bound is now by magnitude, not floored at 0.

### Before → after quarantine (final committed state, on the newest nightly base 84391f1d)
| metric | before | after |
|---|---|---|
| rows re-validated ineligible (quarantined) | — | **278** (all POST_START_ONLY, 2026-07-22, 4 games) |
| settled-eligible observations | 2254 | **1988** |
| observation-quality `leakage` | 246+ | **0** |
| observation-quality status | BLOCKED | **PASS** |
| join monitor overall | FAIL | **PASS** |
| qualifying observation dates | 1/30 | 1/30 (unchanged — gate stays BLOCKED) |

(The absolute observation counts grow as the nightly bot settles more of the day's games; the 278 quarantined rows +
the leakage→0 result are invariant across re-runs. An earlier base showed 1085→839.)

## 8. Prevention

- A **single canonical eligibility gate** re-validated at every consuming boundary (join, assembler); inherited
  booleans are never trusted. Regression cases in `mlb-research-eligibility-revalidation.test.mjs` (equality, missing
  timestamps, event reschedule, availableAt-after-start, newest-eligible-pre-start selection, mixed-market rows).
- The assembler **drops** post-start rows from observations, so a future leak cannot silently enter the dataset.
- The live-archive integration suite (`RESEARCH_ARCHIVE_INTEGRATION=1`) now passes 29/29 on the clean archive and is
  wired to an optional nightly workflow so it is not permanently skipped.
- Evidence is preserved: quarantined rows stay in the joins with their real timestamps + a reason; the quarantine
  artifact records every excluded row.
