# Public Beta — Operational Proof

**Status:** `WALL_CLOCK_OPEN` · **Owner:** whoever opens the next session · **Sport in scope:** MLB

Two claims about this platform cannot be closed by writing code. Both need a real scheduled run to
happen, be observed, and be recorded. This document is what a future session executes the moment that
run occurs — and, until then, what it is honest to say instead.

Nothing here is a gate on shipping. It is a record of what has and has not been observed.

---

## 1. The two open proofs

Both are tracked in `data/internal/mlb/integrity/operational-proof-observation-plan.json` and
re-derived on every run of `npm run ops:public-beta-observe`.

| id | Claim | State | Why it is still open |
|---|---|---|---|
| `clean-lineage-stamping` | A settlement has run **through** the lineage path and stamped its rows | `WALL_CLOCK_OPEN` | The only slate offered to the gate since it shipped was **2026-07-28**, which was correctly **refused**. The accepting path has therefore never executed — through no fault of the code. 0 of 22,660 ledger rows carry `eventId`. |
| `pipefail-live` | The corrected settlement orchestrator reports a real failure as a failure | `WALL_CLOCK_OPEN` | The `set -o pipefail` fix landed in `013fb3b7` *after* the last scheduled run started. No scheduled run has since encountered a failing step, so the corrected shell has not been observed failing naturally. |

**What is already proven and stays proven:** the lineage gate ran live and **refused** 641 rows on
2026-07-28 (`data/internal/mlb/integrity/settlement-lineage-live-proof.json`, Sprint 049). Refusal is
proven. Acceptance is not. Those are different claims and only one of them is closed.

### Standing evidence for `pipefail-live`

`scripts/automation_settle_pipefail_test.sh` is the standing proof and remains so until a natural
failure occurs. It is a deterministic **known-negative**: it reproduces the original defect (a failing
command inside a `| tee` pipeline reporting success) without `pipefail`, shows the same shape failing
correctly with it, and asserts the real orchestrator declares `pipefail` *before* its first piped step.

```bash
bash scripts/automation_settle_pipefail_test.sh
# ok — pipefail is set before the first piped step, and the known-negative reproduces the original defect
```

**Do not force it.** Corrupting production data to trigger a failure is not acceptable. The
known-negative is the correct substitute for a failure we have not been handed.

---

## 2. Observing the current state

One command. Read-only with respect to money; writes only the internal, non-public observation
artifact.

```bash
cd app && npm run ops:public-beta-observe
```

It reports the deployed SHA and build clock, the newest generated / settled / quarantined MLB dates,
lineage acceptance coverage for the newest settled date, prediction-history freshness, analytics mode,
and the two pinned money hashes. Output is written to
`data/internal/ops/public-beta-observation-<date>.json` and `data/internal/ops/latest.json`
(`public: false`).

Exit codes: **0** with warnings printed; **non-zero** only on a protected-hash mismatch or a
contradiction between artifacts (a settled date newer than the newest generated board, or a corpus
ahead of the ledger). A stale board and an unreachable production origin are warnings, not failures —
not knowing is not the same as being broken, and neither is being two days behind.

---

## 3. Reading the result honestly

| Field | Means |
|---|---|
| `lineage.state = NOT_YET_STAMPED` | The accepting path has still never run. **Not** a defect. |
| `lineage.state = COMPLETE` | §5.1 below is now runnable — this is the trigger. |
| `deployment.status = UNVERIFIED` | The marker could not be read. Says nothing either way. |
| `analytics.mode = OFF` | No build-time flag and no committed endpoint. Nothing leaves the browser. |
| `analytics.mode = STAGING` | Half-configured. The sink still resolves to NOOP (`sink.ts` requires both). |
| `verdict = FAIL` | Stop. A human resolves it. Nothing in this pipeline repairs a hash mismatch. |

---

## 4. What must NOT be said while these remain open

- Not "settlement is proven end to end." Refusal is proven; acceptance is not.
- Not "the orchestrator is proven to fail loudly." The fix is present and unit-proven; its natural
  proof is not.
- Not "2026-07-28 will be settled later." It is permanently unsettled by design, and regenerating its
  board would now be refused by the publication gate.

---

## 5. When the slate settles

### 5.1 Settlement-proof checklist

Run this in order, the morning after the first slate generated **under** the publication gate settles.
Every step is a check, not a fix. If a step fails, record the failure and stop — do not repair and
continue, because a repaired run proves nothing about the unrepaired one.

