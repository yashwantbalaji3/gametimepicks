# Research row lineage contract

Per-row provenance for the MLB settled research corpus. Additive sidecar; the official settlement
ledger is never modified.

- Schema id: `research-row-lineage-1` (`ROW_SCHEMA_VERSION`)
- Lineage gate: `settlement-lineage-gate-1` (`LINEAGE_GATE_VERSION`)
- Model schema: `mlb-board-lean-1`
- Code: `app/src/lib/research/row-lineage.ts` (pure), `app/src/lib/research/row-lineage-loader.ts` (I/O)
- Exporter: `app/scripts/build-research-row-lineage.mjs`
- Guard test: `app/src/lib/research/row-lineage.test.mjs`

## 1. Why

`app/public/data/mlb/results/settled_leans.jsonl` records `id`, `date`, `gamePk`, `marketKey`, `line`,
`lean`, `outcome`, `projection`, `edgePct`, `confidence`. It records **nothing** about:

- which real-world event a row belongs to (a `gamePk` is a provider alias, not an identity),
- which provider records the row was assembled from,
- when the price was observed relative to first pitch,
- which official source produced the outcome,
- whether a lineage gate ever examined the row.

Sprint 044 measured what that costs: three historical event-identity collisions produced **49 settled
legs graded against the wrong box score**. All three were doubleheaders; both halves share rosters, so
the wrong grades came out as plausible Win/Loss rather than as errors. A settled result that cannot be
traced prediction → event → market → official source is unfalsifiable, and an unfalsifiable win rate is
not evidence.

## 2. Hard rules

1. **The ledger is read-only.** This sidecar can be deleted and rebuilt without touching one settled
   result. Rewriting the ledger to add provenance would mean editing settled history to look better
   documented than it was.
2. **Pregame timing may come only from an artifact captured before the event.** `capturedAt`,
   `availableAt` and `eventStart` are populated from a pregame archive or from a board row that carries
   its own stamps. They are never reconstructed from settlement, a box score, a file-level
   `generatedAt`, or a scheduled start read afterwards.
3. **Provider references are never inferred from names.** The pregame join requires a `playerId`; a
   display name returns `null` from `pregameJoinKey`. Two players share "Luis Garcia".
4. **Ambiguity resolves to null, never to a guess.** Both the event-identity index and the pregame
   observation index are built on `buildAliasIndex`, which refuses an alias touched by a many-to-one
   mapping in either direction.
5. **Nothing is deleted.** Ineligible, unstamped and withheld rows are retained and labelled. Deleting
   them destroys the audit trail that makes the exclusion provable.

## 3. Coverage states (six-state policy)

| State | Meaning | Row-level claim | Counts in aggregates |
|---|---|---|---|
| `PROVEN_STAMPED` | The row's own source record carries capture time and event start inline | yes | yes |
| `PROVEN_SIDECAR` | Timing proven via a separately captured pregame artifact, joined on provider IDs | yes | yes |
| `LEGACY_UNSTAMPED` | Reachable and gradable, but no pregame artifact covers it | **no** | yes (denominator must be shown) |
| `QUARANTINED` | Withheld by an integrity gate, at date or row scope | no | **never** |
| `CONFLICTED` | Identity or lineage refused — sources disagree about which event this is | no | **never** |
| `UNAVAILABLE` | No board row, or the artifacts were unreadable | no | **never** |

`LEGACY_UNSTAMPED` is the majority state and is expected to stay that way for the pre-archive corpus.
It is the honest answer, not a gap to be filled in. `CONFLICTED` is separated from `QUARANTINED`
because "we refused this slate" and "these two sources disagree" call for different fixes, and
collapsing them is how a quarantined slate quietly re-enters a hit rate.

Derivation order (`deriveRowLineage`): no board row → `UNAVAILABLE`; quarantine note →
`QUARANTINED`; identity refused or gate verdict `REFUSED` → `CONFLICTED`; board carries inline stamps →
`PROVEN_STAMPED`; a pregame observation with an allowed source kind and the ID join method →
`PROVEN_SIDECAR`; otherwise `LEGACY_UNSTAMPED`.

