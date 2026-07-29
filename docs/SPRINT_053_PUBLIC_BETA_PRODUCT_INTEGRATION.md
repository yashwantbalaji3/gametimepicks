# Sprint 053 — Public Beta Product Integration & Release Readiness

**Initial SHA:** `915ffc97` → synced to `f660e8df` (1 bot commit) · **Date:** 2026-07-29 13:01 ET

---

## Launch verdict

# `BLOCKED_BY_OPERATIONAL_PROOF`

**Dimension:** Settlement, and Automation.
**Evidence:** 0 of 22,660 ledger rows carry `eventId`; the corrected orchestrator has never executed a
scheduled run. Both are recorded with exact closure conditions.
**Remediation:** observe the 2026-07-30 05:30 UTC settlement. One run closes both.

Every other dimension is green or carries a named limitation. **The product is not blocked by user
experience or by the data contract** — it is blocked by two observations that cannot be manufactured
without corrupting production data, which is not an acceptable way to close a proof.

---

## 1. Legacy status-semantics audit — complete

| | Sprint 052 | Sprint 053 |
|---|---|---|
| Findings | 48 | 48 |
| Confirmed `FALSE_EXISTENCE_DERIVED` | 0 | **0** |
| Reviewed | 5 | **48** |
| **Unread** | **43** | **0** |

Nine files were reviewed individually, including the four scripts that **write public artifacts** and
could therefore put a false state in front of a reader (`build-admin-status`,
`build-public-research-contract`, `check-learning-freshness`, `model-learning-audit`). All four derive
state from content, with `UNAVAILABLE`/`UNKNOWN` as the failure mode rather than a fabricated pass.

The remaining 39 are covered by two stated category rules, and the rules are the finding:

- **`app/scripts/**` that emits no public artifact** → `LEGACY_ONLY`. Its directory listings answer
  "which dates do I have inputs for" — which is precisely what file presence *is* for. No user
  consumes its control flow.
- **`src/**` listings filtered by content before returning** → `CORRECT_CONTENT_DERIVED`.
  `newestWcProjectionWithGames()` requires `matches.length > 0`; the parlay `ui-loader` picks a dated
  file then verifies `pp.date === date`. The scanner flags the listing and cannot see the guard.

**No new existence-derived public defect was found.** The Sprint 051 header bug remains the only
confirmed instance, and it is fixed.

---

## 2. Canonical results accounting — rendered

`/results` now consumes `results-accounting.ts`. Measured across the eight most recent slates:

| Date | Integrity | Generated | W | L | V | Pend | Unavail | Pass | **Gap** | Rate |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-28 | **Withheld** | 702 | — | — | — | — | — | — | **0** | **—** |
| 2026-07-27 | Complete | 557 | 213 | 228 | 64 | 0 | 4 | 48 | **0** | 48.30% |
| 2026-07-26 | Complete | 690 | 297 | 297 | 33 | 0 | 0 | 63 | **0** | 50.00% |
| 2026-07-25 | Complete | 650 | 272 | 281 | 42 | 0 | 0 | 55 | **0** | 49.19% |
| 2026-07-24 | Complete | 693 | 291 | 307 | 46 | 0 | 0 | 49 | **0** | 48.66% |
| 2026-07-23 | Complete | 222 | 95 | 98 | 13 | 0 | 0 | 16 | **0** | 49.22% |
| 2026-07-22 | Complete | 678 | 257 | 296 | 65 | 0 | 8 | 52 | **0** | 46.47% |
| 2026-07-21 | Complete | 82 | 23 | 19 | 30 | 0 | 2 | 8 | **0** | 54.76% |

**Gap 0 on every slate.** The quarantined date keeps its place in the list with an explanation and no
rate of any kind. The 4 and 8 `unavailable` rows on 07-27 and 07-22 are recovered from the generated
population — the ledger never wrote them, so a ledger-first page would have shown a smaller universe
and those rows would have read as if they never happened.

The section leads with the sentence that matters: *removing a row we cannot classify would quietly
improve every number beside it.* Every outcome state carries a plain-language definition, and the three
most often misread — Void, Pending, Unavailable — each say **"Not a loss."** explicitly.

---

## 3. Operational proofs

| Proof | Verdict | Evidence |
|---|---|---|
| pipefail live | **OPEN** | fix landed 10:11 ET 07-29; last run started 10:07 UTC on `9fc71547` |
| Clean lineage-stamping | **OPEN** | 0 of 22,660 rows carry `eventId`; only post-gate slate was refused |

