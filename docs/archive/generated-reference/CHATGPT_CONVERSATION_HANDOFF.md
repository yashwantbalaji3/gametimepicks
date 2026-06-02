# Gametime Picks — Full ChatGPT Conversation Handoff

## 0. Project Context

We are working on **Gametime Picks**, a sports analytics / picks website and repo.

Correct repo path:

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
```

Production URL:

```text
https://gametimepicks.yashwantbalaji.com
```

Important repo/workflow norms:
- Always sync from `origin/main` before work.
- Never touch/merge preview branches **#213 / #214 / #215** unless explicitly told.
- Never close stale PRs **#1 / #2 / #4 / #5** unless explicitly told.
- All PRs must be gated on real **`Vercel – gametimepicks`** green and `mergeStateStatus = CLEAN`.
- Work in small focused PRs, squash merge, sync main after every merge.
- Do not bulk-commit untracked scratch notes.
- Use only official repo paths and established scripts/workflows.
- Bank Builder is paper-only / educational.
- Events are schedule-only for unsupported sports.
- MLB/NBA are currently the only sports with projections + parlays.
- Unsupported sports must never get fake odds/projections/parlays/results.

Hard banned user-facing betting copy:
- lock
- guaranteed
- free money
- risk-free
- can’t miss
- cant miss
- easy win
- easy money
- no-brainer
- no brainer
- sure thing
- sharp money
- avoid user-facing “safe/safety” except technical CSS like `safe-area-inset-bottom`.

---

## 1. Current Latest Known State From This Conversation

Most recent accepted state after Claude Code work:

```text
main: 207b685
```

Then Claude later settled June 1 and merged handoff docs:

```text
main: bf4e07a
```

Then Claude was asked to continue with model-quality / automation work, but the user is now asking for a full conversation handoff before continuing.

Latest settlement/projection state from Claude:
- Latest settled slate: **2026-06-01**
- June 1 settlement:
  - Slips: **1W / 47L / 0 pending**
  - Single-leg: **152W / 154L = 49.67%**
  - No pending slips / no unresolved legs
- June 2 projections at around 4:53am ET were **not generated yet**, clock-gated to the official `morning-projections` run at **9:30am ET / 13:30 UTC**.
- June 2 had a real scheduled MLB slate of **15 MLB games**, but no optimizer/snapshot/MLB board yet at that time.
- Results page was verified to show **Settled slate: Jun 1** with no May 25/26 leak and no June 2 settled leak.
- Bank Builder correctly showed an honest empty state while only settled June 1 pool was available.
- Projections page correctly showed June 2 `0/0` with explanation that the board posts each morning.

Most recent handoff doc created in repo:

```text
/Users/yashwantbalaji/Downloads/gametimepicks/docs/HANDOFF_2026-06-02_SETTLEMENT_PROJECTIONS.md
```

Claude corrected that the absolute path must be:

```text
/Users/yashwantbalaji/Downloads/gametimepicks
```

not a hyphenated or malformed path.

---

## 2. Major Work Completed During This Conversation

### A. UI Structural Redesign Previews

The user asked for multiple Vercel previews with different UI concepts.

Initial previews were only color changes and were rejected. Then Claude produced **three structural UI concepts**:

- **#213 — Command Center / Analytics OS**
  - Left rail navigation
  - Persistent status bar
  - Modular dashboard-grid home
  - Draft, open, do not merge

- **#214 — Social Story / Daily Feed**
  - Home as vertical story feed
  - Big shareable blocks and featured slip
  - Draft, open, do not merge

- **#215 — Guided Beginner Flow**
  - Home as 3-step wizard
  - Pick sport → comfort → cards
  - Draft, open, do not merge

These remain preview branches only:
- **#213 / #214 / #215 are draft/unmerged and must stay untouched unless explicitly told.**

A comparison doc was merged:

```text
docs/UI_STRUCTURAL_CONCEPT_PREVIEWS_2026-06-01.md
```

There was a preview URL issue:
- `gametimepicks-...` preview URLs were protected / 401 or stale.
- Publicly openable versions used the duplicate `gametime-picks-...` project.
- A docs fix PR corrected this.

### B. Production Hybrid UI From Concepts

The user liked Concept C’s simplicity but wanted it in the existing gold/vault theme and with real current content.

A four-PR sequence was completed:

1. **#218 — Command Center shell**
   - Desktop left rail
   - Persistent slate status bar
   - Mobile top/bottom nav preserved
   - Gold/vault brand preserved

2. **#219 — Dashboard Home + Featured Slip**
   - Home became a Command Center dashboard
   - Featured slip module
   - Suggested slips builder still initially embedded

3. **#220 — Guided “New here?” module**
   - Additive beginner module
   - Sport → game → comfort → cards
   - Did not replace full builder

4. **#221 — Handoff doc**

Then the user wanted the site organized around five clear paths:
- Straight Bets
- Suggested Parlays
- Build Your Own
- Bank Builder
- Results

Another four-PR sequence was completed:

1. **#223 — Parlay Lab deep-linking + label clarity**
   - `/parlay-lab#suggested`
   - `/parlay-lab#build`
   - `/parlay-lab#bankroll`
   - Relabeled “Suggested” → “Suggested Parlays”
   - Home embed guarded so it does not read/write hash
   - Build My Card preserved

