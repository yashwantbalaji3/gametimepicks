# Multi-Sport Readiness Audit

**Date:** 2026-07-28 · **Sprint:** 043 · **Method:** measured from artifacts and source on disk. No estimates.

Every number below was counted from a file in this repository. Where a claim could not be measured, it is
recorded as unprovable rather than assumed.

---

## Verdicts

| Sport | Verdict | The single fact that decides it |
|---|---|---|
| **MLB** | `HISTORICAL_ONLY` | All 4 modeled markets lose to the market across 18,659 leans; `modelBeatsMarket = false` |
| **UFC** | `SCAFFOLD_ONLY` | 0 fully-backtestable bouts; 20 pregame lines ever captured, none joining a same-fight result |
| **Soccer — World Cup** | `HISTORICAL_ONLY` | A real 64-match 2022 backtest exists and **loses to the closing market** (Brier +0.0099) |
| **Soccer — EPL / UCL / MLS** | `DISABLED` | Zero artifacts, zero pipeline code |
| **NBA** | `HISTORICAL_ONLY` | 3,635 settled outcomes; `fullyResearchEligibleDates: 0`; provider down since 2026-06-13 |

These verdicts are reproduced mechanically by `deriveReadiness` in
[`sport-adapter.ts`](../app/src/lib/identity/sport-adapter.ts), tested in `sport-adapter.test.mjs`. The
contract and this audit were derived independently and agree on all five rows.

**No sport reaches `FULL_MODEL`.** That is the honest state, not a temporary gap.

---

## The one finding that spans every sport

> **No sport in this repository enforces a per-row capture timestamp against event start.**

> **⚠️ CORRECTED BY SPRINT 044.** The statement above is too broad. Measurement in
> [`SPRINT_044_HISTORICAL_INTEGRITY_AUDIT.md`](./SPRINT_044_HISTORICAL_INTEGRITY_AUDIT.md) found that
> MLB's **internal pregame research archive DOES** enforce per-row provenance — 9,938 of 9,938 rows
> carry `capturedAt` / `availableAt` / `eventStartTime`, minimum capture lead 72 minutes, and an
> independent re-derivation agrees with the stored flag on every row. What holds is the narrower claim:
> MLB's **public serving artifacts** (`boards`, `team-markets`, `player-props`) carry only a file-level
> `generatedAt`, and the other sports are unchanged from the measurements below.

MLB is the only sport with per-row capture provenance at all, and it still shipped an identity collision
to two user-facing surfaces (Sprint 041). Everywhere else, "this odds line was pregame" rests on a
file-level `generatedAt`, which describes when the build ran — not when the row was observed. That is not
a contract; it is a coincidence that has held.

The single exception on disk is
`data/internal/world-cup/reference/wc-2022-closing-odds-baseline.json`, which carries per-match `kickoff`
and `snapshotTimestamp` with every snapshot asserted strictly before kickoff. 64 matches, 2022 only,
internal. It is the only leakage-provable odds set the repository owns.

This is why `CaptureProvenance` and `isLeakageSafe` in the adapter contract fail closed: a missing
timestamp returns `false`, never "probably fine".

---

## UFC — `SCAFFOLD_ONLY`

**What genuinely exists:** a 2,695-fighter reference database (17,402 fights), a 1,519-bout results corpus
spanning 2023-06-10 → 2026-05-16, and a fail-closed readiness gate. These are real assets.

**Why they cannot yet support research:**

| Requirement | Measured reality |
|---|---|
| Pregame odds captured | **20 bouts, across 2 snapshot files.** `h2h` only — zero rows of method-of-victory, rounds, totals, or props anywhere |
| Backtestable bouts | **0.** `backtest-dataset-latest.json` → `rowCount 0` |
| Capture provenance | **No `capturedAt` or `availableAt` in any UFC artifact.** Only file-level `generatedAt` |
| Feature timing | Career aggregates as of build time — **they include the fight being predicted** |
| Settlement join key | `"|".join(sorted([norm(a), norm(b)]))` — no date, no event, no bout id |

The join key is the sharpest defect: **10 fighter-pair keys map to two different bouts each**, including
Pereira/Prochazka, Dvalishvili/O'Malley, and Du Plessis/Strickland. A rematch's pregame line is therefore
graded against a *previous* fight's result. The graded output is `1 win / 1 loss / 8 pending` — and both
decided rows are rematch collisions.

`status/ufc-graduation-decision.json` reached `DOWNGRADE_TO_SCAFFOLD_ONLY` independently, with all six
graduation requirements false. This audit confirms each of them.

**What it would take:** paid historical Odds API credits, a bout-id (or fighters + event date) join key,
and per-bout feature snapshots. Until then there is nothing to research — which is exactly why
`SCAFFOLD_ONLY` is more honest than `RESEARCH_ONLY`.