No settle run occurred during this sprint. Closure conditions are recorded in
`operational-proof-observation-plan.json`. **Neither will be forced** — corrupting production data to
trigger a failure is not an acceptable proof.

---

## 4. Validation

**3340 / 3336 pass / 0 fail / 4 skip** · typecheck 0 · build 0 · Python 14/14 + 18/18 · health 18/18 ·
**6 script self-tests** · pipefail known-negative green · money `c5b425a1…` and locks `cb80473f…`
unchanged · 0 money artifacts touched · `vp/` untouched.

Browser-verified at 375px: no horizontal overflow, semantic heading hierarchy, accounting section
renders the withheld slate first with its explanation.

---

## 5. Status of every claim

### PROVEN
- All 48 semantics findings reviewed; unread 0; no new existence-derived public defect.
- Eight consecutive real slates reconcile to gap 0 from the generated population.
- Ledger-absent rows are recovered as `unavailable` and never become losses.
- A withheld slate renders with no rate of any kind, on the public page.
- `/results` consumes the canonical adapter; the component formats and does not compute.

### MEASURED BUT NOT PROVEN
- That a first-time visitor understands the accounting. It is honest and readable; no user has seen it.

### OPEN OPERATIONAL PROOF
- pipefail live behaviour; clean lineage stamping. Both need one real scheduled run.

### LEGACY LIMITATION
- Every historical settled row predates canonical lineage, so every past date reports
  `LEGACY_LINEAGE`. This resolves forward, one clean settlement at a time — never retroactively.

### BLOCKED
- Nothing in the product. The two open items are observations, not work.

### FUTURE WORK
- Homepage hero, `/today` four-layer probabilities, and Game Report on the contract; a combined
  accessibility pass once those exist.

---

## 6. Public-beta readiness matrix

| Dimension | Verdict | Evidence |
|---|---|---|
| Canonical contract | 🟢 GREEN | one adapter, structural no-arithmetic test |
| Legacy semantics | 🟢 GREEN | 48/48 reviewed, 0 unread, 0 confirmed defects |
| Results accounting | 🟢 GREEN | gap 0 across 8 real slates, rendered publicly |
| Results / Daily Brief | 🟢 GREEN | outcomes, definitions, and limitations on the page |
| System Status | 🟢 GREEN | worst-of truth, quarantine visible |
| Shared chrome | 🟢 GREEN | header agrees with the contract since Sprint 051 |
| Claims | 🟢 GREEN | artifact-derived, guarded across four suites |
| Production | 🟢 GREEN | builds, exports, pushed |
| Homepage | 🟡 NAMED LIMITATION | not yet on the contract |
| Today / Market Center | 🟡 NAMED LIMITATION | four probability layers built, not rendered |
| Game Report | 🟡 NAMED LIMITATION | not yet on the contract |
| Methodology | 🟡 NAMED LIMITATION | predates the contract |
| Responsive UX | 🟡 NAMED LIMITATION | verified on `/system-status` and `/results` only |
| Accessibility | 🟡 NAMED LIMITATION | same two routes |
| Automation | 🔴 **OPEN PROOF** | pipefail pinned; never exercised live |
| Settlement | 🔴 **OPEN PROOF** | rejection proven live; stamping unobserved |
| Model capability | 🟢 GREEN | honest limitation preserved everywhere |

---

## 7. Recommended next program of work

**A short observation-and-completion program — not an architecture rebuild.**

The decision rule for `BLOCKED_BY_OPERATIONAL_PROOF` says: *short observation window only; do not
rebuild product architecture.* That is the right call, and there is enough adjacent work to fill it
honestly:

1. **Observe 2026-07-30's settlement.** One run closes both open proofs. If the gate refuses again,
   that is also a result — it means the 07-29 board carries a collision, which would be the first
   evidence that the publication gate is not holding.
2. **Finish the remaining four surfaces** on contracts that already exist — homepage, `/today`, Game
   Report, Methodology. No new derivation, only rendering.
3. **One combined accessibility and responsive pass** across all six routes at once, rather than per
   page.
4. **Then** the launch checklist.

**Still not recommended:** adding a sport, or touching the model. Three sprints of measurement point at
calibration, and the product work in front of it is now nearly done.