2. **#224 — Rail relabel + Home path cards**
   - Desktop rail plain-language labels
   - Split Parlay Lab into Suggested Parlays and Build a Parlay
   - Added Home “Where do you want to start?” 5-card launcher
   - Hash-aware active highlighting

3. **#225 — De-duplicate Home vs Parlay Lab**
   - Home no longer embeds the full Parlay Lab builder
   - Home now shows compact Suggested Parlays preview
   - Full Build My Card stays on `/parlay-lab`
   - Added Straight Bets framing to Projections
   - Added “saved before games, graded after” framing to Results

4. **#226 — Final handoff doc**

Final simplified-guided-product state:
- Home has five clear path cards, guided module, featured slip, compact suggested preview, sports coverage, track record / bank builder modules.
- Parlay Lab has hash deep-links and full builder.
- Projections framed as Straight Bets.
- Results framed as saved-before-games / graded-after.
- Bank Builder paper-only.
- Events schedule-only.

### C. Sports Expansion + Real Schedules + Mobile UI

The user asked to add popular sports like UFC, MLS, EPL and improve mobile.

The key decision:
- **MLS/EPL initially: “Coming soon” if no real data**
- No fabrication
- Schedule-only allowed if real source data exists
- No unsupported picks

Four PRs were completed for sports expansion:

1. **#227 — Sports & Events Coverage Hub**
   - New `sports-coverage.ts` registry
   - New Sports & Events hub
   - NBA/MLB = projections + parlays
   - NHL/WNBA/UFC/FIFA/IPL = schedule-only where already supported
   - MLS/EPL = coming soon at first
   - Tests added

2. **#228 — Home Sports Coverage module**
   - Compact sports coverage module on Home
   - Reused registry

3. **#229 — Sport-clarity pointers**
   - Projections and Parlay Lab indicate only NBA/MLB are modeled
   - Other sports point to Sports & Events
   - No fake tabs

4. **#230 — Sports-expansion handoff**

Then user asked for **real schedules for all sports** and better mobile.

Claude audited sources and found real timeline-consistent 2026 data was available from ESPN/NHL APIs.

Five PRs completed:

1. **#231 — Real schedules**
   - WNBA refreshed
   - UFC refreshed
   - MLS added as real schedule-only
   - EPL remains Coming soon
   - Real source metadata included: source URL/feed, retrievedAt, range, note
   - Tests updated to ensure no fake picks

2. **#232 — Mobile-first Sports & Events board**
   - Replaced grid with mobile-first board
   - Coverage summary
   - Category filters: Projections + Parlays, Schedule only, Coming soon
   - Cards show next event + source attribution
   - Full schedule tabs below

3. **#233 — Home mobile organization**
   - Better 375px ordering:
     1. Status / active slate
     2. Five path cards
     3. Featured slip
     4. Bank Builder
     5. Sports coverage
     6. Suggested preview
     7. Results / track record
   - Suggested preview trimmed from 3 to 2 cards
   - Removed redundant Projections sidebar module

4. **#234 — Mobile nav**
   - Added fifth bottom nav item: Sports
   - Schedule-only routes highlight Sports
   - Top mobile nav relabeled Events → Sports
   - Desktop rail unchanged

5. **#235 — Final handoff**

Final sports coverage:
- MLB: Projections + Parlays
- NBA: Projections + Parlays
- NHL: Schedule only
- WNBA: Schedule only, refreshed
- UFC: Schedule only, refreshed
- FIFA / World Cup: Schedule only
- IPL: Schedule only
- MLS: Schedule only, newly added with real fixtures
- EPL: Coming soon