## 4. Envelope

```
rowSchemaVersion        "research-row-lineage-1"
rowId, date, sport, league
eventId                 canonical id from lib/identity; null when CONFLICTED
providerRefs[]          { provider, id, kind } — statsapi gamePk + odds-api event id
identityMethod          how the id was reached (recorded so "matched on name" would be visible)
identityRefusedReason   null when resolved
market                  { key, label, line, side, registryStatus }
pregame                 { capturedAt, availableAt, eventStart, sourceRef, sourceKind,
                          joinMethod, snapshotRef, noVigProbability }
pregameEligibility      { verdict, reason, researchEligible }   ← derived by lib/identity/provenance
settlement              { outcome, sourceRef, sourceType, gradedAgainstId, finalizedAt }
lineage                 { verdict: PASS|REFUSED|NOT_EVALUATED, gateVersion, violations[] }
model                   { modelSchemaVersion, calibrationVersion }
coverageState           the six-state value
rowLevelClaimAllowed    true only for PROVEN_*
countsTowardRates       false for QUARANTINED / CONFLICTED / UNAVAILABLE
quarantine              { scope, reason, sourceRef } | null
```

`pregameEligibility.verdict` is one of `ELIGIBLE`, `POST_EVENT_CAPTURE`, `UNPROVABLE_TIMING`,
`NO_PROVENANCE`, `MALFORMED` (from `lib/identity/provenance.ts`) or `UNKNOWN` when no pregame artifact
covers the row at all. `PROVEN_SIDECAR` and `ELIGIBLE` are independent: an archive can prove a capture
happened **after** first pitch, which is exactly what the eligibility gate exists to catch.

## 5. Sources joined

| Input | Path | Supplies |
|---|---|---|
| Ledger | `app/public/data/mlb/results/settled_leans.jsonl` | outcome, graded gamePk |
| Board | `app/public/data/mlb/boards/<date>.json` | the pregame row, probabilities, schedule rows |
| Pregame archive | `data/internal/mlb/pregame-archive/settlement-joins/<date>/<gamePk>.json` | `capturedAt`, `availableAt`, `eventStartTime`, `sourceSnapshotIds`, `officialSource`, captured no-vig |
| Row refusals | `data/internal/mlb/research-quarantine/<date>.json` | per-observation withholding |
| Public contract | `app/public/data/research/terminal-summary.json` | date-level quarantines, market registry, calibrator version |

Joins:

- **ledger → board**: exact `id`.
- **board → event identity**: `gamePk` against the same board's StatsAPI schedule rows, via
  `identitiesFromSchedule` + `buildAliasIndex`. Start time to the minute separates doubleheaders.
- **board → pregame observation**: `gamePk | marketKey | playerId | line | side`
  (`PREGAME_JOIN_METHOD`). Any other join method is refused by `validateRowLineage` (`NON_ID_JOIN`).
- **refusal matching**: the quarantine artifact's own `observationId` shape,
  `date:gamePk:market:playerId:line`.

Assembly starts from the **board**, not the ledger: rows generated and never graded are absent from
the ledger entirely (Sprint 046), and enumerating the ledger would report a smaller universe whose
missing rows read as if they never existed.

## 6. Guard (`validateRowLineage`)

