# GameTime Picks — Documentation

This directory is the canonical documentation system for GameTime Picks: a
sports-statistics product that publishes **NBA + MLB** player-prop
projections and model parlays, with **schedule-only** coverage for several
other leagues. It is built to support engineering, onboarding, operations,
model/settlement audits, and acquisition diligence.

- **Production:** https://gametimepicks.yashwantbalaji.com
- **Repo path convention:** `/Users/yashwantbalaji/Downloads/gametimepicks`
- **Deploy gate:** real `Vercel – gametimepicks` SUCCESS **and**
  `mergeStateStatus = CLEAN` (a duplicate `gametime-picks` project also
  builds; the **`gametimepicks`** check is the authoritative gate).

> **Honesty first.** Nothing in this product or these docs claims a
> guaranteed or target hit rate. The public-era results are tracked
> honestly, including poor ones. See
> [`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md).

## Path conventions (read this)

Paths in this documentation are **repo-relative** unless otherwise noted.
For example, `docs/release/PR_LEDGER.csv` means the file inside the
checked-out repository at
`/Users/yashwantbalaji/Downloads/gametimepicks/docs/release/PR_LEDGER.csv`,
or the equivalent GitHub blob URL on `main`:
`https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/release/PR_LEDGER.csv`.

These are **not** ChatGPT/Claude session attachments. A chat-UI message
like *"File could not be read… or it lives outside the session folder"*
when you click a repo-relative path is **expected and not a missing file** —
open the path in your local checkout or via its GitHub blob URL instead.
Within Markdown, links use relative paths (e.g. `./release/PR_LEDGER.csv`)
that resolve from the file they appear in.

---

## Canonical documents (start here)

| Doc | What it is |
|-----|------------|
| [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) | What the product is, live state, trust principles, banned copy |
| [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) | Per-surface product behavior + honesty rules |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Frontend + pipeline + automation + deploy architecture |
| [`DATA_PIPELINES.md`](./DATA_PIPELINES.md) | Ingestion → projections → settlement → public-era boundaries |
| [`MODEL_AND_OPTIMIZER.md`](./MODEL_AND_OPTIMIZER.md) | Projection model, optimizer, calibration findings, what must not be claimed |
| [`SPORTS_COVERAGE_POLICY.md`](./SPORTS_COVERAGE_POLICY.md) | Which sports get what, and why |
| [`OPERATIONS_RUNBOOK.md`](./OPERATIONS_RUNBOOK.md) | Daily ops: settle, project, deploy, merge gates, failure handling |
| [`RELEASE_AND_PR_HISTORY.md`](./RELEASE_AND_PR_HISTORY.md) | PR history from #1 → current (+ `release/PR_LEDGER.csv`) |
| [`MODEL_AUDITS_INDEX.md`](./MODEL_AUDITS_INDEX.md) | Index of every model/settlement/calibration audit |
| [`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md) | Honest risk register |
| [`ACQUISITION_DILIGENCE_BRIEF.md`](./ACQUISITION_DILIGENCE_BRIEF.md) | Buyer-facing summary + diligence checklist |
| [`HANDOFF_INDEX.md`](./HANDOFF_INDEX.md) | Index of all dated handoff docs |
| [`DOCUMENTATION_GOVERNANCE.md`](./DOCUMENTATION_GOVERNANCE.md) | Ownership, per-PR update rules, canonical-vs-archive policy |

## Supporting indexes / archives

| Path | Contents |
|------|----------|
| [`audits/README.md`](./audits/README.md) | Catalog of audit/learning docs (in-place) |
| [`runbooks/README.md`](./runbooks/README.md) | Catalog of operational runbook docs (in-place) |
| [`archive/README.md`](./archive/README.md) | Historical handoffs + generated reference material |
| [`release/PR_LEDGER.csv`](./release/PR_LEDGER.csv) | Structured PR ledger (#1 → current) |

---

## Reading paths

**New engineer (½ day):**
`PROJECT_OVERVIEW` → `ARCHITECTURE` → `DATA_PIPELINES` → `MODEL_AND_OPTIMIZER`
→ `OPERATIONS_RUNBOOK` → `PRODUCT_REQUIREMENTS`.

**Operator (on-call):**
`OPERATIONS_RUNBOOK` → `DATA_PIPELINES` → `SPORTS_COVERAGE_POLICY`.

**Buyer / acquisition diligence:**
`ACQUISITION_DILIGENCE_BRIEF` → `KNOWN_LIMITATIONS_AND_RISKS` →
`MODEL_AUDITS_INDEX` → `RELEASE_AND_PR_HISTORY` → `PROJECT_OVERVIEW`.

**Returning after time away:**
`HANDOFF_INDEX` (newest first) → `RELEASE_AND_PR_HISTORY`.

---

## Update rules (summary — see `DOCUMENTATION_GOVERNANCE.md`)

- **Canonical** docs (the table above) are the source of truth and must be
  kept in step with the live repo. When a doc and the live repo disagree,
  **trust the live repo and fix the doc.**
- **Historical** material (dated handoffs, phase notes, generated
  references) is preserved in place and cataloged by the index docs; it is
  never the source of truth once superseded.
- Every behavior-changing PR must update the matching canonical doc(s) —
  see the governance per-PR-type table.

*Canonical docs introduced/curated 2026-06-02. Current main at authoring:
`5a1777d`. Always re-verify `git rev-parse HEAD` and workflow/PR state
before trusting any "current state" line — verify, don't assume.*