Set the target date once:

```bash
export D=<the settled date, YYYY-MM-DD>
cd /Users/yashwantbalaji/Downloads/gametimepicks
```

**1 — the workflow ran, and from the expected commit.**
The pipefail fix and the publication gate must both be in the tree the runner checked out; a run from
an earlier SHA proves nothing about the current one.

```bash
gh run list --workflow nightly-settle.yml --limit 5 \
  --json databaseId,headSha,conclusion,createdAt,event
git log --oneline -1 <headSha from the run>          # must contain the pipefail fix (013fb3b7 or later)
```

**2 — the command's exit status is the workflow's exit status.**
The defect this replaces was a green workflow over a failed settlement.

```bash
gh run view <databaseId> --log | grep -nE "SettlementLineageError|✓ MLB settlement completed|Process completed with exit code"
```
Expect: either a clean completion **or** a non-zero exit visible in the same log as the failing
command. A "✓ completed" line sitting above a raised error is the exact regression to look for.

**3 — no partial write.**
A settlement that half-wrote is worse than one that refused.

```bash
python3 - <<'PY'
import json, collections
rows = [json.loads(l) for l in open("app/public/data/mlb/results/settled_leans.jsonl") if l.strip()]
ids = collections.Counter(r["id"] for r in rows)
print("rows", len(rows), "| duplicate ids", sum(1 for _, c in ids.items() if c > 1))
PY
```
Expect: `duplicate ids 0`, and a total row count that grew by the whole slate, not part of it.

**4 — the lineage gates ACCEPTED, and the rows carry the stamp.**

```bash
cd app && npm run ops:public-beta-observe
```
Expect `lineage.state = COMPLETE` for `$D` — every row carrying `eventId`, `providerEventId`,
`eventStartTime` and `settlementSource`. `PARTIAL` is a failure of this step, not a pass: a
half-stamped slate means some rows travelled around the path.

**5 — 2026-07-28 stays quarantined.**

```bash
grep -c '"date": "2026-07-28"' app/public/data/mlb/results/settled_leans.jsonl   # expect 0
```
Expect `0`, and the observation artifact still listing `2026-07-28 PERMANENTLY UNSETTLED` under
`mlb.quarantines.settlement`. A quarantined date quietly acquiring rows is the single worst outcome
available here — it would mean predictions graded against the wrong half of a doubleheader.

**6 — the downstream artifacts refreshed on the same run.**
The Sprint 048 defect was an exporter that silently froze while everything reported healthy.

```bash
cd app
npx tsx scripts/check-learning-freshness.mjs
npx tsx scripts/build-public-research-contract.mjs --self-test
```
Expect: freshness `asOfSettledDate == $D` with `lagDays 0`, and the contract self-test passing with the
quarantine still explicit.

**7 — the protected hashes are unchanged.**

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
md5 -q app/public/data/mr-dub/portfolio.json           # affe6b21071f2b3be96bb2774eb347c3
md5 -q app/public/data/mr-dub/bank-builder-locks.json  # cb80473f88f3cb5f67208fa568925295
```
Settlement of the research corpus must not move money. A mismatch here stops everything; it is never
repaired to make a checklist pass.

### 5.2 Recording the outcome

If steps 1–7 all pass, the `clean-lineage-stamping` proof is **closed by observation**. Record it:

- move the entry from `openProofs` to `closedThisSprint` in
  `data/internal/mlb/integrity/operational-proof-observation-plan.json`, citing the run id, its
  `headSha`, the date settled, and the stamped row count;
- keep this document's §1 table, changing only the state — the history of what was open and why is the
  point of it;
- do **not** infer anything about `pipefail-live` from a *successful* run. A run that did not fail
  cannot demonstrate that failures are reported.

If any step fails, the proof stays `WALL_CLOCK_OPEN`, the failure is written into `openProofs[].why`
verbatim, and the next scheduled run becomes the next opportunity.

---

## 6. Related

- `data/internal/mlb/integrity/operational-proof-observation-plan.json` — the machine-readable plan
- `data/internal/mlb/integrity/settlement-lineage-live-proof.json` — the closed refusal proof
- `scripts/automation_settle_pipefail_test.sh` — the standing known-negative
- `app/scripts/public-beta-observe.mjs` — the observation runner
- `app/src/lib/public-beta-observation.test.mjs` — its guards
- `docs/ANALYTICS_ACTIVATION_DECISION.md` — analytics stays OFF until this is signed
