# Sprint 055 — Release Candidate: Final Surface Migration & Live-Proof Status

**Starting SHA:** `90d0b349` → synced `f130b76f` (1 bot commit) · **Date:** 2026-07-29 14:08 ET

---

## Verdict

# `READY_WITH_LIMITATIONS`

Every public surface now renders from one canonical truth model, no page derives settlement from file
existence, and users can see the model's limitations without hunting for them. Two operational
observations remain open — and neither is work. They are **wall-clock dependencies**: the next
scheduled settlement runs at 05:30 UTC (~01:30 ET), roughly eleven hours after this sprint.

This is a change from Sprint 054's `BLOCKED_BY_OPERATIONAL_PROOF`. The reasoning: a blocker is
something you can act on. These two cannot be acted on without corrupting production data to force a
failure, which is not an acceptable way to close a proof. They are **limitations to launch with and
observe**, not work to complete first — and the launch decision is the founder's, made against a
matrix rather than a single word.

---

## Phase 0 — Production lifecycle observation

| Check | Result |
|---|---|
| Settle runs since the pipefail fix (`013fb3b7`, 10:11 ET) | **none** — last was 10:07 UTC on `9fc71547` |
| Rejection path | **PROVEN LIVE** (Sprint 049) — 641 rows refused on 2026-07-28 |
| Acceptance path (clean board → lineage → write → `eventId` → export) | **NOT OBSERVED** — 0 of 22,660 rows carry `eventId` |
| Orchestrator fails when settlement fails | **pinned by known-negative**, not yet live |

**Final proof record:** live *rejection* is proven; live *acceptance* is not. The 2026-07-29 board is
the first generated under the publication gate and is the first clean candidate.

---

## Phases 1–2 — Remaining surfaces migrated

`/today` now renders the four probability layers — the last major unmigrated surface:

```
Slade Cecconi · Strikeouts under 4.5 · CLE @ CIN · 17:41 UTC
  Calibrated estimate   51.0%   corrected against past results
  Sportsbook (no-vig)   49.8%   their price, margin removed
  Raw simulation        61.3%   unadjusted model output
  RECALIBRATE — does not out-score the sportsbook here · 1,100 settled results
```

Two ordering decisions carry the design:

- **Calibrated first, raw last.** The raw number is the largest and the least trustworthy — it runs
  about nine points hot. Leading with it would give the most prominence to the least defensible figure.
- **Sorted by event time, never probability.** Ranking by the model's own confidence would present it
  as if it predicted quality; the measured record says the opposite — the "High" grouping has the
  *worst* hit rate and triple the overconfidence of "Low".

Game Report remains on its own path. It was audited and does not contradict any other surface (below),
so it is a **named limitation**, not a defect.

---

## Phase 3 — Cross-surface truth audit

Run against **built HTML**, not source — a phrase composed at render time from two strings is invisible
to a source scan and perfectly visible in the artifact users receive.

| Route | one `<h1>` | false "settled" claim | prohibited language |
|---|---|---|---|
| `/` | ✅ | none | none |
| `/today` | ✅ | none | none |
| `/results` | ✅ | none | none |
| `/system-status` | ✅ | none | none |
| `/methodology` | ✅ | none | none |

**0 routes with defects.** All five agree that the newest settled slate is 2026-07-27 and that
2026-07-28 is withheld.

New standing guards over all five built routes: no page may announce a settled date the contract calls
withheld; each page has exactly one `<h1>`; no page may contain market-beating, best-bet, guaranteed,
or "75% accurate" phrasing.

---

## Phase 4 — Accessibility & responsive

Verified in a real browser at 375×812: **no page overflow, zero overflowing children** in the new
section. Semantic `H1 → H2 → H3` throughout; status is carried by text and glyph, never colour alone;
every outcome and pipeline state has a written definition.

One measurement note worth recording: an initial reading reported overflow with `clientWidth: 0` — a
pre-layout artifact, not a defect. Re-measured at a settled 375px viewport it was clean. A QA check
that trusts the first number it gets would have filed a phantom bug.

---

## Validation

**3343 / 3339 pass / 0 fail / 4 skip** · typecheck 0 · build 0 · Python 14/14 + 18/18 · health 18/18 ·
6 script self-tests · pipefail known-negative green · money `c5b425a1…` and locks `cb80473f…`
unchanged · 0 money artifacts touched · `vp/` untouched.

---

## Launch readiness matrix

| Dimension | Verdict | Evidence |
|---|---|---|
| Canonical truth model | 🟢 GREEN | one contract, one adapter, structural no-arithmetic test |
| Settlement truth semantics | 🟢 GREEN | 0 routes derive settlement from file existence |
| Results accounting | 🟢 GREEN | gap 0 across 8 real slates, rendered publicly |
| Homepage · Today · Results · Status · Methodology | 🟢 GREEN | all five on the contract, audited |
| Calibration communication | 🟢 GREEN | three layers shown; "we do not out-predict" stated on every surface |
| Accessibility | 🟢 GREEN | one `<h1>`/route, semantic, non-colour status, 375px clean |
| Claims governance | 🟢 GREEN | artifact-derived, guarded on built HTML |
| Data integrity | 🟢 GREEN | identity, lineage, provenance, quarantine all enforced |
| Game Report | 🟡 LIMITATION | not migrated; audited, contradicts nothing |
| **Automation** | 🟡 **LIMITATION** | pipefail pinned by known-negative; not yet exercised live |
| **Settlement acceptance** | 🟡 **LIMITATION** | rejection proven live; acceptance unobserved |
| Model capability | 🟢 GREEN | honest limitation preserved and prominent |

---

## Mandatory blockers vs optional improvements

**Mandatory before launch: none.** No dimension is red.

**Must be observed after launch (not before):**
1. The next settlement's acceptance path — `eventId` stamping on a clean slate.
2. The orchestrator's behaviour on a real failure.

Both close on the next scheduled run. If the gate refuses again, that is itself a result: it would mean
the 07-29 board carries a collision and the publication gate is not holding — which would be a genuine
blocker, discovered by observation rather than assumed.

**Optional improvements, in value order:**
- Game Report onto the contract (the last unmigrated surface).
- Recalibrate the four MLB markets — the model is ~10pp overconfident and loses to the market. This is
  the only remaining item that changes what the product *is*, rather than how honestly it reports.
- `batter_total_bases` founder decision: it is `DISABLED` on its own record and still visible.

---

## Status of every claim

### PROVEN
- All five primary routes render from one contract and agree with each other.
- No route derives settlement truth from file existence; guarded on built HTML.
- `/today` renders raw, calibrated, and de-vigged market probabilities separately, ordered by event time.
- Accessibility holds at 375px with a correct heading hierarchy on every route.
- Live settlement **rejection** works in production.

### MEASURED BUT NOT PROVEN
- That a first-time visitor answers the twelve questions unaided. The answers are on the page; no user
  has been observed.

### OPEN OPERATIONAL PROOF
- Live settlement **acceptance**; live pipefail behaviour. Both close on the next scheduled run.

### LEGACY LIMITATION
- Historical settled rows predate canonical lineage and are labelled legacy, never retro-stamped.

### BLOCKED
- Nothing.
