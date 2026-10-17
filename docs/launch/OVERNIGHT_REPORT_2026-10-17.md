# Overnight engineering report, Sat 2026-10-17 (06:20Z → ~11:00Z / 2:20 → 7:00 AM EDT)

## 1. Executive summary
- **Nothing was merged or deployed, no paid calls were made, and this session triggered 0 Production builds.** No founder approval arrived, so the 10:30–11:00Z window passed with #1101 and #1088 unchanged. _(Window outcome confirmed at hand-off; see §3.)_
- **The biggest finding: `main` is red again since early 10-17, and every PR inherits it.** Two data- and calendar-driven guards fail on `main`'s own build:
  - **Home word ceiling:** 1,868 against 1,820.
  - **Join guard 16d:** tripped by gamePk 849817's postponement from 10-16 to 10-18.

  **#1122** repairs both. It also fixes a real trust defect behind the first: at 3 AM ET, Home showed **five August preseason NFL reports** under "No current slate has a simulation yet". **Approve #1122 first.**
- **#1118 was hardened before approval.** An edge-case review found that the PR itself introduced a **crash** on a malformed kickoff in the NFL index, which would take down Home and `/today`. It is fixed and the new head is `46b23a4035`. The replay is unchanged: 37 → 0 wrong "forecasts not published" messages across 234 real evaluations.
- **Release readiness:**
  - Full local gates pass on a trial merge of `main` + #1122 + #1118 + #1101 + #1088.
  - The HTML/UX trio (#1117 → #1119 → #1120) still merges cleanly onto `main` (no source changes since verification) and has one coordinated package.
- **Results integrity:**
  - **#1123** fixes 5 presentation defects, such as bare rates with no small-sample note and a mismatched MLB board banner.
  - It also adds an **EPL health fix (G1).** The live record pooled two models and was close to being judged at n = 60 this weekend. This one is your decision and is time-sensitive.
  - Four more metric-changing items wait on you.
- **TRUTH-001 MLB restatement proposal is complete:**
  - The counts are reconciled: 22 + 4 + 9 + 2 = 37 games, and every one of them has a row in the per-game evidence table.
  - It identifies 21 high-confidence corrections.
  - New finding: the "4 never public" games were public, then withdrawn before a delayed start.
- **Launch remains NO-GO.** Privacy/Terms, Supabase verification, the Ask cap and the rollback rehearsal are still open, and #1118 has to land.

## 2. Engineering completed (implemented and tested, not released)
| Item | Where | Evidence |
|---|---|---|
| Home archive fallback most-recent-first, capped at 2; UFC finishes in words; guard 16d judges grading joins only, plus a new 16f interim guard | **#1122** `3392628da7` | Unit 9,403/9,405, 0 fail; build ✅; post-build 697/700, 0 fail; Home 1,809 ≤ 1,820 |
| #1118 malformed-kickoff crash fix | **#1118** `46b23a4035` | Regression assertions fail without the fix; replay unchanged; 128/128 consumer tests; tsc clean |
| Results integrity: small-sample notes, MLB board banner, labels | **#1123** | Unit 9,408/9,411, 0 fail; post-build red only on #1122's two tests |
| EPL health judges the live model only (G1) | **#1123** `2664bec024` | Real-data run: state unchanged (INSUFFICIENT_SAMPLE); n 56 → 20; log loss 1.0516 → 1.0392; no other family changes |
| Capture kit: "LIVE with no player stats" listed as a problem, plus a read-only `check-live.mjs` | #1082 `f53d7417a6` | Kit self-test 4/4; the running capture's frozen kit is untouched |
| MLB served-revision selector tests (11 edge cases) | branch `claude/mlb-served-revision-proposal` `82a2dbffa3` | 124/124 |
| auto-refresh content gate prototype | branch `claude/writer-batching-prototype` `c4f9304eb9` | 12 new tests plus 54 adjacent pass; replay 30 → 10 pushes |

**Documentation, all in #1116:**
- the coordinated HTML/UX package;
- the MLB restatement proposal;
- the results integrity review;
- the writer-batching and NFL-spacing analysis;
- the Privacy/Terms classification and account strategy;
- the Supabase tiers, Ask checklist, UAT and rollback packets;
- the launch matrix (four-way taxonomy);
- the roadmap record.

## 3. Release queue
| # | PR | Purpose | Exact head | CI | Mergeable | Depends on | Recommendation | Production impact |
|---|---|---|---|---|---|---|---|---|
| 1 | #1122 | `main` CI repair plus the Home archive trust fix | `3392628da7` | _see hand-off_ | CLEAN | — | **Approve first** | 1 build; Home archive shows 2 recent reports |
| 2 | #1118 | NFL product day: stale anchor never denies published forecasts | `46b23a4035` | red only on #1122's two tests; full gates green on the trial merge | CLEAN | after #1122 | Approve | 1 build |
| 3 | #1101 | Stop restamping settled history (protected) | `22b0ac73bd` | green on head; trial gates green | CLEAN | — | Approve; the next window is any gap between settle runs | 1 build; ~362 fewer rewritten files per run |
| 4 | #1088 | MLB stamp gate (protected) | `e2dd976085` | green on head; trial gates green | CLEAN | — | Approve; value lasts through the World Series | 1 build; about 7–10 fewer builds/day in the MLB postseason |
| 5 | #1117 | HTML Release 1 | `4b4610366e` | ✅ | CLEAN | — | Approve (trio step 1) | 1 build |
| 6 | #1119 | UX Release 1 on HTML | `4465b08d40` | ✅ | CLEAN | #1117 | Approve (step 2) | 1 build |
| 7 | #1120 | UX follow-up (internal codes, export guard, journey fixes) | `55153b7970` | ✅ | CLEAN | #1119 | Approve (step 3) | 1 build |
| 8 | #1121 | Ask fail-closed provider and kill switch | `abb72dff26` | ✅ | CLEAN | `ASK_MODEL_PROVIDER=gemini` confirmed first | Approve after the env check | 1 build; Ask returns 503 if the provider isn't named |
| 9 | #1123 | Results integrity plus EPL G1 | `2664bec024` | _see hand-off_ | CLEAN | after #1122 | Approve; revert the EPL commit if you decline it | 1 build |
| 10 | #1116 | Docs | branch head | — | — | — | Merge any time | 0–1 build |

Expected deployments if all merge: about 10 Production builds (or fewer when queued builds supersede each other).

## 4. Forecasting integrity
- **No prediction, settlement, grade or historical record was changed** by any work this session.
- **MLB restatement** (proposal only; `docs/research/truth/MLB_RESTATEMENT_PROPOSAL_2026-10-17.md`):
  - **Scope:** 818 games and 2,449 graded game-market rows; 576 verified served = graded; 22 graded ≠ served (6 change an outcome, 10 rows flip); 4 public-then-withdrawn; 216 unverified.
  - **21 high-confidence corrections.**
  - **Metrics:** moneyline 418–400 → 417–397 (R1) or unchanged (R2); log loss 0.7000 → 0.6986. Both are worse than a coin flip at 0.6931, and the interval includes 0. No model-health state changes.
  - **Decisions F1–F9** are in the doc.
- **Cross-sport review:**
  - Pending, void, draw and withdrawn are handled correctly in every sport.
  - Pregame freezing has 0 late revisions in every sport.
  - Five items are founder decisions:
    - NBA duplicate archive rows (4,592 rows / 2,830 unique);
    - EPL pooling (fixed in #1123, pending your approval);
    - Homer Nukes scratched batters (37/239 → 37/230);
    - "Edge" labels;
    - a stale About claim.

## 5. UX and HTML readiness
- #1117 → #1119 → #1120 are unchanged since verification, and `main` has had no source changes since.
- The simulated sequential merge is clean with 0 data files.
- **Evidence:**
  - HTML −27.4% vs `main` and −26.6% vs #1115; the busiest MLB board goes 5.84 → 3.73 MB.
  - Rendering vs #1115: 0 differing elements on 10 of 12 pages; the other 2 differ only because their content changed between build times.
  - Sweep: 132 page loads clean; 32/32 tablists pass.
  - 6 journeys tested, 5 defects fixed; Results paging 137/137 and 644/644.
- Package: `docs/release/HTML_UX_RELEASE_PACKAGE_2026-10-17.md`.

## 6. Vercel costs
- **This session:** 0 Production builds, 0 Preview deployments, 0 paid API calls.
  - Production requests were a handful of single read-only GETs.
  - The competitor site was not touched.
  - About 7 serialized local builds.
- **Baseline (per push, 10-09 → 10-17):** 58.7 completed builds/day, of which 44.7 carry real content; 9.6 skipped pushes/day.
- **Corrections tonight:**
  - Writer batching is worth **−0.25 builds/day and −2.12 skips/day** now (the auto-refresh content gate), not the −4.2/day estimated earlier.
  - The NFL sim-v2 shadow builds are **not** redundant: a public page reads them.
- **NFL spacing:** no change before launch. After launch, only "120 min, never within T−3h of a kickoff, never deferring live-props", run log-only first.
- **New finding, being audited now:** the deploy trigger lists only 4 `data/internal` paths as build inputs, but public routes read more of them (confirmed for the sim-v2 shadow receipts). Results go into the build-input coverage audit.
- **Confirmed savings: none yet.** No cost change has merged, and billed figures need a Vercel token.

## 7. NFL and Live Hub V2
- **Sunday capture is ready.**
  - The process is healthy (pid 8301; 5-minute passes; idle until 12:30Z Sun).
  - The 3 events are re-verified against the schedule and forecast index: HOU vs JAX 401872996 at 13:30Z; NO @ NYG 401873000 at 17:00Z; BUF @ LV 401873005 at 20:25Z.
  - Player stats use `players=1`.
  - The read-only check `node docs/live/capture/check-live.mjs ~/gtp-evidence/live-v2-sun-1018/captures` flags "LIVE with no player stats" early.
- **Remaining acceptance:**
  - envelope-level player stats against ESPN;
  - feed delay and recovery;
  - client cadence and freshness bands;
  - an "under" row;
  - provider failure;
  - canonical prop settlement served after the games.
- **Live Hub V2 stays unpublished.**

## 8. Security and legal readiness
- **Privacy/Terms:**
  - 24 rows classified: 1 incorrect, 5 missing disclosures, 6 legal decisions, 2 product clarifications, 10 resolved.
  - 2 new findings: the #1077 draft says no email is collected, and slip upload says "Nothing was saved" after storing the image.
  - **Founder inputs:** operator name, contact, governing state, minimum age (and an age attestation), reviewer, approval date, effective date and approved hashes.
  - Settle account mode, the email sender and Google Fonts first, because each changes the text counsel hashes.
- **Accounts:** launch invite-only only if F-1 and F-2 close. Otherwise disable accounts (remove the two `NEXT_PUBLIC_SUPABASE_*` variables and run one build; `/account` shows "not open yet" and data is retained). Counsel matters are listed.
- **Supabase:** the minimum to close F-2 is tiers A + A2 + B + C, with no service-role key.
- **Ask:**
  - Use the checklist.
  - If the cap can't be confirmed, keep Ask disabled for launch. The entry points stay visible and the error shows on submit.
  - Confirm `ASK_MODEL_PROVIDER=gemini` before #1121.
- **Rollback:** a dry run on Mon 07:00 ET. The packet adds stalled deploys, a ledger check, auth failures and provider-config failures. Gap: the evidence scripts must exclude rollback intervals.

## 9. October 20 launch assessment: **NO-GO** (as of 10-17 morning)
**Mandatory, unmet:**
- Privacy and Terms are unpublished while accounts are live.
- Hosted RLS is unverified.
- The Ask provider cap is unconfirmed.
- The rollback rehearsal hasn't run.
- #1118 is not deployed; the defect recurs on launch morning.
- `main` CI is red (#1122).

**CONDITIONAL GO is reachable** if, by the Mon 10-19 review:
- these close, or you accept them in writing;
- #1122 and #1118 are deployed and verified;
- the UFC and NFL Sunday windows show no P0.

Matrix: 38 VERIFIED (4 real-event, 31 Production, 1 CI, 2 local), 15 PENDING, 18 BLOCKED, 5 DEFERRED.

## 10. Founder approval queue (in order)
| # | Decision | Why | Time-sensitive | If deferred | Recommendation | Exact scope |
|---|---|---|---|---|---|---|
| 1 | Merge **#1122** | Unblocks every PR's CI; removes August reports from Home | Yes: `main` is red | Every PR stays red; Home shows stale archive cards at night | **Approve** | `--match-head-commit 3392628da7dda7fd95e41ce5ab2a6e5328c0f990` |
| 2 | Merge **#1118** | Home and `/today` must not deny published forecasts after Thu/Mon games | Yes: recurs Tue 10-20 morning | Wrong NFL message on launch morning | **Approve** | `46b23a4035f11540f324981aef828f0dbc152291` |
| 3 | Merge **#1101** and **#1088** (protected) | History integrity; MLB build cost | Moderately: MLB value ends with the World Series | Restamping continues; ~7–10 avoidable builds/day | **Approve** in a gap between settle and lineup runs | `22b0ac73bd…`, `e2dd976085…` |
| 4 | **Ask provider cap** (FD-4), then merge **#1121** | Spend control | Yes, before launch | Uncapped spend risk | Confirm the cap and `ASK_MODEL_PROVIDER=gemini`, then approve; otherwise keep Ask off | console checklist + `abb72dff26…` |
| 5 | **Legal inputs and counsel** (FD-1) + **account mode** (FD-2) | Mandatory launch gate | Yes: counsel lead time | NO-GO, or disable accounts | Supply the inputs; choose invite-only if F-1/F-2 close, otherwise disabled | §8 inputs |
| 6 | **Supabase tiers A–C** (FD-3) | Mandatory with accounts | Yes | NO-GO with accounts on | Authorize and run them yourself, no service-role key | the tiers doc |
| 7 | Merge the **HTML/UX trio** #1117 → #1119 → #1120 | UX polish, 27% smaller HTML, journey fixes | Before UAT ideally | Launch without the UX release | **Approve**, merge commits, in order | the three heads |
| 8 | Merge **#1123**, including or excluding the EPL G1 commit | Honest rates; EPL verdict over one model | EPL yes (this weekend) | A pooled verdict at n = 60 | **Approve with EPL** | `2664bec024…` |
| 9 | **Rollback dry run** Mon 07:00 ET (FD-9) | Mandatory | Monday | NO-GO, or a written waiver | Approve | the rehearsal doc |
| 10 | **TRUTH-001** F1–F9 | Truthful MLB record | No (post-launch is acceptable) | Known disclosed limitation | Approve F1 (21 corrections); choose R1 or R2 | the proposal doc |
| 11 | Remaining metric decisions: NBA dedup, Homer Nukes, "Edge" copy, About claim | Truthful numbers | No | Disclosed limitations | Approve dedup and Homer Nukes post-launch | the integrity doc |
| 12 | Cost designs: auto-refresh gate; sim-v2 shadow as a build input; NFL spacing (post-launch, log-only) | Cost and correctness | No | Status quo | Approve the auto-refresh gate and the shadow build input | the cost docs |
| 13 | Vercel token (FD-5); NFL odds funding (FD-8) | Billing evidence; NFL prices | Medium | No billing proof; prices "not checked" | Provide the token; decide on odds | — |

## 11. Next 24–48 hours
- **Sat 10-17**
  - Approvals 1–4.
  - Merge in gaps: avoid MLB lineup :25–:45 and settle runs; the UFC card is tonight.
  - Verify each merge in Production with `verify_1088.py` / `verify_1101.py` and the #1118 acceptance checks.
  - Merge the UX trio if approved.
  - Founder: legal inputs, Supabase tiers, Ask cap.
- **Sun 10-18:** NFL capture.
  - Run `check-live.mjs` at about 13:45Z, 17:15Z and 20:40Z.
  - Overnight Monday: `report.mjs` and `git-watch` for canonical settlement.
  - UAT items tagged PRODUCTION-READ-ONLY.
  - No merges during the 12:30Z–01:00Z windows.
- **Mon 10-19:**
  - 07:00 ET rollback dry run.
  - UAT completion.
  - #1118 check on Tuesday morning.
  - 17:00 ET go/no-go review against the matrix.
