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

## Provider event mismatch (2026-10-05)

**What went wrong.** The MLB pregame capture mapped Odds-API events to a `gamePk` by `away|home` with no date. A
settlement-join file could therefore hold `marketRows` captured for the next day's series game, or for the other half of
a doubleheader, all stamped with this file's `gamePk`. MLB's read-only scan on 2026-10-05 found 31,483 such rows in
416 of 913 files. Of those, 3,871 are confirmed mis-joins (2,728 different-day and 1,143 other doubleheader game),
25,146 started within 30 minutes of the file's game and are probably the same game under a reissued id, and 2,466
foreign events could not be dated. Read as-is, each row lent its capture time and price to a board row of the
wrong game.

**Rule (fail closed).** A `marketRow` whose `providerEventId` differs from its file's own `providerEventId` is **not
pregame evidence** for that file's game (`rowBelongsToFile`). The file itself says which rows these are, so no
hand-kept list exists that could drift or fail open. A file with no own id proves no mismatch and is read as before.
Nothing is re-joined to a "right" game, because that would be a guess (rule 4), and **no archive file is changed**
(rule 5). Per-date counts are published as `foreignRowsExcluded` in `index.json`.

**A file's own id is not proof by itself.** MLB found that a file's own `providerEventId` can also be a mis-stamp. 406
files have an own event that cannot be verified as their game, and 258 of them share their own id with a different
`gamePk`'s file (for example 2026-07-22/822784 and 2026-07-23/822785 both claim `36ba7a8a…`). A file whose own event
is unverified vouches for **no** row: its own-id rows and its id-less rows are excluded too (`unverifiedOwnRowsExcluded`
in `index.json`). Either of two sources marks a file unverified:
1. the archive itself, when the file's own id is the own id of another `gamePk`'s file. This needs no list, and it
   covers all 258 shared-id files;
2. MLB's receipt `ownEventUnverified[]`, which adds the files whose own event fails MLB's other checks (no provider
   record, not on the board, a doubleheader, and so on).

**The one way back in.** `data/internal/mlb/reference/provider-event-aliases.json` is MLB-owned, written by
`app/scripts/mlb/build-provider-event-aliases.mjs`, with schema `mlb-provider-event-aliases-1`. Its `aliases[]`
(`{ foreignProviderEventId, gamePk, evidence }`) admit a foreign id for exactly its one `gamePk`, and only on MLB's
recorded evidence: same clubs, provider start within 30 minutes, no second meeting that day, and the id is not another
game's own event. An id listed for two games admits nothing, and nor does a receipt with any other `schemaVersion`.
Nothing re-admits an own-id row from an unverified file. While the receipt is absent there are no aliases and only
check 1 runs.

**Re-admission is limited to the 74 aliases the founder approved** (Yash, 2026-10-06 00:31Z, "Option A, Strict 74").
They are listed as exact (foreign id, gamePk) pairs in `app/src/lib/research/approved-provider-event-aliases.ts`. Each
passed MLB's six rules and also appears, with the same clubs and start, in the provider's own daily event listing for
that date. A foreign row returns only when MLB's receipt and that list both name the same pair
(`approvedReadmissions`). A receipt alias outside the list, or naming a different game, admits nothing. The 3 ids
that pass the six rules but are missing from the daily listing (2026-08-03 STL @ NYY 823520, 2026-08-03 WSH @ PHI
823431, 2026-08-28 CIN @ CHC 824638) stay excluded and are never inferred from name or time similarity. Adding a pair is
a reviewed code change. Re-admission affects research labels only; public picks, settlement, the Forecast Ledger and
published results do not read the list.

**The settlement-lineage gate now runs on every row whose archive file carries an official settlement**, not only on
rows that have a pregame observation. The gate's subjects (official source, `fetchedAt`, event start, provider event)
all come from the join file, not from the pregame observation, so requiring one was a gap. It hid 49 rows whose
archived box score was fetched **before their own first pitch**, the doubleheader signature. Those rows are now
`CONFLICTED`.

**Effect on 2026-10-05 data** (69 row-level dates):
- `PROVEN_SIDECAR` drops from 13,426 to **7,329** without MLB's receipt. With the receipt (measured against MLB's
  preview, re-admission off) it drops to **6,327**, because the receipt flags more files whose own event is
  unverified. With MLB's Strict-74 receipt and the 74 approved aliases re-admitted it is **8,103**. This count is the per-date "N of M rows have a pregame capture record" on `/markets`. It drops on 52
  of 69 dates without the receipt, and on 56 with it. 2026-10-04, the date `/markets` showed on 2026-10-05, is
  unchanged at 40.
- `CONFLICTED` rises from 73 to 122.
- The official ledger and every published result are untouched.

Guard: `app/src/lib/research/row-lineage-misjoin.test.mjs`. It checks one file per scan class against MLB's scan as
the oracle, plus alias semantics, the shared-own-id rule (MLB's 822784 and 822785 example), the per-date counts, and that no
archive file is modified.
