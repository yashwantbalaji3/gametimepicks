# Release & PR History

Full, structured PR traceability lives in
**[`release/PR_LEDGER.csv`](./release/PR_LEDGER.csv)** (every PR #1 → current,
with `pr,date,status,sha,workstream,title,summary,verification`). A
narrative end-to-end record (phases 1–8, generated reference) is archived at
[`archive/generated-reference/PR_END_TO_END_RECORD.md`](./archive/generated-reference/PR_END_TO_END_RECORD.md).
This page summarizes the major workstreams.

## Standing PR status (do not change without instruction)

- **Preview branches #213 / #214 / #215** — `STRUCTURAL concept A/B/C`,
  **DRAFT, unmerged, DO NOT MERGE or edit.** Design references only.
- **Stale PRs #1 / #2 / #4 / #5** — old operator/CI fixes, superseded on
  main. **Open; do not close** unless explicitly instructed.

## Major workstreams (grouped)

### A. Foundations & premium UI (PRs ~#1–#120)
Public-safety copy, provider plumbing (nba_api/balldontlie, playerId
resolver), props-only mode + enrichment split, premium dark UI, early
results/settlement, multi-sport shells, saved slips + parlay tracking +
calibration + curated cards. Confidence guardrails + R5 suspicious-edge cap
introduced here.

### B. Cricket experiment → rollback → public-era reset → gold rebuild
Cricket/IPL trialed then unwired from user surfaces; **public-era reset to
`2026-05-27`** (May 25/26 excluded from public rates); gold/vault brand
rebuild.

### C. Risk sections, Bank Builder, Events hub, settlement resilience
`publicRiskSections` grading, Bank Builder (paper-only), Events
(schedule-only), NBA settlement ESPN bridge, NBA-CI timeout circuit breaker.

### D. UI structural previews (#213/#214/#215) → production hybrid
Three structural concepts (Command Center / Social Story / Guided) shipped
as **draft previews**. Concept C inspired the production hybrid:
**#218** Command Center shell · **#219** dashboard home + featured slip ·
**#220** guided "New here?" module · **#221** handoff.

### E. Five clear paths (Simplified Guided Product)
**#223** Parlay Lab hash deep-linking + label clarity · **#224** rail
relabel + Home path cards · **#225** de-duplicate Home vs Parlay Lab +
framing intros · **#226** handoff.

### F. Sports expansion + honest coverage
**#227** Sports & Events coverage hub (`sports-coverage.ts`) · **#228** Home
sports-coverage module · **#229** sport-clarity pointers · **#230** handoff.
(MLS/EPL initially "coming soon".)

### G. Real schedules + mobile-first
**#231** real schedules (WNBA/UFC refreshed, **MLS added schedule-only**, EPL
stays coming soon) · **#232** mobile-first Sports & Events board · **#233**
Home mobile ordering · **#234** mobile nav (Sports added) · **#235** handoff.

### H. Settlement / learning / June-2 readiness
June-1 settled via official `nightly-settle` (`43483d0`): **1W/47L slips**,
152W/154L single-leg, 0 pending. **#236** learning notes (observational) ·
**#237** June-2 handoff (June-2 clock-gated, not fabricated).

### I. Model-quality sprint (current)
**#238** pipeline/model audit + proposed quality-gate plan · **#239** inert
decorrelation helpers + shadow audit (gates cut volume, **didn't improve hit
rate**) · **#240** offline calibration investigation (`edgePct`
anti-predictive; `confidence` non-predictive; market implied is the only
signal) · **#241** public **volume discipline + honest empty states** (16→≤9
cards/slate; **not** a hit-rate claim).

## Per-major-PR detail

For purpose / user impact / technical impact / verification / risks of any
individual PR, use `release/PR_LEDGER.csv` (the `summary` + `verification`
columns) and the archived `PR_END_TO_END_RECORD.md`. The current
model-quality PRs (#238–#241) each have a dedicated doc — see
[`MODEL_AUDITS_INDEX.md`](./MODEL_AUDITS_INDEX.md).

*Ledger current through PR #241 (main `5a1777d`, 2026-06-02). Re-verify with
`gh pr list` before relying on "current".*
