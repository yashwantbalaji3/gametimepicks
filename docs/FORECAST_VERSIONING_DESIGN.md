# Forecast versioning (P0D) — design note, shared NBA and NFL

Status: DESIGN, 2026-11-11. This follows the founder directive of ~20:05Z and is local only: no code ships from this
note, nothing is public, and no grading rule changes until a release plan is approved. It builds on:
- the injury monitor's stale flags (`docs/INJURY_MONITOR_STALE_FLAGS_PHASE1.md`);
- #1323's post-freeze availability note.

## 1. Principle
A published forecast is **never edited**. A changed forecast is a **new version** in an append-only chain. At any
instant exactly one version per game is **current**, and exactly one version per game is the **version of record**
for grading. Both are *derived* from the chain by a pure rule. Neither is a mutable pointer anyone can set.

## 2. The version chain (immutable, per game)
One append-only file per game: `app/public/data/<sport>/forecast-versions/<date>/<eventId>.json`
(schema `gtp.forecast-versions@1`). Each version record:

| Field | Meaning |
|---|---|
| `version` | 1, 2, 3, … (never reused) |
| `versionId` | sha256 of the version's canonical forecast payload: the exact numbers published |
| `supersedes` | the previous version's `versionId` (`null` for v1) |
| `createdAt` / `approvedAt` | when the candidate was built, and when it passed approval (§4); both from inputs, never wall-clock-generated in the file |
| `method` | method id and version, and its **validation status** at approval (e.g. `nba-official-v0.1 VALIDATED`) |
| `inputHashes` | sha256 of every input: schedule, injuries capture (+ `sourceAsOf`), roster capture, depth chart, model params, team inputs. The version is reproducible from these. |
| `trigger` | `INITIAL`, or `MATERIAL_STALE_EVENT` with the stale-flag keys it answers |
| `payloadRef` | the frozen payload, e.g. today's lane game object; NFL board snapshot |
| `state` | `PUBLISHED` or `WITHHELD`, with the reason |

**Today's frozen lane and boards are v1.** v1 is written by back-reference (its `versionId` = the sha the stale flags
already record as `forecastSha256`), so nothing frozen moves.

## 3. "Current" — exactly one at any time
`currentVersion(chain, t)` returns the highest `version` with `state = PUBLISHED` and `approvedAt ≤ t`. If the newest
version is `WITHHELD`, there is **no current published forecast**: the game shows its withheld reason, never an older
number presented as current. Every site page and every social package calls this one function. A page shows the
current version and links its history. A superseded version is never shown as current.

## 4. Triggers — when a new version may exist
1. **A material stale event** (a game flag) for the current version **requests** a candidate.
2. A candidate may be produced **only by a VALIDATED method**: the same method the current version used, re-run on new
   inputs, or another method whose validation status is VALIDATED. An experimental method (the NFL QB fallback, the
   joint challenger, the QB-aware outcome challenger) **never** produces a version of the official chain. It has its
   own private research ledger.
3. **Until a validated candidate exists, the flagged game is WITHHELD** with its reason. Concretely, a `WITHHELD`
   record is appended with the stale-flag keys and a reason such as "Paul George ruled out after this forecast;
   forecast being re-run". Game-level posts stay refused (the stale-flags contract).
4. **Approval:** an automated gate. The method is validated, the inputs are timestamped before the cutoff, the
   candidate passes the same publication checks as v1 (eligibility@1, roster integrity, conservation), and the payload
   differs from the current version (§6). No human step is needed for a re-run of the same validated method. A
   **method change** is a founder decision and never goes through this path.

## 5. Cutoff and protected windows
- **Cutoff:** no version is created at or after **start − 15 min** (tip or kickoff). The last version before the cutoff
  is final.
  - 15 minutes is one 5-minute poll tick, plus a re-run (NBA lane about 1 minute, NFL board about 1 minute), plus the
    page and console pickup, with margin.
  - Without it, a version could land after social posts have gone out against an earlier one.
