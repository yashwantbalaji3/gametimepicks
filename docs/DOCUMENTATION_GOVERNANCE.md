# Documentation Governance

How this documentation stays accurate, trustworthy, and acquisition-grade.

## Ownership

- The engineer (or agent) making a behavior-changing PR **owns** updating
  the matching canonical doc(s) **in the same PR**. Docs are not optional
  follow-up.
- The canonical docs (listed in [`README.md`](./README.md)) are the source
  of truth. Everything else (dated handoffs, phase notes, generated
  references) is historical and cataloged by the index docs.

## Canonical vs archive policy

- **Canonical:** the curated docs in the `README.md` table + the index docs.
  Kept in step with the live repo.
- **Archive / in-place historical:** existing dated handoffs, phase notes,
  and design docs remain at their original `docs/` paths (to avoid churn and
  broken cross-links) and are cataloged by `HANDOFF_INDEX.md`,
  `MODEL_AUDITS_INDEX.md`, `audits/README.md`, and `runbooks/README.md`. They
  are **preserved, not deleted**, and marked superseded where appropriate.
- **Generated reference** (ChatGPT/Claude DOCX/MD, PR ledgers): summarize
  the content into canonical docs; commit the **clean Markdown/CSV** source
  under `archive/generated-reference/` (or `release/`) for traceability.
  **Do not commit** bulky binary DOCX duplicates, repo-snapshot ZIPs,
  credentials, API keys, or scratch files.

## Conflict resolution

When a doc and the live repo disagree, **the live repo wins** — fix the doc
and, if useful, note the discrepancy. Verify with `git rev-parse HEAD`,
`gh pr list`, and workflow logs; never assume a "current state" line is
still true.

## Required doc updates per PR type

| PR type | Must update |
|---------|-------------|
| Product / nav / UI behavior | `PRODUCT_REQUIREMENTS.md` (+ `ARCHITECTURE.md` if structural) |
| Model / optimizer / scoring | `MODEL_AND_OPTIMIZER.md` **and** `MODEL_AUDITS_INDEX.md` |
| Workflow / automation / cron | `OPERATIONS_RUNBOOK.md` **and** `DATA_PIPELINES.md` |
| Sport coverage level change | `SPORTS_COVERAGE_POLICY.md` (+ `sports-coverage.ts` test) |
| Settlement / projection behavior | `OPERATIONS_RUNBOOK.md` **and** `DATA_PIPELINES.md` |
| Any major PR | add a row to `release/PR_LEDGER.csv`; update `RELEASE_AND_PR_HISTORY.md` if a new workstream |
| New handoff | add a row to `HANDOFF_INDEX.md` (newest first) |
| Acquisition-facing claim | must be **evidence-backed**; never overstate hit rate / model performance |

## Documentation review checklist (per PR)

- [ ] Canonical doc(s) for the changed area updated.
- [ ] No new user-facing performance/hit-rate claim; no banned betting copy.
- [ ] Consistency facts still hold (see `README.md` + the list below).
- [ ] Links resolve; no orphaned new doc.
- [ ] Generated/binary artifacts not committed unless justified.

## Standing consistency facts (must read the same everywhere)

- Production URL `https://gametimepicks.yashwantbalaji.com`; repo path
  `/Users/yashwantbalaji/Downloads/gametimepicks`; deploy gate real
  `Vercel – gametimepicks` + `mergeStateStatus = CLEAN`.
- Preview branches **#213/#214/#215** not touched; stale PRs **#1/#2/#4/#5**
  not closed — unless explicitly instructed.
- Public era starts **2026-05-27**; **May 25/26 must not leak**.
- Latest settled before June 2 was **June 1**; June-1 was poor (1W/47L) and
  **not hidden**.
- `edgePct`/`confidence` are **not predictive**; volume discipline is **not**
  a hit-rate claim; Bank Builder is **paper-only**; unsupported sports are
  **schedule-only / coming soon** with no fake odds/projections/parlays/
  results.

## Handling generated ChatGPT/Claude docs

Treat as **input, not truth**. Extract durable facts into the canonical
docs; archive the clean source under `archive/generated-reference/` with a
"point-in-time, superseded" note; never let a generated "current state" line
override the live repo.
