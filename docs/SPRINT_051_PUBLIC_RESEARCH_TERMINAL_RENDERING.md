# Sprint 051 — Rendering the Contract, and the Defect It Exposed

**Starting SHA:** `a21e9aa5` (no bot drift) · **Date:** 2026-07-29 11:17 ET

Sprint 050 built a guarded public research contract that nothing rendered. This sprint built the typed
adapter and the first surface that consumes it — and rendering it immediately exposed a user-visible
truth defect that six sprints of artifact-level testing had not caught.

---

## 1. The defect rendering found

The new System Status page said 2026-07-28 was **withheld**. Two inches above it, the site-wide header
said:

> **Slate settled** · Latest slate · Jul 28 · **Settled · Jul 28**

Both were rendered from the same repository, on the same screen, about the same day.

**Root cause.** `getOptimizerGradedDates()` lists dates for which a graded *file* exists.
`slate-status-bar.tsx` treated that as settlement. When the lineage gate refused the 2026-07-28 MLB
slate, the optimizer snapshot was still written — **168 legs, every one `pending`, nothing decided** —
and the bar read the filename as proof.

| Date | Decided | Pending | Header said |
|---|---|---|---|
| 2026-07-27 | 159 | 9 | settled ✓ |
| **2026-07-28** | **0** | **168** | **"Slate settled"** ✗ |

**Fix.** `getOptimizerSettledDates()` requires at least one decided leg. Settlement is a property of
the content, never of the filename. The header now reads **"Pregame slate"** and **"Settled · Jul 27"**,
matching the contract exactly.

**Why nothing caught it earlier.** Every guard so far tested artifacts against artifacts. This
disagreement only existed *between* a legacy surface and the new contract, and became visible the
moment something rendered the contract beside it. Five cross-surface tests now pin it, including one
asserting that whatever the contract calls withheld, the status bar must never call settled.

---

## 2. What was built

| Phase | Deliverable | Path |
|---|---|---|
| 1 | Typed public-contract adapter | `src/lib/research/public-contract-adapter.ts` (16 tests) |
| 2 | System Status page | `src/app/system-status/page.tsx` |
| — | Cross-surface truth fix | `parlay-results.ts`, `slate-status-bar.tsx` (5 tests) |
| — | Preview server correction | `.claude/launch.json` now uses the repo's export server |

### The adapter reads; it does not calculate

A structural test asserts the adapter contains no `reduce`, no division by a row count, and no rate
arithmetic. The moment a reader starts computing, the contract stops being a single source and pages
drift apart again — which is exactly how a stale 51.7% shipped on two pages for weeks.

Fail-closed throughout: a missing artifact, malformed JSON, an unknown schema version, or an
unrecognised stage state all resolve to `UNAVAILABLE`. None resolve to `READY`. A status page showing
green when it cannot read its own inputs is worse than one that is simply down, and `unreadable` is
carried as its own flag so a surface can distinguish "cannot read" from "unhealthy".

### The System Status page

Renders the worst-of overall state, five independent stages, the withheld slate with its
plain-language explanation, and a legend defining all seven states. Currently:

```
overall            Withheld — latest settlement is withheld
prediction history Ready     complete through 2026-07-27 (22,660 rows, 0-day lag)
calibration        Ready     platt-1, fitted through 2026-06-24, held out on 6,695 rows
market registry    Ready     as of 2026-07-27, 21,633 decisive rows
daily brief        Ready     newest settled date 2026-07-27
latest settlement  Withheld  2026-07-28 refused by the settlement integrity gate
```

Status is never carried by colour alone — each row states its condition in words and carries a text
glyph. "Running late" is defined distinctly from "failed", because a scheduler that habitually starts
two hours after its cron is not an outage, and conflating the two teaches readers to ignore both.

Verified in a real browser: no horizontal overflow at 375px, semantic `H1 → H2 → H3` hierarchy.

---

## 3. Operational proofs — both still OPEN

