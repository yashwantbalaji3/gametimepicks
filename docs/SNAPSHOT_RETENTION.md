# Snapshot retention — measured evidence, and the architecture it justifies

Sprint 032, Phase 4. **Design only. Nothing in this document is implemented, and no movement claim
is shown to users today.**

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

## Proposed shape (not built)

```
app/public/data/mlb/team-markets/<date>.json                  # unchanged — the current picture
data/internal/mlb/market-archive/<date>/<ISO>.json            # NEW — retained captures, internal
```

- Written by the existing ingest, additively. The current artifact keeps being regenerated in place;
  retention is a second write, so nothing downstream changes and no money path is touched.
- `public: false`, so `prune-internal-routes.mjs` already sweeps it out of the export. Retention
  starts internal and stays internal until there is enough history to say something true.
- **Forward-only.** Do not backfill from git history to manufacture a starting corpus. Git happens
  to hold prior captures, but reconstructing a series from commit archaeology produces a record whose
  gaps are invisible — which is worse than no record.
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
