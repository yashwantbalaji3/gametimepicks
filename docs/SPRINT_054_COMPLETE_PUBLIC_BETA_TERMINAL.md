# Sprint 054 — Completing the Terminal, and a Third Instance of the Same Defect

**Starting SHA:** `d6a61577` (no bot drift) · **Date:** 2026-07-29

---

## Launch verdict

# `BLOCKED_BY_OPERATIONAL_PROOF`

**Dimensions:** Settlement, Automation. **Evidence:** 0 of 22,660 rows carry `eventId`; the corrected
orchestrator has never executed a scheduled run. **Remediation:** one settlement run closes both.

Unchanged from Sprint 053 because no settle run occurred in the interval — the last started
2026-07-29 10:07 UTC on `9fc71547`, before the pipefail fix landed at 10:11 ET.

**What did change:** the product-side blockers are now largely gone, and the sprint found a third
instance of the defect that has driven the last four sprints.

---

## 1. A third instance of "file existence means settled"

`/results` announced **"Settled slate: Jul 28"** in its hero — while the canonical accounting section
**on the same page** reported that date as *withheld*. One screen, two contradictory claims.

Root cause, identical to Sprint 051: `results/page.tsx` still called `getOptimizerGradedDates()`,
which lists dates whose graded *file* exists. Fixed to `getOptimizerSettledDates()`; the hero now
reads **"Settled slate: Jul 27"**.

**This is the third time this exact bug has surfaced** — the global header (Sprint 051), the audit's
premise (Sprint 052), and now the results hero. The pattern is worth naming: the semantics *scanner*
looks at source, and this component never called `existsSync` itself — it consumed a helper that did.
A source scan cannot see that. So a guard was added that scans the **built HTML**: no page may print
`Settled slate: <date>` or `Settled · <date>` for a date the contract calls withheld. That check
operates on the artifact users actually receive, which is the only place this class of defect is
reliably visible.

---

## 2. Surfaces migrated to the canonical contract

| Surface | Before | Now |
|---|---|---|
| System Status | ✅ Sprint 051 | ✅ |
| `/results` accounting | ✅ Sprint 053 | ✅ |
| **`/results` hero** | ❌ claimed a withheld date was settled | ✅ content-derived |
| **Homepage** | ❌ not on the contract | ✅ `TerminalSummaryPanel` |
| **Methodology** | ❌ predated the contract | ✅ `HowToReadThis` |
| `/today`, Game Report | ❌ | ❌ — named limitation |

### Homepage

A panel that states, in the same type size as everything else, the number a homepage most wants to
omit: **vs the sportsbook — Behind.** With both Brier scores and the held-out sample beside it. A
homepage that shows a hit rate while omitting the market comparison is technically silent and
practically misleading.

### Methodology

`HowToReadThis` answers the required questions from the **same artifact the pages render**, so an
explanation cannot drift from the numbers it explains — which is precisely how a hardcoded 51.7%
survived on two pages for weeks. It states plainly: *Has the model shown it can out-predict the
sportsbook?* → **No.** Every outcome state carries its definition; Void, Pending and Unavailable each
say *"Not a loss."*

### Accessibility

`/results` was rendering **two `<h1>`** elements — the page title and the hero. Demoted the hero to
`<h2>`; a screen reader relies on exactly one. Now guarded across four built routes.

| Route | h1 | h2 | aria refs |
|---|---|---|---|
| `/` | 1 | 10 | 46 |
| `/results` | 1 | 20 | 6,581 |
| `/system-status` | 1 | 4 | 26 |
| `/methodology` | 1 | 10 | 24 |

Verified at 375px on `/results` and `/system-status`: no horizontal overflow.

---

## 3. Validation

**3342 / 3338 pass / 0 fail / 4 skip** · typecheck 0 · build 0 · Python 14/14 + 18/18 · health 18/18 ·
6 script self-tests · pipefail known-negative green · money `c5b425a1…` and locks `cb80473f…`
unchanged · 0 money artifacts touched · `vp/` untouched.

---

## 4. Status of every claim

### PROVEN
- A third existence-derived defect existed on `/results` and is fixed.
- No built page can announce a settled date the contract calls withheld — guarded on built HTML.
- Every built route carries exactly one `<h1>`.
- Homepage and Methodology render from the canonical contract; neither computes.
- The market-comparison answer is "no" on the homepage, in the methodology, and in the contract.

### MEASURED BUT NOT PROVEN
- That the twelve questions are *answerable by a first-time visitor*. They are answered on the page;
  no user has been observed reading it.

### OPEN OPERATIONAL PROOF
- pipefail live behaviour; clean lineage stamping. One scheduled run closes both.

### LEGACY LIMITATION
- Historical settled rows predate canonical lineage and are labelled legacy, never retro-stamped.

### BLOCKED
- Nothing in the product.

### FUTURE WORK
- `/today` and Game Report on the four probability layers — the only two surfaces still unmigrated.

---

## 5. Readiness matrix

| Dimension | Verdict |
|---|---|
| Canonical contract · Legacy semantics · Results accounting | 🟢 GREEN |
| System Status · Shared chrome · Claims · Production | 🟢 GREEN |
| **Homepage · Methodology** | 🟢 **GREEN (new)** |
| Accessibility (4 core routes) | 🟢 GREEN |
| `/today` · Game Report | 🟡 NAMED LIMITATION |
| Responsive (verified on 2 of 6 routes) | 🟡 NAMED LIMITATION |
| **Automation · Settlement** | 🔴 **OPEN PROOF** |
| Model capability | 🟢 GREEN — honest limitation preserved |

---

## 6. Recommended next program

**Observe, then finish the last two surfaces.**

1. **The 2026-07-30 settlement closes both open proofs.** If the gate refuses again, that is itself a
   result — it would mean the 07-29 board carries a collision, and the publication gate is not holding.
2. **`/today` and Game Report** are the only unmigrated surfaces. The four probability layers, the
   registry, and the eligibility rules all exist and are tested; this is rendering, not derivation.
3. **One responsive pass** across all six routes together.
4. Then the launch checklist.

**Still not recommended:** adding a sport, or touching the model.

---

## 7. A note on the recurring defect

Three instances in four sprints, each in a different component, each invisible to the guard that caught
the previous one:

| Found | Where | Why the prior guard missed it |
|---|---|---|
| Sprint 051 | global header | artifact-level tests compared artifacts to artifacts |
| Sprint 052 | *(audit premise)* | — |
| Sprint 054 | results hero | the source scanner sees `existsSync`, not a helper that calls it |

The guard now operates on built HTML, which is the artifact users actually receive. That is a
meaningfully stronger position than the previous two, but the honest statement is that **each guard was
added after the defect shipped**, and a fourth variant in a component that phrases it differently would
still get through. The class is not closed; it is narrowed.