| Proof | Status | Why |
|---|---|---|
| pipefail live | **OPEN** | fix landed 10:11 ET; last settle run started 10:07 UTC — before it |
| Clean lineage-stamping | **OPEN** | 0 of 22,660 rows carry `eventId`; the only post-gate slate was refused |

No settle run occurred during this sprint. The next opportunity is 2026-07-30 05:30 UTC, when the
2026-07-29 board — the first generated under the publication gate — becomes eligible.

---

## 4. Validation

**3325 / 3321 pass / 0 fail / 4 skip** · typecheck 0 · build 0 · Python 14/14 + 18/18 · health 18/18 ·
contract self-test ok · pipefail proof ok · money `c5b425a1…` and locks `cb80473f…` unchanged, 0 money
artifacts touched, `vp/` untouched.

---

## 5. Status of every claim

### PROVEN
- The header claimed a refused slate was settled; it no longer can, and a test pins it.
- The adapter passes canonical values through unchanged and performs no rate arithmetic.
- A missing, malformed, or future-versioned artifact renders as unknown, never as healthy.
- The quarantine survives every layer and never acquires a record.
- The status page has no horizontal overflow on mobile and uses a semantic heading hierarchy.

### MEASURED BUT NOT PROVEN
- The page is *understandable to a first-time visitor*. It is honest and readable; no user has seen it.

### OPEN OPERATIONAL PROOF
- pipefail live-proof; clean lineage-stamping. Both need a real scheduled run.

### BLOCKED
- Nothing. The remaining surfaces are unstarted, not blocked.

### FUTURE WORK
- Homepage, `/today`, game report, `/results`, and the daily brief surface; accessibility audit across
  those routes once they exist.

---

## 6. Launch-readiness matrix

| Dimension | Verdict | Evidence |
|---|---|---|
| Canonical contract | 🟢 GREEN | one adapter, structural no-arithmetic test, 16 passing |
| System status | 🟢 GREEN | worst-of rendered, quarantine visible, verified in-browser |
| Homepage | 🔴 RED | not yet consuming the contract |
| Today / Market Center | 🔴 RED | four probability layers not yet rendered |
| Game Report | 🔴 RED | not yet on the contract |
| Results | 🔴 RED | population accounting not yet rendered |
| Daily brief | 🟡 YELLOW | artifact exists and is adapter-ready; no surface |
| Methodology | 🟡 YELLOW | existing page predates the contract |
| Responsive UX | 🟡 YELLOW | verified on the one new route only |
| Accessibility | 🟡 YELLOW | semantic + non-colour status on the new route; others unaudited |
| Claims | 🟢 GREEN | artifact-derived, 15 + 16 + 5 guards |
| Settlement | 🟡 YELLOW | rejection proven live; stamping open |
| Automation | 🟡 YELLOW | pipefail pinned; live proof open |
| Production | 🟢 GREEN | builds and exports cleanly; pushed |

**Not ready for public exposure** — four core surfaces still do not consume the contract.

---

## 7. Sprint 052 recommendation

The charter's decision rule fits the outcome precisely: *contract rendering reveals data-contract
gaps* → a contract-completeness sprint. But the gap found was not in the contract; it was a **legacy
surface disagreeing with it**. That points somewhere more specific.

### **Continue rendering, and audit every legacy surface against the contract as you go.**

1. **`/results` next, not the homepage.** It is where the 2026-07-28 quarantine most needs to appear,
   and where the settled/unsettled distinction that broke the header actually matters to a reader.
2. **Audit the remaining legacy chrome** the way the status bar was audited — anything deriving
   "settled", "fresh", or a rate from file existence rather than content is the same bug wearing a
   different hat. The status bar is unlikely to be the only one.
3. **Then** `/today` with the four probability layers, the homepage hero, and the daily brief.
4. **Then** a single accessibility and responsive pass across all of them at once.

**Observe the 2026-07-30 settlement.** It closes the oldest open item in the repository and costs one
command.

**Still not recommended:** adding a sport.
