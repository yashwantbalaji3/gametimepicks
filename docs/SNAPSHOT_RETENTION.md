# Snapshot retention — measured evidence, and the architecture it justifies

Sprint 032, Phase 4. **Design only. No movement claim is shown to users today.**

> ## CORRECTION — 2026-07-27, founder review
>
> **Two claims in the original version of this document were wrong.** A deeper audit found that a
> market snapshot writer already exists and has been running since 2026-07-22.
>
> `app/scripts/capture-mlb-pregame-markets.mjs` writes to
> `data/internal/mlb/pregame-archive/market-snapshots/<date>/<captureId>/` — **16 captures per day**,
> 102 manifests committed across 6 dates. Each capture writes three files:
>
> | File | Contents | Committed? |
> |---|---|---|
> | `raw.json` | full provider body + `capturedAt` + `rawHash` | **No — gitignored** (`.gitignore:87`) |
> | `normalized.json` | de-vigged records + `capturedAt` + `normalizedHash` | **No — gitignored** (`.gitignore:88`) |
> | `manifest.json` | counts, hashes, credit usage — **no timestamp** | Yes (102 tracked) |
>
> **What this corrects:**
>
> 1. *"The market layer needs that contract ported, not a new design invented."* — Wrong. It is
>    already ported and running against odds. Nothing needs porting.
> 2. *"No row-level timestamps."* — Wrong for the internal capture. Every normalized record carries
>    per-row `capturedAt`, `availableAt`, `bookmaker`, `noVigProbability`, `deVigStatus`,
>    `researchEligible`, `eligibilityReason`, and full `provenance`. That is precisely the row-level
>    timestamping this document said was missing. It remains true of the **public** artifact
>    (`app/public/data/mlb/team-markets/<date>.json`), which carries one file-level `generatedAt`.
>
> **What survives unchanged:** the odds rows are still not durably retained. They are gitignored,
> and a 128 KiB size guard blocks them from the archive upload, so the payload survives only as a
> 90-day GitHub Actions artifact before being lost. The constraints below (first capture is not an
> opening line; two observations are not a trend; a missed window is a named gate, not a flat line)
> all still hold.
>
> **What this changes strategically:** Market Movement Intelligence is far closer than this document
> estimated. The expensive parts — capture cadence, de-vig normalization, row-level timestamps,
> leakage-safe eligibility — are **built and running**. The missing piece is a durable store that is
> not git. Measured payload: ~1.7 MB per team-market capture, ~1.0 MB per props capture, ~16 captures
> per day ≈ 20–25 MB/day. Committing that to git would add roughly 7 GB/year, so the gitignore is a
> *correct* decision and "un-ignore it" is the wrong fix. The right fix is deliberate persistence —
> compact normalized deltas, or object storage outside the repo.
>
> There is also a **recoverable window right now**: captures since 2026-07-22 still exist as Actions
> artifacts until roughly 2026-10-20.

## What was measured

Market artifacts are written one-per-slate-date and **regenerated in place**:

```
app/public/data/mlb/team-markets/<date>.json     # 10 files, one per date
```

`lib/markets/freshness.ts` states the cadence honestly — *"one artifact per slate date, regenerated
in place"*. Each regeneration overwrites the previous capture. In the working tree, the earlier
reading is gone.

**But it is not actually lost.** Today's artifact was rewritten twice, and git retained both:

| Capture | `generatedAt` | Commit |
|---|---|---|
| First | `2026-07-27T16:02:09.738Z` | `fdc37bd2` |
| Second | `2026-07-27T16:35:04.082Z` | `293aafb4` |

Diffing those two captures — 33 minutes apart, 12 games in both:

```
moneyline moved: 3    run line moved: 4    total moved: 0

  Sea@Tex    ML home +113 -> +109
  Bos@Ath    ML home +144 -> +152
  Ari@Pit    ML home -109 -> -114
```

**Line movement is real, is occurring at meaningful frequency, and is currently being discarded by
the artifact layer.** The sprint brief says movement analysis may be allowed "only after evidence
exists." This is that evidence — and it says the *capture* is happening while the *retention* is not.

## The architecture already exists in-repo

*(See the correction above: this is even more true than originally written — the contract is already
applied to market captures, not only to StatsAPI features.)*