- **Protected windows** (memory: captures and posting windows restrict Production builds, never progress): versions
  may still be **created and approved** inside a protected window. Their **Production page build** follows the window's
  build policy. Social posts use `currentVersion` at send time, which the console reads locally, so a new version
  affects posting immediately even when the page build waits.

## 6. Duplicate suppression and rate limits — from evidence, no fixed "one refresh"
Evidence: `scripts/research/nba/material-event-history.mjs`. It replays every committed NBA lane (22 dates, 170
games, 122 captures) through the stale-flags rule.
- **24 of 170 games (14%) had at least one material post-freeze event.** **8 of those 24 had 2–3**. A one-refresh limit
  would have left a third of the affected games stale after their later events, so it is **not used**.
- **Gaps between material events in the same game:** median 6 minutes, and **8 of 11 within 15 minutes** (bursts, e.g.
  Turner 19:03Z and Grimes 19:06Z tonight). The maximum was 90 minutes.

Rules:
- **Coalescing window: 15 minutes.** After a material event, wait until either 15 minutes pass or the next capture
  arrives with no further material event in that game, whichever is first. Then build **one** candidate answering every
  event in the window. That absorbs about 73% of follow-on events into the same version.
- **Duplicate suppression:**
  - no candidate is built when the stale-flag keys are already answered by an existing version;
  - no version is appended when the candidate's `versionId` equals the current one (an identical payload);
  - no version is appended when the inputs that changed are not material.
- **Ceiling:** at most `1 + (number of distinct material events)` versions per game per day. On the evidence that is
  ≤ 4. It is a ceiling, not a target: it stops runaway loops (a flapping status), not legitimate refreshes. A flapping
  status (Out → available → Out) is coalesced by the window, and each completed flip counts as an event.

## 7. Which version grades — precise and immutable
- **The version of record** for a game is `currentVersion(chain, start − 15 min)`: the current published version at the
  cutoff. It is fixed forever once the cutoff passes, because the chain is append-only and nothing may be appended after
  the cutoff.
- If that instant has no current published version (the newest is `WITHHELD`), the game has **no version of record**.
  It is excluded from the official grade with the reason, and counted in the exclusions.
- **Every published version is reproducibly gradable.** Its payload and `inputHashes` are stored, and the grader can
  score any `versionId` against the final. The official record grades only the version of record. Superseded versions
  are graded in a separate, labelled "superseded versions" ledger, for transparency about what changed and whether it
  helped. They are never pooled into the official record.
- This replaces "the frozen forecast" in the grading rule only through a release-gated change, with its own approval.
  Until then the existing rule stands, and v1 is the version of record.

## 8. How it composes with what exists
| Existing piece | Role under versioning |
|---|---|
| **Stale flags** (`gtp.stale-flags@1`) | The trigger. Each flag names the `forecastSha256` it judged, which is the `versionId`. A newer approved version **clears** the flags it answers (`NEWER_VERSION`, already implemented and tested). |
| **#1323 post-freeze availability** (`gtp.nba.post-freeze-availability@1`) | The page note for a version that is not superseded: "ruled out after this forecast froze". Once v2 exists, the note belongs to v1's history view, and the current page shows v2. Its file stays as written. Long term it can be derived from the stale flags, since every #1323 change is a player-flag event. |
| **Social console** (bb-social) | Package builders call `currentVersion` and `postAllowed`. The send-time recheck refuses when the package's `versionId` ≠ the current version, or any active flag applies. |
| **NFL boards and the receipt of record** | An NFL board snapshot is a version payload. The receipt of record (latest before kickoff) maps to the version of record at the cutoff. |

## 9. Not in scope here
- Building the chain store.
- Wiring pages.
- Changing the grading rule.

Each is a release-gated step after #1323 and #1326, planned separately.
