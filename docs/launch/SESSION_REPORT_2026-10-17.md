# Engineering report: autonomous session, Sat 2026-10-17 01:10Z → ~03:30Z

Scope: the founder's Oct 17 directive (9 phases). **No merges, no deployments, no paid-service changes, and no legal publication** in this session. The last merge was #1114, approved on 10-16 and verified in Production.

## 1. Completed work
- **Reconciled the current state.**
  - `main` = Production `8433d82bd9` at 01:14Z; `main` is now `b74e72059b` (bot data commits only).
  - #1114 is merged, and Production serves it (verified earlier).
  - The Sunday capture has stayed healthy throughout (pid 8301, ~60 idle passes; first game window 12:30Z Sun).
- **#1118 (NFL product day):** replayed across **every distinct NFL index since 10-08** (78 indexes, 234 evaluations; Week 5 Thu/Sun/Mon, the Week 6 rollover, Thu SEA@DEN).
  - `main` denies published forecasts in **37** of them; #1118 in **0**. Those 37 are the only differences; 197 evaluations are identical.
  - New finding: the bug also hit **Fri–Sat Oct 9–10**, so it recurs weekly.
- **#1088 (MLB stamp gate):**
  - The replay is refreshed to 29 commits: they would trigger **9** builds instead of 29, and all **100** suppressed gated file changes are timestamp-only (independent check).
  - **`priceAgeDays` review: suppression cannot mislead.**
    - The field is not rendered anywhere.
    - It is restored together with `generatedAt`, so the file stays internally true.
    - `pricesCapturedAt`, `state`, `reason` and `cells` are never allowlisted, so crossing an eligibility threshold always publishes.
    - Verified on the 10 suppressed tier-grid commits.
- **#1101 (settled-history stamp guard):** replayed over **all 73 settle runs since 10-01**.
  - It held back 26,434 stamp-only past-dated rewrites in total, about 362 per run.
  - It published all **48** real past-dated corrections and all **296** added dated files.
  - Missing→populated stamps: **0 occurrences in history**, so this path rests on code and tests plus the post-merge verifier (stated honestly on the PR).
