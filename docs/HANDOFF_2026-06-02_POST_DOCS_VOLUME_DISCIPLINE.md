# HANDOFF — Post-Docs / Volume-Discipline (2026-06-02, ~07:10 ET)

> Session handoff for the next Claude Code session. **Stop point: context
> limit; no new feature/model work was started after this.** The next
> substantive task is **projection→probability recalibration, shadow-only**
> — do NOT start it without operator instruction. Repo-relative paths below
> are **not** chat/session attachments (see §7).

---

## 1. Executive summary

This session shipped three docs/discipline PRs and produced a serious model
audit. Net product change: **public Suggested-Parlay output is now
volume-disciplined** (fewer, less-repetitive cards + honest empty states),
and the repo has a **canonical `/docs` documentation system**. The model's
own quality signals (`edgePct`/`confidence`) were proven **not predictive**
(calibration audit) and are **not** used as quality gates. The next real
engineering task is to **recalibrate the projection→probability step
(shadow-only first)** — not started, approval-gated. No performance/hit-rate
claim is made anywhere.

---

## 2. Current repo state

- **Branch:** `main`
- **main SHA:** `4ef8801` (`4ef88012ff661f27be6e4ab7ad84dd285a36b8ce`)
- **origin/main:** `4ef8801` — **clean + synced (0/0).**
- **Open PRs:**
  - **Preview (DO NOT TOUCH):** #215, #214, #213 — draft/unmerged.
  - **Stale (DO NOT CLOSE):** #5, #4, #2, #1 — open.
  - No feature/work PRs open.
- Always re-verify with `git rev-parse HEAD` + `gh pr list` — do not assume.

---

## 3. Work completed in this session

| PR | Title | Merge SHA | Notes |
|----|-------|-----------|-------|
| #241 | public suggestion volume discipline + honest empty states | (merged) | caps Low 3/Med 3/High 2/Longshot 1, total ≤9, player ≤2 / market ≤4 / game ≤3 exposure; live "all" view 16→≤9; **not a hit-rate claim**; no projection/edge/confidence/policy/workflow change |
| #242 | establish canonical project documentation system | (merged) | 14 canonical docs + index pages + committed PR ledger/reference (clean MD/CSV only) |
| #243 | clarify repo-relative documentation paths | `4ef8801` | adds "Path conventions" note to `docs/README.md` |

Earlier in the broader arc (context): #238 audit, #239 inert decorrelation
helpers + shadow audit, #240 calibration investigation. See
`docs/RELEASE_AND_PR_HISTORY.md` + `docs/release/PR_LEDGER.csv`.

---

## 4. Product state (canonical: `docs/PRODUCT_REQUIREMENTS.md`)

- **Home (`/`):** status bar · 5 path cards · featured slip · compact
  suggested-parlays preview (≤2 cards) · sports-coverage module · track
  record / bank builder. Full builder is **not** on Home.
- **Projections / Straight Bets (`/projections`):** single player-prop
  projections (NBA/MLB only); honest clock-gated `0/0` + latest-available
  fallback.
- **Parlay Lab (`/parlay-lab`):** hash modes `#suggested` / `#build` /
  `#bankroll`. **Suggested** now **volume-disciplined** (≤9 cards, honest
  empty sections, explanatory note). **Build Your Own** + **Build My Card**
  intact. Risk-section ordering is honest by combined-odds math (not a
  per-leg quality claim).
- **Bank Builder (`/bank-builder`):** **paper-only**; picks a pending,
  fully-unsettled ~+100 slip or an **honest empty state**; never shows a
  settled slip.
- **Results (`/results`):** latest settled = **2026-06-01**; public-era from
  `2026-05-27`; **no May 25/26 leak**; pending/pushes shown separately.
- **Sports & Events (`/events`):** coverage hub (NBA/MLB = Projections +
  Parlays; NHL/WNBA/UFC/FIFA/IPL/MLS = schedule-only; **EPL = coming soon**)
  + mobile-first board with attributed schedules.
- **Mobile:** top scrollable strip + 5-item bottom nav (Home, Projections,
  Parlay Lab, Results, Sports); 375px clean, no overflow.

---

## 5. Model state (canonical: `docs/MODEL_AND_OPTIMIZER.md`, `docs/MODEL_AUDITS_INDEX.md`)

- **June-1 failure (trigger):** public slips **1W/47L (2.08%)**; single-leg
  152W/154L (49.67%); 0 pending. One cold low-offense slate amplified by
  overpublishing + heavy "Over"/same-market correlation.
- **#239 shadow audit:** proposed per-section quality gates **cut volume
  ~51% but did NOT improve hit rate** (slip 13%→10%, leg 50%→48%).