| Code | Fires when |
|---|---|
| `PREGAME_TIMING_WITHOUT_SOURCE` | timing present with no pregame `sourceRef`/allowed `sourceKind` |
| `UNSTAMPED_ROW_CARRIES_TIMING` | `LEGACY_UNSTAMPED` with a `capturedAt` or `eventStart` |
| `PROVEN_WITHOUT_TIMING` | `PROVEN_*` missing either stamp |
| `PREGAME_SOURCE_IS_SETTLEMENT` | the pregame and settlement source refs are the same record |
| `NON_ID_JOIN` | a pregame observation attached by anything but the ID join |
| `WITHHELD_ROW_COUNTED` | `QUARANTINED`/`CONFLICTED`/`UNAVAILABLE` with `countsTowardRates: true` |
| `REFUSED_IDENTITY_CARRIES_EVENT_ID` | `CONFLICTED` presenting an `eventId` |
| `ROW_CLAIM_WITHOUT_PROVENANCE` | `rowLevelClaimAllowed` on a non-`PROVEN_*` row |
| `MISSING_SCHEMA_VERSION` | envelope declares a schema this build does not understand |

The exporter refuses to write when any envelope produces a violation.

The guard is asserted by **mutation**, not inspection. `row-lineage.test.mjs` rewrites
`row-lineage.ts` on disk to backfill `eventStart` from `settlement.finalizedAt`, runs a probe in a
child process (tsx caches transpiled `.ts` by path, so an in-process re-import returns the unmutated
module), asserts the probe reports `BACKFILLED|REJECTED` — the mutation applied *and* the guard bit —
then removes the guard's own check to observe the same backfill sailing through, and restores the file
with a SHA-256 byte-identity assertion. A third mutation replaces `playerId` with `playerName` in the
join key and asserts the lookup returns `null`: a name join must lose the provenance, never acquire
another player's.

## 7. Artifacts

```
app/public/data/research/row-lineage/index.json         coverage per slate, every state, every date
app/public/data/research/row-lineage/gap-history.json   settled model-vs-market difference table
app/public/data/research/row-lineage/<date>.json        envelopes a row-level claim is allowed on
data/internal/mlb/research-row-lineage/<date>.json      every envelope for that date (public: false)
```

Per-date files exist only for dates the pregame archive covers. Every other date appears in
`index.json` with `rowLevel: false` and its rows counted as `LEGACY_UNSTAMPED`. That is the policy, not
a size optimisation: a date with no capture record cannot support a per-row claim, so no per-row file
is published for it.

The public per-date file carries only `rowLevelClaimAllowed` rows; `coverage` on the same file
describes the **whole** slate, so a reader can always see how many rows were left out. The internal
file carries all of them, because deleting the excluded rows would make the exclusion unprovable.

## 8. Running it

```bash
cd app
npx tsx scripts/build-research-row-lineage.mjs --self-test              # counts + guard, writes nothing
npx tsx scripts/build-research-row-lineage.mjs                          # dry run
npx tsx scripts/build-research-row-lineage.mjs --now <ISO> --write      # emit
npx tsx --test src/lib/research/row-lineage.test.mjs
```

`--now` pins `generatedAt` so a rebuild on unchanged inputs produces byte-identical files. Omit it and
every run rewrites the timestamp.

## 9. Current state (2026-07-27 settled, boards through 2026-07-29)

- 27,142 generated rows across 58 boards.
- `PROVEN_SIDECAR` 1,426 · `LEGACY_UNSTAMPED` 24,975 · `QUARANTINED` 741 · `PROVEN_STAMPED` 0 ·
  `CONFLICTED` 0 · `UNAVAILABLE` 0.
- Row-level files for 2026-07-21 → 2026-07-28. 2026-07-21 has zero proven rows (the archive has no
  matching capture) and 2026-07-28 is entirely withheld; both publish a file saying so rather than
  disappearing.
- `PROVEN_STAMPED` is 0 because no MLB board stamps its rows. The state exists so the day boards start
  carrying `capturedAt` the contract needs no schema change — and so nobody is tempted to reach for
  `generatedAt` in the meantime.

## 10. Extending to another sport

`row-lineage.ts` imports MLB only through `lib/identity/mlb-adapter`. A new sport needs: an adapter
producing `EventIdentity` values, a pregame artifact carrying a per-row `capturedAt` and an event
start, and an ID-based join key. Until those exist, its rows are `LEGACY_UNSTAMPED` — which is the
correct published answer, not a blocker.
