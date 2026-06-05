# Finished-Product Progress (2026-06-05)

> Snapshot of where the product stands and what remains. main = `a6098c7`.
> Docs-only; recommendations, no code/data change.

## 1. Current production state
- **Active slate:** June 5 (optimizer + boards + snapshot present; graded absent).
- **Latest settled:** June 4 (6W/42L generated; published-card record graded).
- Lifetime (public era): **generated pool 87W/514L (14.5%)**, **published cards 19W/84L (18.4%)** — now shown as two separate records on `/results/` (#279).
- All public pages 200; no banned/v2/edge copy; no May 25/26 leak.

## 2. What's good now (shipped this stretch)
- **#275** June 4 settlement live.
- **#276** parlay count-consistency audit + Results scope docs.
- **#277** generalized current-live quality audit (date-aware) on main.
- **#278** deeper Suggested display + **Mixed tab** (June 5: 5 → 17 displayed cards).
- **#279** Results separates **Published cards vs Generated pool** + corrected Mixed note.
- Audit suite: current-live quality, suggested-parlay coverage, count-consistency,
  publishing-depth, v2 readiness/candidate-search/dataset-inventory/watchlist, and
  **NEW** v2-learning-feedback. All current-slate audits PASS / WARN-CASE-1.

## 3. What remains
| Item | State | Path |
|------|-------|------|
| **V2 not ready** | 0 corrected launch candidates across 8 slates | keep internal; re-run learning-feedback per slate (roadmap doc) |
| **Generation-curation ceiling** | Stage-1 branch local (4→6 + market penalty); modest on concentrated slates | land Stage 1 (future-slate); evaluate Stage 2 on fresh slates (plan doc) |
| **Alternate lines** | one-sided ladders, not de-viggable | hold for two-way source, or display-only UX decision (memo) |
| **Cron reliability** | nightly-settle + morning-projections both ran late on June 5 | watch; manual recovery worked; consider a heartbeat |
| **Duplicate Vercel** | two deploy checks per push | delete/disconnect the duplicate project (manual) |
| **Branch cleanup** | several local + merged-branch leftovers | delete on approval |
| **Mobile polish** | #278/#279 verified no-overflow at 375 | optional further polish |

## 4. Next PR sequence (suggested)
1. **Generation-curation Stage 1** (`feature/generation-curation-public-risk-depth`) — pipeline-only, future-slate, tests green. Push on approval.
2. **This V2 learning + docs branch** (`feature/v2-learning-and-finished-product`) — internal audit + roadmap/plan/memo docs. Push on approval.
3. **`docs/june5-planning-clean`** — planning docs incl. open-items checklist.
4. Later: generation-curation Stage 2 (after fresh-slate validation); alternate-line UX decision; V2 only if a corrected candidate ever appears (STOP-gated).

## 5. Public / user-facing risks (all currently mitigated)
- No edge/"better hit rate"/v2/shadow/new-model copy anywhere (verified).
- No alternate-line launch claim.
- Results clearly distinguishes published vs generated records (no more "the
  headline looks like my cards" confusion).
- Honest empty states; no padded/fabricated cards.

## 6. Suggested decisions for the user
1. Approve pushing the two ready PRs (generation-curation Stage 1; this V2/docs
   branch) — both internal/future-slate, low risk.
2. Decide whether to pay for a June-5 regeneration to see the curation lift live,
   or just wait for the next fresh slate (recommended: wait — modest on June 5).
3. Decide alternate-line direction (hold vs display-only UX).
4. Approve branch cleanup + the duplicate-Vercel removal.
5. Settlement: watch tonight's nightly-settle for June 5; settle via the free
   path on approval if it stalls.

*Docs-only. No model/projection/optimizer/grading/data change. V2 not live.*