- **#1117 CI:** the red runs came from a **stale GitHub merge ref** that predated #1114, proven from the CI log. A fresh run on the recomputed ref is **green**: unit 9,406/9,408, post-build 696/699, 0 failures.
- **Internal codes in reader words (#1120):**
  - Found 9 render points where internal state codes reached visible text:
    - Home and `/today`: SCAFFOLD_ONLY;
    - model audit: INSUFFICIENT_SAMPLE;
    - NFL games: RESEARCH_ONLY, PROCEED_TO_FORWARD_SHADOW;
    - `/nfl`: SECOND_LOOK_REJECTED, BASELINE_ONLY;
    - `/results/forecasts`: PRIVATE_RESEARCH, `nfl_score_shape`;
    - `/results/parlay-lab`: SCAFFOLD_ONLY.
  - The fix is a closed code→words map applied at render. **Records are never edited**: the registrations are a historical record, and the ledger's `compose.mjs` is unchanged.
  - A new **post-build guard** fails the build if any internal code reaches visible text. It caught 3 render points I had missed; all are fixed.
- **UX journeys (6 journeys × NFL, NBA, MLB, UFC, soccer × 390/1440, plus 320/768 spot checks and keyboard):**
  - 5 real defects found and fixed, now in #1120:
    - unnamed NFL tablists;
    - **EPL home/away reversed** in Saved Forecasts;
    - an NBA dead-end link;
    - a raw `run line_posted` label;
    - **graded NFL games missing from past lobby dates**.
  - 15 lower-priority items deferred and documented (`docs/ux/UX_JOURNEYS_2026-10-17.md`).
- **Ask GameTime spend control (#1121):**
  - With `ASK_MODEL_PROVIDER` unset, Production silently fell back to Anthropic (~10× per answer, outside the Gemini cap). It now refuses in Production.
  - The kill switch ignored `off`/`no`; it now treats them as off.
  - The comment claiming no redeploy is needed is corrected.
- **Founder decision packages** (`docs/launch/decisions/`): Privacy/Terms (24 discrepancy rows), Supabase hosted verification (tiers A, A2, B, C, D with no service-role key), Ask spend controls (checklist), and a rollback rehearsal that never switches Production.
- **TRUTH-001 MLB served-revision analysis:** the "29 + 2" figure is superseded (§5). A grader-switch proposal (code only, opt-in) is on `claude/mlb-served-revision-proposal`.
- **Cost-reduction package (per-push replay):** see §5.
- **COMP-001 PropDealer analysis:**
  - Homepage only; their robots.txt disallows everything, and we respected it.
  - Our simulation-data inventory, sport by sport:
    - **MLB:** distributions are saved; individual sampled games are generated but discarded.
    - **NFL:** 5 real sampled worlds and distributions; a play-by-play trace is not possible.
    - **EPL and UFC:** distributions or categorical probabilities only.
    - **NBA:** points-only and stale.
- **Master roadmap:** a dated release record was added (in #1116).

## 2. Newly prepared PRs
| PR | Head | Scope | Ready? |
|---|---|---|---|
| [#1120](https://github.com/yashwantbalaji3/gametimepicks/pull/1120): UX follow-up on #1119 (internal codes in reader words, export guard, 5 journey fixes) | `55153b7970` | presentation only, 0 data | **Yes.** CI green: unit 9,445/9,447 (0 fail), post-build 704/707 (0 fail). Merge third |
| [#1121](https://github.com/yashwantbalaji3/gametimepicks/pull/1121): Ask spend fail-closed | `abb72dff26` | 2 source files and 1 test | **Yes, after the env check.** CI green after re-running a non-reproducible Firefox a11y timeout; unit 9,406/9,408 (0 fail) |
| #1116 (docs): updated | branch head | launch matrix, UAT plan, decision packages, cost baseline and package, verifiers, COMP-001, TRUTH analysis, roadmap record, this report | Docs only |

Branches pushed without a PR (code only):
- `claude/mlb-served-revision-proposal` (`bcac58a407`): the grader-switch proposal.
- `claude/nfl-receipts-stamp-gate` (`252dadb3e2`): parked; saves 0 deployments.
- `claude/results-plain-verdict-terms`: superseded by #1120.

## 3. Existing PR status
| PR | Exact head | CI | Mergeable | Recommendation |
|---|---|---|---|---|
| #1118 | `76c9e3c699` | ✅ | CLEAN | **Approve.** Launch-relevant; recurs after every Thu/Mon game |
| #1101 | `22b0ac73bd` | ✅ | CLEAN | Approve for Sat 10:30–11:00Z (protected) |
| #1088 | `e2dd976085` | ✅ | CLEAN | Approve for Sat 10:30–11:00Z (protected); value lasts through the World Series |
| #1117 | `4b4610366e` | ✅ (fresh ref) | CLEAN | Approve; merge first of the trio |
| #1119 | `4465b08d40` | ✅ | CLEAN | Approve; merge second. Supersedes merging #1115 on its own |
| #1120 | `55153b7970` | ✅ | CLEAN | Approve; merge third |
| #1121 | `abb72dff26` | ✅ (after a re-run of a non-reproducible Firefox timeout) | CLEAN | Approve after confirming `ASK_MODEL_PROVIDER=gemini` in Production |
| #1115 | `8efe2da1eb` | ✅ | — | Do not merge on its own; closes as merged via #1119 |
| #1082 / #1108 / #1111 | — | — | — | Live Hub V2 stays in preview |

## 4. Testing results (this session)
- **#1120 head on a full build:**
  - unit 9,444/9,447 locally; the 1 failure is the inherited pre-#1114 test, and `main`'s version passes 7/7;
  - CI unit **9,445/9,447, 0 fail**;
  - build exit 0;
  - post-build **704/707, 0 fail**, including the export guard and journey checks;
  - Python 92/92; typecheck clean.
- **Journey tests:** 5 fixes confirmed on a rebuilt export; 0 missing targets across 392,451 internal links.
- **#1121:** Ask unit 336/336; full unit 9,405/9,408 locally and 9,406/9,408 on CI, 0 fail.
  - CI's browser accessibility step failed once in Firefox on `/results/` (a 5 s polled check). A local build of the exact head on the same base passes **6/6**.
  - **Re-run result: green.** The failed job re-ran on the same merge commit and passed; #1121 is now CLEAN with quality and python ✅.
- **#1101 / #1088 trial merge on current `main`:** unit 9,431/9,434, 0 fail; Python 92/92.
- **#1118 scenario replay:** 234 evaluations; denials of published forecasts go from 37 to 0.

## 5. Vercel optimization
- **Baseline, per push, 10-09 → 10-17 (8 days):**
  - **58.7 completed builds/day**: 44.7 real content, ≤ 7.7 stamp-only (upper bound) and 6.3 with no build input;
  - **9.6 Ignored-Build-Step pushes/day**;
  - 13.9 canceled and 1.4 failed per day.
- **Levers, ranked:**
  1. **#1088:** about 7–10 builds/day during the MLB postseason.
  2. **Batch the 6 writers that never touch a build input:** −4.2 builds/day and −9.6 ignored/day, **year-round**. Design approval needed; the NFL sim-v2 shadow commits are pre-kickoff evidence, so batching must preserve them.
  3. **NFL window spacing (60 min):** −4.2 builds/day, at the cost of freshness. Founder decision.
- **Build size targets:**
  - MLB boards: ~94 MB measured;
  - footer in the RSC payload: ~65–75 MB estimated;
  - results cells: ~32 MB measured.
  - #1117 showed bytes don't move build CPU measurably.
- **Worker cap:** 0 failures since it shipped, versus 10 memory kills before. Keep #1094 on hold.
- **Not worth pursuing:** an NFL receipts gate on its own (0 deployments saved).
- **No dollar savings are claimed.** That needs a Vercel token or the usage export.

## 6. Live-tracking readiness
- **Sunday capture:** healthy.
  - 3 games: HOU@JAX 401872996 at 13:30Z, NO@NYG 401873000 at 17:00Z, BUF@LV 401873005 at 20:25Z.
  - `players=1`; failed requests are logged as valid JSON; a settle-and-served watcher is included.
  - It runs from a Terminal tab with nohup + caffeinate; keep the Mac on AC power with the lid open.
- **Thursday weaknesses, all addressed in the kit:**
  - the capture died when its Claude task stopped;
  - unquoted `http:000` lines made the log invalid JSON;
  - the watch only read the market record, which says NO_TARGETS because the odds ceiling is exhausted.
- **SEA@DEN check 9:** PASS. The canonical prop settlement was first served at 2026-10-16T17:12:52Z.
- **Open acceptance checks:** envelope-level player stats (Sunday), feed delay and recovery, client cadence and freshness bands, an "under" row, provider failure. Then MLB postseason.
- **Live Hub V2 stays unpublished.**

## 7. Launch blockers, ranked
1. **Privacy/Terms are unpublished while accounts are live** (F-1). The drafts on `main` say "no user accounts", which is false. Counsel must review drafts exported with Production's analytics and support settings, or the approved hash won't match.
2. **Ask spend cap** (F-3). Ask is enabled with no in-app daily cap. Needs #1121, the provider console cap, and an explicit provider.
3. **Hosted Supabase RLS is unverified** (F-2). The procedure is ready.
4. **Rollback rehearsal not done** (F-4). Dry run proposed for Mon 07:00 ET.
5. **#1118 not yet merged** (E-2). The defect recurs on launch morning.
6. **Live windows:** UFC 10/17 and NFL 10/18 with no P0 (E-3).

**Assessment: NO-GO until items 1–4 close or are explicitly accepted.**

## 8. Decisions I need, in order
1. **Approve #1118** at `76c9e3c699`.
2. **Approve #1101 and #1088** for Sat 10:30–11:00Z, as separate merges. I re-check both immediately before.
3. **Approve the UX/HTML trio #1117 → #1119 → #1120** at the listed heads, as merge commits, in that order, outside MLB lineup :25–:45 slots.
4. **Confirm `ASK_MODEL_PROVIDER=gemini` in Production, then approve #1121.**
5. **FD-4 Ask cap:** quota override, budget alert, key restriction.
6. **FD-1 legal inputs** (entity, state, age, contact, reviewer) and **FD-2** account mode (public / invite-only / disabled).
7. **FD-3:** authorize Supabase verification tiers A, A2, B and C.
8. **FD-9:** rollback dry run Mon 07:00 ET.
9. **FD-5:** Vercel token plus spend alert, needed for billing evidence.
10. **FD-8:** NFL odds funding, or "not checked" prices.
11. **Cost design approvals:** batching the no-input writers; NFL window spacing.
12. **TRUTH-001:** approve the restatement plan (new write-once log), the 824424 handling, the treatment of the 216 unverified games, and the grader switch.
13. **COMP-001 product questions:** whether recorded-engine replays fall inside the P242 retirement; whether a human browser review of the competitor is acceptable.

## 9. Updated roadmap
- **Completed:** #1114 (Production-verified).
- **Ready for approval:** #1118, #1101, #1088, #1117, #1119, #1120, #1121, #1116.
- **Blocked on the founder:** legal (F-1), Supabase (F-2), Ask cap (F-3), rollback (F-4), NFL odds, Vercel token.
- **In progress:** the Live Hub V2 Sunday acceptance.
- **Deferred to post-launch:**
  - D-04: settled game pages should show the final score and result link. Needs a lifecycle rule review.
  - D-06: /live grouping when tracking is off.
  - D-11: naming (M6).
  - Site-header 44 px targets.
  - Build-size phase 2.
  - Writer batching.
  - COMP-001 R1–R5 (typical-game spotlight, range strips, saving real MLB sampled games, a pregame↔final overlay).
- **Engineering next:** merge the approved queue and verify each in Production with the verifiers. Then run the Sunday capture report and settle check, and the Tuesday-morning #1118 check.

## 10. Infrastructure and execution cost (actual)
- **Production builds triggered by this session's work: 0.** #1114's merge was skipped by the Ignored Build Step. Since 10-16 19:00Z all 17 Production deployments came from bot data commits.
- **Preview deployments: 0.** `claude/*` branches do not deploy.
- **Paid API calls: 0.** One `POST /api/ask` with an empty message list returned 400 before any model call.
- **Other external requests:**
  - competitor site: 3 requests (homepage, cached re-read, robots.txt);
  - Production: a few single read-only requests.
- **GitHub Actions:** PR CI runs on #1117 (×2 re-runs), #1118, #1120 (×2), #1121 (+1 failed-job re-run).
- **Local:** about 8 full Next builds, serialized with a lock.
- **Billed Vercel figures: not available** (no token).
