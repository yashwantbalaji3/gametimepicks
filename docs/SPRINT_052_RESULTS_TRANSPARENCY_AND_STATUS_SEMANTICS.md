# Sprint 052 — Canonical Outcome Accounting & the Legacy Status-Semantics Audit

**Starting SHA:** `3f22ea60` → synced to `063fe5a9` (1 bot commit) · **Date:** 2026-07-29 11:46 ET

Sprint 051 found the site-wide header calling a refused slate "settled" because a graded *file* existed.
This sprint asked the obvious follow-up — **where else does the codebase do that?** — and built the
accounting layer that makes `/results` capable of telling the truth about a population the settled
ledger is structurally silent about.

---

## 1. The legacy status-semantics audit

`npm run audit:status-semantics` scans `app/src` and `app/scripts` for decisions made from file
presence *near* a state word, and classifies each finding.

| | |
|---|---|
| Findings | **48** |
| `FALSE_EXISTENCE_DERIVED` (high) | **0** |
| Reviewed clean (`CORRECT_CONTENT_DERIVED`) | **5** |
| Still `AMBIGUOUS` — unreviewed | **43** |

**The honest headline: 43 sites have not been read yet.** `reviewed: false` in the artifact means
nobody has looked, not that the site is fine. Promotion to any verdict requires a human opening the
file, and the artifact records which findings got that treatment.

### What was reviewed, and what it showed

| File | Verdict | Why |
|---|---|---|
| `slate-status-bar.tsx` | CORRECT | Fixed in Sprint 051 — consumes `getOptimizerSettledDates()` |
| `parlay-results.ts` | CORRECT | Presence and settlement are now two separate questions, both answered |
| `public-contract-adapter.ts` | CORRECT | Missing artifact → UNAVAILABLE, never READY |
| `markets/freshness.ts` | CORRECT | Derives from `artifactDate` vs the ET date; explicit UNAVAILABLE and ANOMALY states |
| `today/daily-brief.ts` | CORRECT | `lastUpdatedIso` is a max over *ready simulations*, not a file timestamp |

The last two were **scanner false positives** — flagged because `generatedAt` sits near a state word.
That is the correct bias for a lead generator: over-report, then read. A scanner tuned to avoid false
positives would have missed the Sprint 051 defect too.

### The rule the audit enforces

> Settlement is a property of **decided content**.
> Freshness is a property of **authoritative timestamps** plus an expected lifecycle.
> Readiness is a property of **required stages** completing.
> Availability is a property of **supported data**, not of a file being on disk.

---

## 2. Canonical outcome accounting

`src/lib/research/results-accounting.ts` starts from the **generated population** — the board — because
the settled ledger is authoritative for what was *graded* and silent about everything else. Rows that
were generated but never gradable are not written to it at all (Sprint 046), so a page that starts from
the ledger reports a smaller population than existed and the missing rows read as if they never
happened.

```
generated = wins + losses + voids + pending + unavailable + passes + gap
```

`gap` must be zero for a clean completed date. A non-zero gap is reported as a defect, never absorbed.

**Verified against the three real committed slates** (2026-07-25/26/27): every one reconciles to
**gap 0**, with rows the ledger never wrote recovered as `unavailable`.

### What it refuses to do

- **A missing row is never a loss.** Unresolved rows are `pending` or `unavailable`, and both say
  "Not a loss." in their public definition.
- **A quarantined slate exposes no rate of any kind** — `null`, not zero. Zero is a measurement;
  this is the absence of one. Quarantine wins even if settled rows happen to exist.
- **0/0 is `null`, never 0%** — rendering 0% would read as "we lost everything."
- **Legacy rows are labelled, never retro-stamped.** A slate whose settled rows lack `eventId` reports
  `LEGACY_LINEAGE`; claiming `VERIFIED_LINEAGE` would manufacture evidence that never existed.
- **Pending on a live slate is not a defect**; pending on a *completed* slate is `PARTIAL` and says so.

---

## 3. Operational proofs — both still OPEN

No settle run occurred during this sprint. The most recent started 2026-07-29 10:07 UTC on `9fc71547`,
before the pipefail fix landed at 10:11 ET. **0 of 22,660** ledger rows carry `eventId`.

Next opportunity: 2026-07-30 05:30 UTC, when the 2026-07-29 board — the first generated under the
publication gate — becomes eligible.

---

## 4. Validation

**3340 / 3336 pass / 0 fail / 4 skip** · typecheck 0 · build 0 · Python 14/14 + 18/18 · health 18/18 ·
semantics + contract + pipefail self-tests green · money `c5b425a1…` and locks `cb80473f…` unchanged,
0 money artifacts touched, `vp/` untouched.

---

## 5. Status of every claim

### PROVEN
- The accounting identity closes to zero on all three real completed slates.
- Rows absent from the ledger are recovered and never become losses.
- A quarantined slate cannot expose a hit rate through this layer, even with settled rows present.
- Legacy lineage is labelled rather than stamped.
- Five status-derivation sites were read and are content-derived; two were scanner false positives.

### MEASURED BUT NOT PROVEN
- That **no** high-severity existence-derived defect remains. 43 findings are unreviewed. The audit
  found zero *confirmed* high-severity issues, which is not the same as there being none.

### OPEN OPERATIONAL PROOF
- pipefail live-proof; clean lineage-stamping. Both need a real scheduled run.

### LEGACY LIMITATION
- Every settled row predates canonical lineage, so every historical date reports `LEGACY_LINEAGE`. This
  resolves forward, one clean settlement at a time — not retroactively.

### BLOCKED
- Nothing.

### FUTURE WORK
- Rendering `/results` on this adapter; triaging the remaining 43 findings; homepage and `/today`.

---

## 6. Launch-readiness matrix

| Dimension | Verdict | Evidence |
|---|---|---|
| Results accounting | 🟢 GREEN | gap 0 on three real slates, 15 tests |
| Quarantine | 🟢 GREEN | no rate exposed, visible in status + contract |
| Legacy semantics | 🟡 YELLOW | 0 confirmed high-severity; **43 findings unreviewed** |
| Cross-surface agreement | 🟢 GREEN | header ↔ status ↔ contract agree since Sprint 051 |
| Lineage | 🟡 YELLOW | honestly labelled legacy; clean stamping still open |
| Automation | 🟡 YELLOW | pipefail pinned; live proof open |
| Responsive UX | 🟡 YELLOW | verified on `/system-status` only |
| Accessibility | 🟡 YELLOW | same |
| Claims | 🟢 GREEN | artifact-derived, guarded across three suites |
| Production | 🟢 GREEN | builds, exports, pushed |

**Not ready for public exposure** — `/results` does not yet render this adapter.

---

## 7. Sprint 053 recommendation

By the charter's decision rule this is *"legacy audit finds more systemic existence-derived logic"* —
except it did not find more *confirmed* defects; it found **43 unread sites**. Those are two different
situations and only one of them justifies a remediation sprint.

### **Render `/results` on the adapter, and triage the 43 in the same pass.**

1. **Build `/results` on `results-accounting.ts`.** The layer is proven against real slates and consumed
   by nothing. This is where the quarantine and the "not a loss" states become visible to a reader.
2. **Triage the 43 findings while you are in those files.** Most will be false positives like the two
   already found; the value is in converting `reviewed: false` to a verdict, not in a separate sweep.
3. **Then** the homepage and `/today`.
4. **Observe the 2026-07-30 settlement.** One command; closes the oldest open item in the repository.

**Still not recommended:** adding a sport.