---

## Soccer — World Cup `HISTORICAL_ONLY`, everything else `DISABLED`

**The backtest is the most credible piece of modelling work in the repository, and it is a negative result.**

`data/internal/world-cup/projection-engine/backtests/2022-wc.json`, n = 64 (every 2022 World Cup match),
against a de-vigged closing market baseline with 64/64 coverage:

| | Brier | RPS | Log loss |
|---|---|---|---|
| Model | 0.5925 | 0.2079 | 1.0024 |
| **Market** | **0.5826** | **0.2071** | **0.9961** |
| Uniform baseline | 0.6667 | 0.2387 | 1.0986 |

The model beats uniform and **loses to the market on all three proper scoring rules**. The tuned variant
looks better in-sample (0.5881) but is worse under 5-fold CV (`cvImprovement −0.0375`) with a bootstrap CI
spanning zero — the gain is noise. The v2 form-augmented engine does not beat v1.

**Two settlement implementations.** `pipeline/world_cup/settle.py` grades 5 team markets from codes;
`app/src/lib/settlement/soccer-markets.ts` grades those 5 plus 4 player markets by fuzzy text matching.
They diverge on market coverage, selection format, extra-time policy, and what to do with an ungradeable
leg (Python silently `continue`s; TS keeps it pending). **Both wrote into the same directory with
incompatible schemas** — files through 2026-06-20 are Python-shaped, files from 2026-06-23 are TS-shaped.
Result: **192 of 385 graded legs (50%) were left permanently pending.**

This is why `SportAdapter.settleMarkets` documents that a second implementation is a defect rather than
redundancy.

**Live state is dead:** `projections/latest.json` has `matchCount 0` since 2026-07-21. No xG, no injury
data anywhere, and `lineupsReady: true` is backed by **2 fixtures**.

**EPL / Champions League / MLS:** `soccer_epl` appears in this repository exactly 20 times, all of them
inside `odds-discovery-*.json` — entries in a catalog returned by a free API listing call. No odds were
ever fetched, there is no `pipeline/epl/`, and Champions League does not appear even in the catalog.
`SCAFFOLD_ONLY` would be too generous: there is no scaffold.

---

## NBA — `HISTORICAL_ONLY`

3,635 decisive settled leans over 2026-05-15 → 2026-06-13 with a reconstructable de-vig baseline. That is
a genuine historical asset, and it is unflattering:

- Lifetime hit rate **0.4908** — below a coin flip.
- **903 of 4,592 settled rows (~20%) are `invalid`.** 3PM, PRA, STL and BLK are 100% invalid — a
  settlement-join gap, not variance.
- Model Brier is worse than the de-vigged market in **every** settleable family (REB +0.0069, PTS +0.0354).

`fullyResearchEligibleDates: 0`. Tip-off is stored as display text (`"8:30 PM ET"`), so `capturedAt < tipoff`
cannot be proven for a single date. Separately, the 16 settled dates used for out-of-sample evaluation are
the same window calibration was fit on.

Current state: `board.json` today reports `dataMode: "ScheduleUnavailable"`, `scheduleProviderStatus: "failed"`,
`stats.nba.com` read-timing-out. The season ended 2026-06-13; next games ~October 2026.

---

## What this audit changes

1. **`FULL_MODEL` is unreachable today, and the contract says so.** `deriveReadiness` caps any sport with a
   single identity collision, a second settlement implementation, or zero provable pregame captures —
   regardless of how good everything else looks.
2. **Losing to the market is a publishable result.** Two sports have now been measured against a real
   de-vigged baseline and lost. Both results are recorded rather than buried.
3. **Ordering by opportunity is inverted from the obvious.** The instinct is EPL → UCL → World Cup → MLS.
   Only the World Cup exists, and its model already lost. The highest-value work is not a new sport; it is
   per-row capture provenance for the sport that already has settled outcomes.

---

## Recommended order of work

1. **Per-row `capturedAt` + `eventStart` on MLB market rows**, enforced by `isLeakageSafe` at the ingest
   boundary. This is the prerequisite for every research claim in every sport.
2. **Collapse soccer's two settlement implementations into one**, then resolve the 192 pending legs or
   record them as permanently ungradeable. Currently the answer depends on which script ran.
3. **Replace UFC's name-pair join** with bout id or (fighters + event date). Cheap, and it unblocks the
   10 known-corrupt rows immediately.
4. **NBA tip-off as ISO**, so the 3,635 settled outcomes become research-eligible instead of merely settled.
5. **Do not add a sport** until at least one existing sport has provable per-row provenance.