Do not invent a snapshot design. The pregame research archive already implements a correct one, and
it is running today — 96 snapshots across 12 games on 2026-07-27, 8 captures per game:

```
data/internal/mlb/pregame-archive/snapshots/<date>/<gamePk>-<ISO>.json
```

Each carries the fields a defensible retention layer needs:

| Field | Why it matters |
|---|---|
| `snapshotId` | Stable identity per capture |
| `snapshotCreatedAt` | When THIS capture happened — not when the slate is for |
| `snapshotReason` | `SCHEDULED_REFRESH` vs other triggers; a capture's provenance |
| `rawPayloadHash` / `normalizedPayloadHash` | Detects a no-op re-capture without diffing |
| `parserVersion` / `schemaVersion` | A reading is only comparable to one parsed the same way |
| `public: false` / `approvedForProduction: false` | Fails closed; swept out of `out/` at build |

That archive stores **StatsAPI features, not odds**. The market layer needs the same contract applied
to market captures. This is a port, not a design.

## What must be true before any movement is shown

The brief's constraint is the load-bearing part: **do not invent movement.**

1. **First capture ≠ opening line.** The pipeline's first observation of a day is whenever the
   workflow happened to run. Calling it "the opening line" fabricates a market event that was never
   observed. Retained snapshots must carry `snapshotCreatedAt` and nothing may relabel the earliest
   one as an open. A true opening line requires a source that publishes one.
2. **Row-level timestamps, not artifact-level.** Today the artifact carries a single `generatedAt`.
   A market that did not change between captures has an *older* effective timestamp than the file
   implies. Movement between two artifact-level timestamps is only defensible per row.
3. **Two captures are not a trend.** Three moved moneylines over 33 minutes is a fact about two
   observations. Direction, velocity, and "sharp money" framing are all inferences that this data
   cannot support, and the site has no business showing them.
4. **Gaps must be visible.** If the workflow misses a window, movement across that gap is
   unobserved, not absent. The gate vocabulary for this already exists — `PairingGate` — and a
   missing interval should read as a named gate, never as a flat line.

## Proposed shape — REVISED after the correction

The writer exists. What is missing is durable persistence of what it already produces.

```
data/internal/mlb/pregame-archive/market-snapshots/<date>/<captureId>/
    raw.json          # EXISTS, gitignored, lost after 90 days   <- persist this
    normalized.json   # EXISTS, gitignored, lost after 90 days   <- persist this
    manifest.json     # committed, but carries NO timestamp      <- add capturedAt
```

Three changes, in dependency order:

1. **Add `capturedAt` to `manifest.json`.** Cheapest and most valuable single change in this
   document. Manifests are already committed and already carry `normalizedHash`; adding the capture
   time makes the *committed* record sufficient to order captures in time and detect a no-op
   re-capture — without persisting a single odds row. Today ordering is only possible via filesystem
   mtime, which is metadata, not data, and does not survive a clone.
2. **Persist `normalized.json` outside git.** ~1 MB/capture, ~16/day. Object storage, or a
   compacted daily roll-up keeping only rows whose `normalizedHash` changed. Not git.
3. **Only then** consider a reader. Retention must run unread long enough to characterise the
   series.

- **Forward-only.** Do not backfill from git history to manufacture a starting corpus. Git happens
  to hold prior *public artifact* captures, but reconstructing a series from commit archaeology
  produces a record whose gaps are invisible — which is worse than no record. The one defensible
  exception is a **one-time rescue** of the Actions artifacts from 2026-07-22 onward, which are real
  captures with real timestamps and expire around 2026-10-20 — that is recovering a record that was
  genuinely written, not reconstructing one that was not.
- Movement analysis remains **unavailable** — not "coming soon" — until the retained series is long
  enough to be characterised. The `NOT_YET_MODELED` posture used by `lib/event-markets/` is the right
  precedent.

## Why this was not implemented in Sprint 032

Retention is cheap to write and expensive to get wrong. Writing snapshots is a few lines; deciding
what a series of them *licenses you to say* is the entire risk, and shipping the writer first creates
standing pressure to display something before the answer is earned. The measurement above is the
part that had to happen first, and it is now recorded.

The next step is the writer alone — no reader, no surface, no label — followed by a dormant period
long enough for the series to be worth characterising.