Important:
- No unsupported sport has odds/projections/parlays.
- EPL stayed Coming soon because no published 2026-27 fixtures were available.
- MLS became schedule-only because real fixtures existed.

### D. Settlement / Learning / June 2 Readiness

The user asked Claude to settle June 1 and prep June 2.

Claude:
- Synced main.
- Verified June 1 had 9 MLB games and all were final.
- Dispatched official `nightly-settle` workflow with `settle_date=2026-06-01`.
- The official workflow committed settlement as `43483d0`.
- Settlement summary:
  - 48 slips
  - **1W / 47L / 0 pending**
  - Single legs: **152W / 154L**
  - All decisive
  - No settlement gaps
- Learning notes PR #236:
  - Observational only
  - Recurrent weakness: `batter_total_bases`
  - `audit/policy.json` had 0 confirmed signals
  - Nothing wired into optimizer
- Handoff PR #237:
  - `docs/HANDOFF_2026-06-02_SETTLEMENT_PROJECTIONS.md`
- At 4:53am ET, June 2 projections were correctly clock-gated to 9:30am ET:
  - No early dispatch
  - No fabrication
  - June 2 board/optimizer/snapshot missing except schedule placeholder
  - June 2 had 15 MLB games scheduled

---

## 3. User Concern: Bad Model Performance

The user is upset about:
- Screenshot showing Results with **settled slate Jun 1**
- Lifetime public era around **13.1%**
- June 1 public result **1W / 47L**
- User wants daily automation:
  - 2am ET settlement
  - after settlement: learning review / model improvement
  - morning refresh for projections/parlays
- User wants the model to improve toward much higher hit rates.

Important framing:
- Do **not** promise 70% hit rate.
- Do not write user-facing claims of 70%.
- Goal should be **higher-quality, evidence-based, disciplined picks**.
- If quality is weak, show fewer slips or honest empty states.
- Avoid overfitting one slate.
- Never fabricate.

A prompt was drafted for Claude to perform a model-quality / automation sprint, but the user asked for a full conversation handoff first.

---

## 4. Recommended Next Prompt To Claude Code

Use this if continuing from here:

