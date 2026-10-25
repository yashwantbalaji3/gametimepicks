# Cloud engineering sprint: release package for Launch Readiness (2026-10-25)

This is an independent contributor session. It **did not merge, deploy, flip a flag, change a receipt, run a paid capture, or touch Vercel.**

- **Where the work is:** PR #1247, branch `claude/adoring-bohr-e6yo42`, draft.
- **No Vercel cost from pushing it.** Three checks:
  - `app/vercel.json` `git.deploymentEnabled` allows only `main` and `preview/**`; every other branch is `false`.
  - The pushed heads carry 0 Vercel commit statuses.
  - All 94 Vercel deployment events from 10-23 to 10-25 were on `main`.
- Pushing does run GitHub Actions CI.

## A. Roadmap reconciliation

**Status words:**
- **LIVE**: checked on Production `c38292e4` (and later bot builds) on 10-25.
- **IN MAIN**: the code is on main; not re-checked live.
- **BRANCH**: in this PR, not released.

| Area | Planned requirement | Verified current state | Work completed here | Remaining blocker | Next action |
|---|---|---|---|---|---|
| Homepage / Today | Today's games, links to forecasts and simulations | LIVE. NFL: 12 to 13 game links. NBA rows link to the hub card (`/nba/#nba-exp-<id>`), which links to the simulation. No overflow at 320–1440 px | Footer tap targets on every page (BRANCH) | none | — |
| NFL | Forecasts, simulation, boards, results | LIVE. 13 of 13 Sunday games link to a working `/nfl/simulation/<id>` (200) | Spent-odds windows no longer red. No timestamp-only forecast revisions. 24 px board links. Back links (all BRANCH) | NFL odds allowance is spent (1160 of 1160 since 10-11): **founder decision** | Founder: renew, raise, or stay on the 10-11 capture |
| NBA | Official forecast, Elo estimate, projections, Theater, Level A | LIVE. 7 of 7 games link to a simulation (200). Parlay Center, Bank Builder and Moonshot show today's NBA cards. 139 projected players, no invented zeros; unavailable players carry reasons | Cards graded when finals land. Results labels. Projections back link (all BRANCH) | Top-10 board OFF (founder). Challenger promotion (evidence + founder) | — |
| MLB | Moneyline, props, Homer Nukes, results | IN MAIN; postseason, 0 games on 10-25 | — | Season ending | — |
| UFC | Bout pages, model, results | IN MAIN | — | Level A CLOSED by design (no independent model) | — |
| EPL / Ligue 1 | 1X2 forecasts with explicit draws | IN MAIN. Level A OPEN | Methodology wording; EPL back link (BRANCH) | Player markets not modelled | — |
| Simulation Theater | NFL and NBA, skip to predictions, disclosures | LIVE (both). The NBA box score is labelled "simulated game, not the Official Forecast" | — | — | — |
| Level A (all three products) | Shared eligibility, recorded pre-start, graded | LIVE. 10-24: 29 records, all graded, 0 mismatches against the finals (independent re-grade) | Event-driven NBA grading; race-safe settlement (BRANCH) | — | — |
| Mixed-sport Level A | `level-a-mixed@1` | Draft #1244, switch OFF | Review plus tested patch: fallback, Moonshot heading, copy, and a 96-instant real-slate test. In `docs/handoffs/2026-10-25-cloud-pr1244-mixed-fallback.patch` | #1244 owner applies the patch; §7 package; release-owner flip | See D, batch 3 |
| Parlay Lab V2 / Smart Betslip links | Four-tier V2 board; sportsbook handoff | Behind `NEXT_PUBLIC_PARLAY_LAB_V2` and `TERMS_PERMIT_SPORTSBOOK_LINKS = false` | — | Legal Terms + founder (links); correlation caps (founder) | — |
| Results & grading | Prompt, idempotent, no lost settlement | LIVE: correct. Grades about 5 h after the last final (nightly-settle slots start 4.5–5.3 h late; the 09:20Z Vercel-cron dispatch runs it) | All-NBA cards graded in the finals commit; rebase-conflict resolver (BRANCH) | — | — |
| Model performance / methodology | Truthful public wording | LIVE wording **was false**: NBA, EPL and Ligue 1 "Never enter Bank Builder, Moonshot or Parlays" | Fixed from the registry (BRANCH) | — | — |
| Accounts / legal | Terms and Privacy published, sign-up | BLOCKED | — | Founder inputs + counsel receipt | — |
| Workflow reliability & cost | No false-red jobs; fewer data-only builds | 70 of 118 main commits in 24 h changed build inputs. `nfl-event-window` red on 68 of 100 runs | NFL odds red runs (#1247). Vacuous NFL revisions (BRANCH) | Stamp-only NFL commits (see E) | Launch Readiness decision |
| Accessibility / mobile | Targets ≥ 24 px (44 px project rule), no overflow, keyboard-reachable | 19 routes × 4 widths: 0 overflow, 1 h1 each. About 30 footer links per page at 16 px. axe: 22 serious issues on 14 routes | Footer, back links, NFL board, scroll regions, in-text links (BRANCH). Local axe: 0 on 9 routes | — | — |

**Detailed lists from the read-only reconciliation:**
- **Switches OFF:** NBA Top-10 board; `LEVEL_A_MIXED_PUBLIC`; Parlay Lab V2; correlation caps; sportsbook links; NFL Theater env; public sign-up; Terms and Privacy; Live UI; `NBA_FINALS_WAITER_ENABLED`.
- **Duplicates:** #1237 and #1238 (`/results/nba` weight); #1082, #1108 and #1111 (Live Hub v2); #1056, superseded by #1068 and closable.
- **Internal inconsistencies:** the registry says NBA `HISTORICAL_ONLY`, and the UFC Level A reason text is stale. Neither is rendered publicly.

## B. Completed engineering work (branch `claude/adoring-bohr-e6yo42`, base `674c57f786`)

| # | Commit | Problem → root cause → fix | Tests and verification | Limits / release dependency |
|---|---|---|---|---|
| 1 | `661e1bce5e` | **Problem:** 68 of 100 NFL windows red. **Cause:** the 1,160-credit ceiling was reached on 10-11, and the capture exited 5 even though the receipt calls it "a decision owed". **Fix:** `ceilingExhausted()`; exit 0 with `BUDGET_EXHAUSTED` and a warning, before any network call | 4 new tests; 83 existing pass. Real run: no call, no write. A raised ceiling still reaches the paid path | One build (`app/`) |
| 2 | `dc62398de6`, `99b9eeafad` | #1244 patch + this handoff (docs) | The patch applies cleanly to `8b9cd9f819`; 72 of 72 Level A tests pass with it | Docs only, no build |
| 3 | `8574326611` | **Problem:** NBA cards graded about 5 h after the last final. **Cause:** a second grade writer would race nightly-settle's `pull --rebase \|\| exit 1`. **Fix:** `--only-sport nba` grading inside the `nba-results-refresh` finals commit, plus `scripts/ci/regrade-level-a-on-conflict.sh` | 6 new tests: scope; real data reproduces all committed NBA grades exactly; 3 real git races. Mutation-checked. Workflow-scanning suites: 303 pass | Workflows change only on merge; no build of its own |
| 4 | `ead5ec00c8` | **Problem:** about 30 footer links per page at 16 px. **Fix:** `.ft-link` at least 24 px (44 px on touch), `inline-block` so the notes still wrap | Measured locally against live: 16 → 24 / 44 px, no overflow; screenshot checked | All pages rebuild (one build) |
| 5 | `256dfa5cd0` | **Problem:** `/methodology` said NBA, EPL and Ligue 1 never enter the products that show their cards. **Fix:** read the Level A axis from the registry | Local render checked per sport. 35 methodology tests + 430 wording-guard tests pass | — |
| 6 | `f3e6edf3d4` | **Problem:** back links at 14–16 px. **Fix:** `.gtp-backlink` on 13 links | Local: `/results/nba` 15 → 24 / 44 px; `/nba/projections` 16 → 24 / 44 px | NFL game and NBA simulation routes do not render under `next dev`; covered by the same class, not measured |
| 7 | `60e4b4ed95` | **Problem:** NFL board player links at 22 px. **Fix:** `line-height: 24px` | Local: 10 → 0 targets under 24 px on `/nfl/` main content | — |
| 8 | `0a3658a706` | **Problem:** `/results` printed raw ids like `nba-game-winner-tiers@1/parlay-lab`. **Fix:** labels for the NBA and mixed policies, plus a `policyLabel()` fallback | Local render shows 0 raw ids; counts unchanged and reconciled with the ledger | — |
| 9 | `bd80ad2797` | **Problem:** 99 NFL "revisions" (timestamp-only) for 12 games today, 177 on 10-18 and 10-11. The score shape flickered (median 47 → 46) and each run built. **Cause:** the hash carried the run clock and the schedule stamp, and the unchanged check compared only the original receipt. **Fix:** hash the folded finals (`lastFoldedUtc`) and compare against the newest receipt | New test: a run 34 min later, and a recaptured schedule, write nothing; a moved kickoff revises one game, once. Red before each fix. 981 pass; the same 7 fail without the change | **The first run after deploy writes ONE revision per pending game** (new hash formula; numbers identical) |
| 10 | `4d0448b559` | **Problem:** axe-core on 14 live routes found 22 serious issues: 14 scroll regions a keyboard cannot reach, 8 links distinguished by colour alone. **Fix:** `role="region"` + `aria-label` + `tabIndex={0}` on scroll wrappers (the existing NFL convention), and underlined in-text links | Local `next dev` axe scan of 9 routes: 0 violations. New test `a11y-scroll-regions`. 764 pass; the same 4 fail without the change | The NBA simulation and NFL game routes are covered by the code change, not by a scan |

The branch head (`bd80ad2797`) merges cleanly into main `6ca75ff428`, and separately with #1246, #1238 and #1245 (checked with `git merge-tree`).

**Full-suite note (superseded 10-26):** main is red with 3 unit failures. #1245 and #1246 each fix one, and #1247 now fixes the third (the consistency audit's NFL 401873011 event). Exact heads, merge order and test results are in [the release manifest](2026-10-26-release-manifest.md).

## C. Pending work, in execution order

**Already implemented, awaiting release:** B1, B3–B9 (this branch); #1245 and #1246 (main-red fixes); #1237 and #1238 (`/results/nba` weight).

**Completed, awaiting integration:** the #1244 patch. The owner applies it from `docs/handoffs/2026-10-25-cloud-pr1244-mixed-fallback.patch`.

**Blocked on a founder decision:**
- NFL odds allowance;
- NBA Top-10 board;
- correlation caps;
- sportsbook links (plus legal);
- Terms and Privacy (counsel);
- challenger-model promotion;
- `NBA_FINALS_WAITER_ENABLED` (repository variable).

**Blocked on data or permissions:**
- the Production Vercel env values (Theater, Parlay Lab V2) are not readable from the repo;
- Vercel billing proof.

**Not yet implemented:**
1. a stamp-only guard for NFL window commits (see E);
2. event-driven grading for soccer and MLB Level A cards. **Assessed, not built.** Ligue 1 finals land only with `soccer-leagues` at 09:15Z, so there is no gain. EPL-only cards would gain hours (`epl-settle` 23:00Z), but `epl-settle` pushes with a bare `pull --rebase`, so it would first need the `regrade-level-a-on-conflict.sh` resolver. Most soccer cards mix leagues;
3. `/results` page weight (1,366 KB against a 2,300 KB ceiling; P2);
4. the NFL preseason hash path (same pattern as B9; inert until 2027).

## D. Release package

- **Base:** `674c57f786`.
- **Commits:** B1–B10 in the order of the table (`git log --reverse 674c57f786..claude/adoring-bohr-e6yo42`).
- **Rebuilding in a fresh checkout:** `git fetch origin claude/adoring-bohr-e6yo42`, then either `git merge` or `git format-patch 674c57f786..FETCH_HEAD`. The branch on GitHub is the durable copy.
- **Feature flags touched:** none.

**Recommended batches** (Launch Readiness merges and deploys):

| Batch | Contents | Risk | Public change | Builds | Rollback |
|---|---|---|---|---|---|
| 1 | #1245, #1246 | Low (tests + one board label) | NBA board correction flag | 1 | Revert the merge |
| 2 | #1247 (this branch, all commits) | Low–medium: workflow edits to nightly-settle and nba-results-refresh | Methodology wording, results labels, tap targets, fewer NFL revisions | 1 | Revert the merge. Workflows go back to their old behaviour; receipts and grades are append-only and stay valid |
| 3 | #1244 + patch | Medium (the switch stays OFF until the §7 package) | None until the flip | 1 | Leave the switch OFF |

**Production acceptance after batch 2:**
- [ ] `/methodology` NBA row says "only as unpriced model suggestions".
- [ ] `/results` "by policy and tier" shows "NBA Parlay Center card", with no `@1/` text.
- [ ] Footer link height ≥ 24 px (desktop) and ≥ 44 px (phone).
- [ ] Next NBA night: `graded.jsonl` gains the NBA rows in the `auto: nba results capture` commit, within about 15 minutes of the last final.
- [ ] Next nightly-settle: no rebase failure.
- [ ] Next NFL window with games: at most one revision per game, then none on later windows.
- [ ] An NFL window with the allowance spent is green, with a `BUDGET_EXHAUSTED` warning.

## E. Product readiness scorecard (10-25)

| Surface | State |
|---|---|
| Homepage, Today | Live; footer tap-target fix awaiting release |
| NFL | Live (forecasts, 13/13 simulations). Prices stale (allowance spent). Revision fix awaiting release |
| NBA | Live (7/7 simulations, Level A on 3 pages, projections with reasons) |
| MLB | Live, postseason |
| UFC | Live; Level A closed by design |
| EPL / Ligue 1 | Live; Level A open |
| Simulations | Live (NFL, NBA) |
| Top Boards | Live for MLB, NFL, NBA. NBA Top-10 board OFF |
| Player projections | Live (NBA, NFL) |
| Bank Builder, Moonshot, Parlay Center | Live (Level A cross-sport + NBA). Mixed-sport awaiting #1244 |
| Smart Betslip | Copy only; links blocked (legal) |
| Results, grading | Live and correct; faster grading awaiting release |
| Model performance | Live; wording fix awaiting release |
| Accounts / legal | Blocked (founder + counsel) |
| Workflow reliability | NFL false-red and revision churn fixed in branch; grading race fixed in branch |

**Not claimed:** that the whole site is public-ready. Legal, the NFL prices, and mixed-sport activation are open.

## F. Cost note for Launch Readiness: stamp-only NFL builds

After B9, 6 of today's 13 NFL window builds would change only:
- timestamps (`generatedAt`, the `evidence.strengthCutoff` run clock);
- the per-run `runId` in `product-receipts.json`.

A guard like `nba-results-refresh`'s `results-publishable` check would skip those builds. The trade-off is that the "updated at" times on NFL pages would show the last *change*, not the last *check*. That is a product decision, so it is not implemented here.