- **#240 calibration (217 settled legs):** `edgePct` **anti-predictive**
  (top-edge 49% vs bottom 57%); `confidence` **non-predictive** (binned
  edge); **market-implied probability is the only separating signal**
  (top-half 60% vs bottom 46%); model overconfident (Brier ≈ 0.24,
  coin-flip). **Root cause = mis-calibrated/overconfident model_prob, not a
  code bug.**
- **Therefore:** `edgePct`/`confidence` must **NOT** be used as quality
  signals or back any win-rate claim. **Volume discipline (#241) is NOT a
  hit-rate claim** — it is anti-overpublishing + honesty.
- **`audit/policy.json`:** proposed-only / **unconsumed** by the optimizer.
  Do not wire without explicit approval.
- **Next substantive task:** **projection→probability recalibration,
  shadow-only** (see §9). Not started.

---

## 6. Data / workflow state (canonical: `docs/DATA_PIPELINES.md`, `docs/OPERATIONS_RUNBOOK.md`)

- **nightly-settle:** cron `0 7 * * *` = **3 AM ET**; free public APIs;
  settles prior slate + grades + audits; commits data. Latest run: **success
  2026-06-02 08:05 UTC** (the June-1 settlement dispatch).
- **morning-projections:** cron `30 13 * * *` = **9:30 AM ET**; paid Odds API
  (credit-guarded). Latest run: **2026-06-01 19:05 UTC** — **no June-2 run
  yet.**
- **auto-refresh:** periodic props-only; latest **2026-06-02 04:23 UTC**.
- **Latest settled slate:** **2026-06-01**.
- **Active slate / June-2:** active = `2026-06-01` (settled). **June-2
  projections NOT generated** (`parlays/optimizer/2026-06-02.json` MISSING)
  as of **07:09 ET** — **clock-gated** to the 9:30 AM ET run (a real 15-game
  June-2 MLB slate is scheduled to populate it). Do **not** dispatch early;
  the honest empty/latest-available state is correct.

---

## 7. Documentation state (canonical: `docs/README.md`, `docs/DOCUMENTATION_GOVERNANCE.md`)

- **Canonical docs (14):** `README`, `PROJECT_OVERVIEW`,
  `PRODUCT_REQUIREMENTS`, `ARCHITECTURE`, `DATA_PIPELINES`,
  `MODEL_AND_OPTIMIZER`, `SPORTS_COVERAGE_POLICY`, `OPERATIONS_RUNBOOK`,
  `RELEASE_AND_PR_HISTORY`, `MODEL_AUDITS_INDEX`,
  `KNOWN_LIMITATIONS_AND_RISKS`, `ACQUISITION_DILIGENCE_BRIEF`,
  `HANDOFF_INDEX`, `DOCUMENTATION_GOVERNANCE`.
- **Index pages:** `docs/audits/README.md`, `docs/runbooks/README.md`,
  `docs/archive/README.md` (+ `historical-handoffs`, `generated-reference`).
- **Reference (committed, clean MD/CSV):** `docs/release/PR_LEDGER.csv`,
  `docs/archive/generated-reference/PR_END_TO_END_RECORD.md`,
  `docs/archive/generated-reference/CHATGPT_CONVERSATION_HANDOFF.md`. Binary
  `.docx` + repo-snapshot `.zip` were intentionally not committed.
- **Path convention:** paths here are **repo-relative** — they map to the
  local checkout (`/Users/yashwantbalaji/Downloads/gametimepicks/…`) or a
  GitHub blob URL on `main`. They are **NOT** ChatGPT/Claude session
  attachments; a chat "File could not be read" message is **expected** for
  them, not a missing file.

**GitHub URLs for key docs:**
- `docs/README.md` → https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/README.md
- `docs/release/PR_LEDGER.csv` → https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/release/PR_LEDGER.csv
- `docs/archive/generated-reference/PR_END_TO_END_RECORD.md` → https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/archive/generated-reference/PR_END_TO_END_RECORD.md
- `docs/archive/generated-reference/CHATGPT_CONVERSATION_HANDOFF.md` → https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/archive/generated-reference/CHATGPT_CONVERSATION_HANDOFF.md

---

## 8. Hard rules to preserve

- No fabricated data (schedules/odds/projections/parlays/results/recent10/
  hit-rates).
- No unsupported-sport picks; UFC/MLS/EPL/WNBA/FIFA/IPL/NHL stay
  schedule-only or coming-soon.
- No same-slate contamination; no settling a slate before its games are
  final; no May-31 backfill.
- No May 25/26 public-rate leakage; public era starts `2026-05-27`.
- Bank Builder **paper-only**; Events **schedule-only** where appropriate.
- Preview PRs **#213/#214/#215** untouched; stale PRs **#1/#2/#4/#5** not
  closed — unless explicitly instructed.
- Merge gate: real `Vercel – gametimepicks` SUCCESS + `mergeStateStatus =
  CLEAN`; squash-merge; sync main after every merge.
- No banned betting copy (`lock`, `guaranteed`, `free money`, `risk-free`,
  `can't miss`/`cant miss`, `easy win`, `easy money`, `no-brainer`/`no
  brainer`, `sure thing`, `sharp money`); avoid user-facing "safe/safety"
  except CSS `safe-area-inset-bottom`.
- `audit/policy.json` **not** consumed by the optimizer without explicit
  approval.
- No performance/hit-rate promises (no "70%").

---

## 9. Exact next recommended task — projection→probability recalibration (SHADOW-ONLY)

Goal: determine whether a **recalibrated** model probability can beat the
market out-of-sample — **offline, no live wiring**, approval-gated.

- **Inputs:** only settled public-era slates (`2026-05-27` … latest), May
  25/26 excluded, pending excluded, deduped legs. Use the existing dataset
  builder in `app/scripts/model-calibration-analysis.mjs` as the base.
- **What to try (offline, observational):** recalibrate the
  projection→probability step (e.g. widen/estimate `sigma` /
  variance, per-market projection-bias correction) and compute a **shadow
  recalibrated probability** alongside today's.
- **Market baseline comparison:** the bar to beat is **market-implied
  probability** (the only currently-predictive signal). Report Brier / hit
  rate of recalibrated-prob vs implied-prob.
- **Leave-one-day-out (LOO) evaluation:** fit/adjust on N−1 days, evaluate
  on the held-out day; repeat. Prevents overfitting one slate. Report
  per-day LOO results.
- **Decision rule:** only consider wiring if the recalibrated probability
  **beats the market out-of-sample across LOO folds**; otherwise keep it
  shadow/observational and document.
- **Hard constraints:** no same-slate leakage; no `policy.json` consumption;
  no live optimizer/UI change; update `docs/MODEL_AND_OPTIMIZER.md` +
  `docs/MODEL_AUDITS_INDEX.md`. **Pause for operator approval before any
  live wiring.**

Also (low-effort, separate): **verify June-2 projections** once the 9:30 AM
ET run fires (boards/optimizer/snapshot/publicRiskSections present;
Projections + Parlay Lab show June-2 pregame; Bank Builder fresh slip;
Results still June-1; no June-2 settled leak).

---

## 10. Verification commands for the next session

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git status --short && git rev-parse HEAD && git ls-remote origin main | cut -f1
git rev-list --left-right --count HEAD...origin/main
gh pr list --state open --limit 30
gh run list --workflow nightly-settle --limit 8
gh run list --workflow morning-projections --limit 8
gh run list --workflow auto-refresh --limit 8

cd app
npx tsx --test src/lib/*.test.mjs   # expect 590 pass
npx tsc --noEmit                    # expect clean
npm run build                       # expect green (139 routes)

# reproduce model evidence (offline, read-only):
npx tsx scripts/model-calibration-analysis.mjs
npx tsx scripts/shadow-audit-quality-gates.mjs
npx tsx scripts/shadow-volume-discipline.mjs
```

Preview/browser harness: `.claude/launch.json` config `gtp-dev`
(`npm run dev`, port 3000).

---

## 11. Known limitations / risks (canonical: `docs/KNOWN_LIMITATIONS_AND_RISKS.md`)

- Poor public-era hit rate (tracked openly, not hidden).
- Model edge **not predictive**; only market-implied probability separates
  winners; thin calibration sample (~217 legs / 5 days).
- Volume discipline reduces overpublishing/repetition — **not** a
  performance fix.
- Only NBA/MLB modeled; schedule snapshots are point-in-time and will age;
  paid Odds API dependency; static export means stale data until next
  commit/deploy.
- Two Vercel projects can disagree transiently — only `gametimepicks` is the
  authoritative gate.

---

## 12. Final notes for the next Claude Code session

- **Verify, don't assume.** Start with §10; check `git rev-parse HEAD`,
  `gh pr list`, workflow logs, and whether June-2 projections fired.
- **Do not start projection recalibration without operator instruction**;
  when you do, keep it **shadow-only** and pause before any live wiring.
- **Do not** present repo-relative paths as clickable chat attachments —
  report **repo path + GitHub URL**.
- Re-read the canonical docs (`docs/README.md` first) rather than replaying
  this whole arc.

*Handoff: `docs/HANDOFF_2026-06-02_POST_DOCS_VOLUME_DISCIPLINE.md`. main
`4ef8801`. Latest settled `2026-06-01`. June-2 clock-gated to the 9:30 AM ET
morning run.*