```text
Read this handoff and continue from the current repo.

Use repo path:
cd /Users/yashwantbalaji/Downloads/gametimepicks

Current context:
- Latest known main after June 1 settlement handoff was `bf4e07a` or newer.
- Latest settled slate is June 1.
- June 1 result was very poor: 1W / 47L / 0 pending.
- June 2 projections were clock-gated to the 9:30am ET `morning-projections` run.
- Sports & Events mobile UI is complete.
- MLS schedule-only, EPL coming soon.
- MLB/NBA are the only projection/parlay sports.
- Preview branches #213/#214/#215 must remain draft/unmerged and untouched.
- Stale PRs #1/#2/#4/#5 must be left alone.

Your task:
Perform a serious model-quality and automation audit focused on improving the current projections/parlays logic without fabrication or overfitting.

PHASE 0 — Sync + Baseline
Run:
git status --short
git rev-parse HEAD
git ls-remote origin main | cut -f1
git rev-list --left-right --count HEAD...origin/main
gh pr list --state open --limit 30
gh run list --workflow nightly-settle --limit 8
gh run list --workflow morning-projections --limit 8
gh run list --workflow auto-refresh --limit 8

Report:
1. branch
2. local SHA
3. origin/main SHA
4. ahead/behind
5. working tree
6. open PRs
7. latest settled slate
8. active slate
9. June 2 projection status
10. latest nightly-settle
11. latest morning-projections
12. safe to proceed

Fast-forward pull if behind.

PHASE 1 — Pipeline Audit
Audit:
- settlement workflow
- projection workflow
- parlay optimizer
- publicRiskSections generation
- Bank Builder selector
- learning/audit policy writer
- whether audit/policy.json is consumed
- how recent10, odds, market hit rates, player stats are used
- how Low/Medium/High/Longshot are constructed
- same-game / duplicate-player / same-team rules
- pending/unresolved handling
- Bank Builder +100 selection

Report current model inputs, gates, weaknesses, and leakage risks.
Do not code yet.

PHASE 2 — June 1 Failure Analysis
Compute:
- all public slips W/L/P
- by risk section
- by sport
- by market
- by leg odds bucket
- by parlay size
- by same-game concentration
- by repeated players
- individual leg hit rate vs parlay hit rate
- Bank Builder result if applicable
Compare across public era May 27, May 28, May 29, May 30, June 1.
Do not use May 25/26 public hit rates.
Document recurring weak/strong markets.
Do not overfit one day.

PHASE 3 — Quality-Gate Plan
Before coding optimizer changes, propose a conservative tested plan.
Consider:
- fewer slips if quality weak
- tighter Low Risk
- suppress or penalize weak markets only with enough sample
- avoid stacking volatile batter markets
- limit same-game concentration
- limit repeated market types
- stricter Bank Builder pool
- honest empty states if nothing qualifies

Report exact rules, files, tests, rollback plan.
Pause before wiring live optimizer changes if not obviously safe.

PHASE 4 — Implement Only Safe Tested Improvements
Preferred order:
1. pure helper functions + tests
2. shadow audit comparing old vs new
3. UI empty-state/metadata if fewer slips
4. wire to publicRiskSections / Bank Builder only if proven safe

Hard rules:
- no same-slate leakage
- no same-day result contamination
- do not consume audit/policy.json unless explicitly approved
- do not use May 25/26 public rates
- no fabrication
- no unsupported sports
- no guaranteed claims

PHASE 5 — Automation Design
Audit current workflows:
- nightly-settle
- morning-projections
- auto-refresh
Determine whether:
- settlement should move to 2am ET
- morning projections should move to 8am ET or remain 9:30am ET
- a post-settlement learning audit step can be added safely
Avoid paid API waste and duplicate/racing workflows.
Report plan before editing YAML.

PHASE 6 — June 2 Projection Verification
If June 2 morning-projections has completed:
- pull main
- verify June 2 boards / optimizer / snapshot / publicRiskSections
- verify Projections, Parlay Lab, Build My Card, Bank Builder
- verify Results remains latest settled June 1
If not completed or failed:
- inspect logs
- diagnose
- do not fabricate

PHASE 7 — Sitewide Verification
Run:
cd app
npx tsx --test src/lib/*.test.mjs
npx tsc --noEmit
npm run build

Browser verify:
/
/projections
/parlay-lab
/parlay-lab#suggested
/parlay-lab#build
/bank-builder
/results
/events
desktop 1280
mobile 375

PHASE 8 — Final Handoff
Create:
docs/HANDOFF_2026-06-02_MODEL_QUALITY_AUTOMATION.md

Include:
- main SHA
- PRs and SHAs
- June 1 failure analysis
- model quality findings
- what changed
- what stayed observational
- automation plan
- June 2 projection status
- verification summary
- known limitations
- next work

Merge only on real `Vercel – gametimepicks` green + CLEAN.

Hard rules:
- no fabricated data
- no unsupported sport picks
- no same-slate leakage
- no June 2 settlement before games final
- no May 31 backfill
- no preview branch edits
- no stale PR closures
- no guaranteed hit-rate claims
- Bank Builder paper-only
- Events schedule-only
```

---

## 5. Core Hard Rules To Preserve

Always carry these forward:

1. **No fabricated data**
   - No fake schedules
   - No fake matchups
   - No fake odds
   - No fake projections
   - No fake parlays
   - No fake results
   - No fake recent10
   - No fake hit rates

2. **No unsupported sports picks**
   - UFC / MLS / EPL / WNBA / FIFA / IPL / NHL must stay schedule-only or coming soon unless a full model + grading pipeline exists.

3. **No same-slate contamination**
   - Do not use June 1 results to change June 1 picks.
   - Do not settle June 2 before games are final.
   - Do not use same-day results to change same-day suggestions.

4. **No May 25/26 public hit-rate leakage**
   - Public era begins 2026-05-27.
   - Older data may exist internally but must not leak as public performance.

5. **Bank Builder paper-only**
   - Educational / simulated bankroll only.
   - No real-money advice.

6. **Events schedule-only**
   - Schedule-only sports remain schedule-only.
   - Coming soon sports have no fake schedule.

7. **Preview branches untouched**
   - #213 / #214 / #215 remain draft/unmerged unless explicitly instructed.

8. **Stale PRs untouched**
   - #1 / #2 / #4 / #5 stay open unless explicitly instructed.

9. **Vercel merge gate**
   - Merge only when real `Vercel – gametimepicks` is green and `mergeStateStatus = CLEAN`.

---

## 6. Useful Verification Commands

From repo:

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git status --short
git rev-parse HEAD
git ls-remote origin main | cut -f1
git rev-list --left-right --count HEAD...origin/main
```

Frontend:

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks/app
npx tsx --test src/lib/*.test.mjs
npx tsc --noEmit
npm run build
```

Workflow status:

```bash
gh run list --workflow nightly-settle --limit 8
gh run list --workflow morning-projections --limit 8
gh run list --workflow auto-refresh --limit 8
```

PR state:

```bash
gh pr list --state open --limit 30
gh pr view <PR> --json state,mergeStateStatus,statusCheckRollup,headRefName,baseRefName,files
```

Gate requirement:
- real `Vercel – gametimepicks` SUCCESS
- duplicate may exist but merge must be CLEAN
- `mergeStateStatus = CLEAN`

---

## 7. Key Files / Areas Mentioned

Likely relevant files:
- `app/src/lib/parlay-suggested.ts`
- `app/src/lib/parlay-risk-sections.ts`
- `app/src/lib/leg-quality-gates.ts`
- `app/src/lib/sports-coverage.ts`
- `app/src/lib/event-schedules.ts`
- `app/src/app/page.tsx`
- `app/src/app/projections/page.tsx`
- `app/src/app/parlay-lab/page.tsx`
- `app/src/components/parlay-lab-builder.tsx`
- `app/src/components/parlay-lab-mode-tabs.tsx`
- `app/src/components/command-rail.tsx`
- `app/src/components/mobile-bottom-nav.tsx`
- `app/src/lib/nav-active-route.ts`
- `pipeline/parlay_optimizer.py`
- `pipeline/grade_optimizer.py`
- `pipeline/audit_signal_policy.py`
- `scripts/automation_settle.sh`
- `.github/workflows/nightly-settle.yml`
- `.github/workflows/morning-projections.yml`

Important docs already created:
- `docs/HANDOFF_2026-06-02_SETTLEMENT_PROJECTIONS.md`
- `docs/LEARNING_NOTES_2026-06-01_SETTLEMENT.md`
- `docs/HANDOFF_2026-06-01_REAL_SCHEDULES_MOBILE_UI.md`
- `docs/HANDOFF_2026-06-01_SIMPLIFIED_GUIDED_PRODUCT_FINAL.md`
- `docs/UI_STRUCTURAL_CONCEPT_PREVIEWS_2026-06-01.md`

---

## 8. User’s Current Strategic Direction

The user believes:
- Product success depends on tracking results daily.
- The model must improve from misses.
- 1W / 47L is unacceptable.
- Wants a daily 2am settlement and morning projection refresh.
- Wants an “agent” / workflow after settlement to review results and keep improving model.

The safe interpretation:
- Build an **observational learning loop** first.
- Use settled historical data only.
- Add conservative, tested quality gates only if statistically justified.
- Prefer fewer suggestions over bad forced suggestions.
- Do not claim or market guaranteed 70% hit rate.
- Do not overfit to one bad slate.

Recommended framing:
> “We can’t promise a hit rate, but we can make the product more disciplined: track every pick, analyze settled results, reduce low-quality slips, and show fewer cards when the model does not have enough edge.”

---

## 9. Next Best High-Level Work

After syncing current main, the next best work is:

1. Confirm whether June 2 projections generated after the 9:30am ET run.
2. If generated:
   - verify `/projections`
   - verify `/parlay-lab`
   - verify Bank Builder fresh slip
   - verify Results latest settled June 1
3. Perform deep June 1 model failure analysis.
4. Create / update learning docs.
5. Design a conservative quality gate plan.
6. Implement only safe tested helpers / shadow audits first.
7. Do not wire optimizer changes without clear tests and no leakage.
8. Audit daily workflow schedule:
   - 2am ET settlement?
   - 8am vs 9:30am projections?
   - post-settlement learning audit?
9. Write final handoff doc.

---

## 10. Final Note For New ChatGPT Session

This conversation has many Claude Code transcripts. The important thing is not to replay old steps. Start from the actual repo state and verify from Git / files / workflow logs.

First response in a new ChatGPT/Claude session should be:
- sync state report
- active slate / latest settled
- whether June 2 projections exist
- whether any PRs are open
- safe next action

Do not assume data exists until verified.
Do not make model or workflow changes without first auditing the real code.
