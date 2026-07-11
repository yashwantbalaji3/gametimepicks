# Handoff — 2026-05-29 (GameTimePicks, Results UI + Bank Builder)

**Author:** Claude (session ended at ~96% context, stopped per user instruction)
**Repo root:** `/Users/yashwantbalaji/Downloads/gametimepicks`
**Production:** https://gametimepicks.com
**Status at handoff:** healthy, all hard rules green, no in-flight PRs.

This document exists so a brand-new Claude Code session can pick up
without losing context. Read it top-to-bottom before touching code.

---

## 1. Current repo / production state

- **Local SHA:** `1511d10` (matches origin/main and production).
- **Last 5 merges on `main`:**
  - `1511d10` fix(results): simplify results overview copy (#177)
  - `7e1855b` fix(ui): clarify today versus settled results flow (#176)
  - `1210ce6` docs: update UI rebuild handoff (#175)
  - `ff939be` fix(ui): simplify duplicate navigation (#174) — removed `DesktopSportsRail`
  - `270fea3` docs(methodology): update recent learnings after May 28 settlement (#173)
- **Working tree:** clean of source changes. Many untracked legacy
  `SESSION_*` / `HANDOFF_*` markdown files at repo root (carry-over,
  not part of the build). This new handoff is also untracked.
- **Open PRs:** only stale legacy ones (#1, #2, #4, #5). No in-flight
  product PR.
- **Workflows:**
  - `morning-projections.yml` — last success 2026-05-29T16:55 UTC.
  - `nightly-settle.yml` — last success 2026-05-29T10:36 UTC (settled May 28).
- **Production scan results (post-merge of #177):**
  - All 12 banned-betting words: 0 occurrences in rendered HTML.
  - "Confirmed · operator review", "By model profile",
    "only counts finished slips" all present on `/results`.
  - Old jargon ("not consumed", "internal profile", "historical lane
    view") = 0 in production.

If any of those baselines no longer hold when you start, treat that as a
regression and investigate before doing new work.

---

## 2. Current product state

GameTimePicks is a public, free, paper-trading-style parlay tracker.
The product has three live surfaces:

1. **`/projections`** — daily player props with model edge, book-odds
   comparison row (read-only), and explainability copy. NBA + MLB only
   right now (cricket removed, WNBA/IPL paused).
2. **`/parlay-lab`** — daily Suggested parlays + Build-Your-Own +
   Bankroll Plan (legacy). Slips are classified into public risk
   sections (Low / Medium / High / Longshot) using strict odds + leg
   gates set in `app/src/lib/parlay-risk-sections.ts`.
3. **`/results`** — public-era settled-slate dashboard. Compact hero,
   in-page nav pills, sport-mix table, risk-section table,
   risk-section drilldown, Learning Signals (collapsible), and
   plain-English methodology card. Public era starts
   `PUBLIC_PARLAY_RESULTS_START_DATE = "2026-05-27"`.

The "honesty contract" is the spine of the product:
- Hit rate excludes pushes and pending.
- Pending slips never count as wins.
- Sample-size gates are real (`profile` n≥60, `section/sport` n≥40).
- Audit policy signals only show "confirmed" when the policy file
  itself says so. No fabrication.
- "Tracking" never implies edge — it just means "above floor, within
  band."

---

## 3. May 29 data state (read carefully before any settle work)

- **May 29 is NOT settled** as of this handoff. All 15 MLB games for
  the day were "Scheduled" with first pitch around 22:40 UTC
  (~6:40 PM ET) when last checked at 13:32 EDT.
- `app/public/data/parlays/optimizer-graded/2026-05-29.json` → HTTP 404
  (correct).
- The nightly settle workflow at ~10:30 UTC on 2026-05-30 is what
  should settle May 29. Do **not** manually grade May 29 before
  games finish.
- The pregame `optimizer/2026-05-29.json` snapshot exists and powers
  Today's Suggested Parlays on `/parlay-lab`.

If you need to verify before resuming:

```bash
curl -sI https://gametimepicks.com/data/parlays/optimizer-graded/2026-05-29.json | head -1
# expect: HTTP/2 404
```

---

## 4. PR timeline (most recent → older, only the ones that matter)

| PR  | Short title                                  | Why it matters                             |
| --- | -------------------------------------------- | ------------------------------------------ |
| 177 | simplify results overview copy               | plain-English hero preamble; "Confirmed · operator review"; "By model profile" |
| 176 | clarify today vs settled results flow        | adds Pregame chip on /parlay-lab + "today's picks →" pointer on /results |
| 175 | docs: UI rebuild handoff                     | docs only                                  |
| 174 | simplify duplicate navigation                | removed `DesktopSportsRail`                |
| 173 | methodology copy update                      | post-May-28 settle recent-learnings copy   |
| 171 | learning-signals collapsible + mobile fit    | hides hint under `sm:` breakpoint          |
| 170 | results UX restructure (hero + nav pills)    | replaced 737px-tall FreshEraStatusBlock    |
| 167 | learning-signals shortfall copy              | "needs N more decisive slips"              |
| 166 | H+R+RBI grader fix                           | added `batter_hits_runs_rbis` to GRADABLE_MARKETS |
| 160 | learning-signals gate thresholds             | profile n≥60, section/sport n≥40           |
| 159 | pipeline-backed risk-section grading         | adds `byPublicSection` + `bySportBucket` to optimizer-summary.json |
| 156 | sportsbook comparison row                    | read-only book-odds rows on /projections   |
| 153 | game-time threading                          | adds `commenceTime` + `gameTime` per leg   |
| 152 | public risk sections                         | Low/Medium/High/Longshot odds + leg gates  |

There is no current open product PR. The two stalled "Vercel
auto-commit deploys" we saw mid-session resolved themselves on the
next deploy trigger and are not blocking anything.

---

## 5. Current UI state (post-#177)

### `/results`
- **Hero** (`components/results-hero.tsx`):
  - Eyebrow "Results", h1 "Settled slate: {Mon D}".
  - One sentence: "Public tracking from 2026-05-27. Hit rate only
    counts finished slips — pending and pushes are shown separately."
  - Compact lifetime row: hit rate · W·L · decisive · pending.
- **Pointer chip** (in `app/results/page.tsx`): when the latest
  optimizer snapshot is for today and not yet graded, show
  "Today's picks are live on /parlay-lab → view".
- **Section nav pills** (`components/results-section-nav.tsx`) —
  By date · By sport · By section · Signals (with optional `(n new)` hint).
- **Sport-mix table**, **risk-section table**, **risk-section
  drilldown**, **Learning Signals table** (collapsible),
  **Methodology card** (plain English).
- Section heading reads **"By model profile · historical view"**
  (no longer "internal profile · historical lane view").

### `/parlay-lab`
- Mode tabs: Suggested / Build Your Own / Bankroll Plan.
- New for #176: when the active date has an optimizer snapshot but is
  not yet graded, render a Pregame chip:
  "Pregame · Results update after games finish · View latest settled →".
- Today's Suggested cards (`ParlayTicketCard`) — odds, legs, profile
  badge, risk-section badge. No "select" affordance yet (see §8).

### `/projections`
- Player-prop table with book-odds comparison row, edge column,
  market badge, explainability blurb. No major changes in this
  rebuild cycle.

### Layout
- `DesktopSportsRail` was removed in #174; navigation is now header +
  in-page pills only.

---

## 6. Hard rules (verbatim — do NOT relax these)

> Do NOT:
> - settle May 29 before games are final
> - fabricate outcomes / projections / odds / stats / game logs /
>   sides / parlays / hit rates / recent games / learning signals
> - manually edit outcomes
> - use final results to alter same-slate pregame suggestions
> - restore May 26 replay
> - leak May 25 / May 26 public parlay hit rates
> - bring cricket back
> - activate WNBA / IPL
> - expose or print Odds API key
> - commit secrets
> - scrape sportsbooks
> - add fake sportsbook links
> - copy FanDuel / DraftKings exact UI / branding / logos / flow
> - claim active AI / deep learning / ML unless implemented and
>   evaluated
> - consume audit policy in optimizer unless explicitly approved /
>   tested / future-facing
> - loosen guardrails just to make UI fuller
> - use banned betting copy: lock / guaranteed / free money /
>   risk-free / can't miss / cant miss / easy win / easy money /
>   no-brainer / no brainer / sure thing / sharp money.
> - Avoid user-facing "safe" / "safety."

**In particular for Bank Builder (§8):** the word **"lock"** is
*banned* in user-facing copy. Use "Daily Builder Pick", "Today's
Builder Slip", "Builder Card", or "Model Builder Pick" instead.
"Guaranteed" / "sure thing" are banned. Frame Bank Builder as
*educational paper-trading*, never as a tip service.

---

## 7. Known limitations / open papercuts

1. **No multi-slip selection on Suggested cards.** Bankroll Plan
   currently allocates across *all* suggested slips. The user wants
   to allocate only across slips they hand-pick. See §8 + §9 PR 2.
2. **Bankroll Plan subtab is the legacy product.** It will be
   replaced by the selection-driven allocator and (later) Bank Builder.
3. **Results detail density on mobile** — risk-section drilldown and
   sport-mix table still wrap awkwardly under 380px. Not urgent.
4. **No "what changed last 24h" view** on `/results`. Could be a nice
   addition after Bank Builder ships, not before.
5. **Vercel auto-commits with `[skip ci]`** sometimes lag a deploy
   trigger by 30+ minutes. Self-heals on the next real PR merge.
6. **Settled-leans pipeline is single-process.** Any future Bank
   Builder ladder selection must read from the *same* settled JSON we
   already publish; do not introduce a parallel grader.
7. **`PUBLIC_PARLAY_RESULTS_START_DATE` is hard-coded to 2026-05-27.**
   Era-start changes go through that constant — don't backfill.

---

## 8. New product ideas (user-requested, NOT yet implemented)

These are the two product directions the user wants the next session
to design and build. Both are paper-trading framings — no real-money
advice, no affiliate links.

### 8a. Bankroll allocation redesign — "Build My Card"

**Problem the user described:** today's Bankroll Plan auto-allocates
across every Suggested slip. The user wants to *pick* the slips
themselves, enter a bankroll, and have the app allocate **only across
the selected slips.**

**Proposed UX (subject to design pass — see §9 PR 1):**
1. On `/parlay-lab` Suggested tab, each `ParlayTicketCard` gets a
   subtle "Add to my card" affordance (checkbox or pill toggle).
   Selection state is local (no auth needed).
2. A floating / sticky "My Card (N selected)" tray appears once
   ≥1 slip is selected.
3. Tapping "Build allocation" opens (or routes to) an allocator panel
   that asks for bankroll and risk-weight preference (even-weight vs
   confidence-weighted).
4. The allocator outputs per-slip stake suggestions that sum to the
   bankroll. Pure paper-trading framing.
5. The selection is *additive* to existing Bankroll Plan, not a
   replacement on day 1. Once the new path is solid, Bankroll Plan
   becomes a power-user toggle or is retired.

**Honesty rules:**
- Never auto-pick on behalf of the user.
- If a selected slip has graded (it's mid-session), drop it from the
  allocator and show why ("already settled").
- Push-aware: if the user selects a slip that's pending, show "pending"
  in the tray; do not pretend it's locked in.
- The word "lock" is banned. The tray says "Selected slips" or "My card."

### 8b. Bank Builder — ladder paper-trading product

**Concept:** an educational ladder starting at **$100**:

| Step | Start  | Goal   | Multiplier |
| ---- | ------ | ------ | ---------- |
| Bet 1| $100   | $200   | 2.00×      |
| Bet 2| $200   | $400   | 2.00×      |
| Bet 3| $400   | $800   | 2.00×      |
| Bet 4| $800   | $1,600 | 2.00×      |
| Bet 5| $1,600 | $3,000 | 1.875×     |

**Visual:** a tower / thermometer that animates as steps complete.
Screenshot-friendly for X / Reddit (the user explicitly wants this).

**One pick per step.** Model selects a single slip per step based on a
documented heuristic (probably: highest-confidence Low/Medium section
slip that meets the multiplier target). Pick is published before
games start; result is graded on the same nightly pipeline.

**Honesty rules (critical):**
- Framed as a *learning tool* / paper-trading demonstration. No
  "guaranteed", no "lock", no "sure thing", no "risk-free".
- Disclaimer top + bottom: "Educational only. Past results do not
  predict future outcomes. We do not take real money."
- When a step loses, the ladder visibly **resets to $100** with an
  honest "Reset — Bet N lost." Never hide a loss. Never quietly
  restart without flagging it.
- The pick page must show the *pregame* odds and side, never edit them
  retroactively, and never show a "hit rate" for the ladder higher
  than what the settled JSON supports.
- Banned UI words: lock, guaranteed, free money, risk-free, can't
  miss, easy win, no-brainer, sure thing, sharp money. Avoid "safe."
- Use the same risk-section gates from §2 — Bank Builder picks come
  from the *same* slip pool that powers `/parlay-lab`, just filtered
  to one per step.

**Acceptable copy:** "Daily Builder Pick", "Today's Builder Slip",
"Builder Card", "Model Builder Pick", "Ladder reset".

---

## 9. Recommended next PR sequence

Do these in order. Do NOT skip the design / audit step.

**PR 1 — Design + audit doc (no code).**
File: `docs/PARLAY_LAB_BUILDER_DESIGN_2026-05-30.md`.
Contents: current Bankroll Plan audit, the §8a flow with wireframes
in prose, the §8b ladder spec, banned-copy list inline, what each
honesty rule maps to in the data layer. Get user sign-off before
PR 2.

**PR 2 — Selectable Suggested cards + "My Card" tray.**
Touch: `parlay-ticket-card.tsx`, new `my-card-tray.tsx`, a tiny
client-side context. No allocator logic yet — selection state only.
Mobile + desktop snapshot tests.

**PR 3 — Allocator panel.**
Replace (or shadow) `bankroll-plan-panel.tsx` with an allocator that
takes the selected slips + bankroll and outputs stakes. Include
even-weight + confidence-weight modes. Unit tests on the allocator
math.

**PR 4 — Bank Builder prototype (read-only).**
New route `/bank-builder`. Renders the ladder visual + today's
Builder Pick + ladder history. Builder Pick comes from a new helper
in `lib/parlay-suggested.ts` that filters the existing Suggested pool
to one slip per step. No new pipeline. Honesty copy + disclaimers in.

**PR 5 — Bank Builder visual polish + screenshot mode.**
Animation, share-card layout, OG image for `/bank-builder`. No new
data. Mobile-first.

**PR 6 — Docs + methodology update.**
Update `methodology-card.tsx` and a new `docs/BANK_BUILDER_RULES.md`.
Add Bank Builder columns to `/results` if (and only if) a full ladder
has settled.

After PR 6, take a beat and re-verify hard rules and learning signals
before any more product work.

---

## 10. Technical file map (where things live)

### Pages
- `app/src/app/results/page.tsx` — `/results` server entry.
- `app/src/app/parlay-lab/page.tsx` — `/parlay-lab` server entry.
- `app/src/app/projections/page.tsx` — `/projections`.
- `app/src/app/layout.tsx` — root layout (rail removed in #174).

### Components (results)
- `components/results-hero.tsx` — compact hero (§5).
- `components/results-section-nav.tsx` — in-page nav pills + helper
  `summarizeLearningSignalCounts`.
- `components/sport-mix-results-table.tsx`
- `components/risk-section-results-table.tsx`
- `components/risk-section-drilldown.tsx`
- `components/learning-signals-table.tsx` (collapsible)
- `components/methodology-card.tsx` (plain-English)
- `components/pool-availability-note.tsx`

### Components (parlay-lab) — relevant to §8
- `components/parlay-lab-mode-tabs.tsx` — mode tab structure.
- `components/parlay-ticket-card.tsx` — Suggested slip card (PR 2
  adds selection affordance here).
- `components/risk-section-spread.tsx` — Suggested risk-section
  spread.
- `components/bankroll-plan-panel.tsx` — legacy bankroll plan
  (replaced/shadowed by PR 3).

### Libs
- `lib/parlay-results.ts` — `getOptimizerSummary`,
  `getOptimizerGradedDates`, `getOptimizerGradedForDate`.
- `lib/parlay-risk-sections.ts` — `classifySlipBySection`,
  `RISK_SECTION_ORDER`. Source of truth for Low/Medium/High/Longshot.
- `lib/parlay-suggested.ts` — Suggested ParlaySlip types (Bank
  Builder pick helper will live here).
- `lib/parlay-optimizer.ts` — OptimizerSlip types.
- `lib/learning-signals.ts` — `buildLearningSignalRows`,
  `getStatusDisplay`, gate thresholds. **Be careful editing — the
  test file at `lib/learning-signals.test.mjs` locks the honesty
  rules.**
- `lib/results-breakdown.ts` — `summarizeByRiskSection`,
  `summarizeBySportBucket`.
- `lib/results-drilldown.ts` — `buildRiskSectionDrilldown`.
- `lib/data-parlays.ts` — `getLatestOptimizerSnapshot`,
  `getOptimizerSnapshotForDate`.
- `lib/public-parlay-era.ts` — `PUBLIC_PARLAY_RESULTS_START_DATE`.

### Pipeline (Python)
- `pipeline/parlay_optimizer.py` — generates pregame slips + public
  risk sections.
- `pipeline/snapshot_optimizer.py` — writes optimizer/<date>.json
  with `publicRiskSections`.
- `pipeline/grade_optimizer.py` — grades + writes
  optimizer-graded/<date>.json + optimizer-summary.json.
- `pipeline/mlb/settle_mlb_results.py` — H+R+RBI grader
  (GRADABLE_MARKETS includes `batter_hits_runs_rbis`).
- `pipeline/snapshot_parlays.py` — `load_nba_leans` /
  `load_mlb_leans` (enriches game time per leg).

### Data
- `app/public/data/parlays/optimizer/<date>.json` — pregame
  snapshots.
- `app/public/data/parlays/optimizer-graded/<date>.json` — graded.
- `app/public/data/parlays/optimizer-summary.json` — lifetime +
  byPublicSection + bySportBucket.
- `app/public/data/audit/policy.json`
- `app/public/data/audit/daily/<date>.json`
- `app/public/data/mlb/results/settled_leans.jsonl`
- `app/public/data/mlb/results/lifetime_summary.json`
- `app/public/data/results/lifetime_summary.json`

### Workflows
- `.github/workflows/morning-projections.yml` — 13:30 UTC.
- `.github/workflows/nightly-settle.yml` — ~10:30 UTC.

### Reference docs
- `docs/MODEL_LEARNING_ROADMAP_2026-05-28.md`
- `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`
- `docs/MAY29_STATE_HANDOFF.md`
- `docs/MAY29_UI_REBUILD_HANDOFF.md`
- `docs/PARLAY_LAB_DESIGN_OPTIONS_2026-05-28.md` (untracked but useful
  pre-reading for §8)

---

## 11. Verification commands (copy-paste ready)

```bash
# 1. Confirm production SHA matches local
git rev-parse HEAD                    # expect 1511d10 or newer
gh pr list --state open --limit 10    # expect only stale #1, #2, #4, #5

# 2. Check May 29 is still NOT settled (until evening ET)
curl -sI https://gametimepicks.com/data/parlays/optimizer-graded/2026-05-29.json | head -1
# expect: HTTP/2 404 (until ~10:30 UTC next day)

# 3. Hard-rule production scan
curl -s https://gametimepicks.com/results | tr '[:upper:]' '[:lower:]' | \
  grep -oE 'lock|guaranteed|free money|risk-free|cant? miss|easy win|easy money|no.brainer|sure thing|sharp money' | \
  sort -u
# expect: empty

# 4. New copy assertions (post-#177)
curl -s https://gametimepicks.com/results | grep -c "only counts finished slips"   # expect ≥1
curl -s https://gametimepicks.com/results | grep -c "Confirmed · operator review"  # expect ≥1
curl -s https://gametimepicks.com/results | grep -c "By model profile"             # expect ≥1
curl -s https://gametimepicks.com/results | grep -c "not consumed"                 # expect 0
curl -s https://gametimepicks.com/results | grep -c "internal profile"             # expect 0
curl -s https://gametimepicks.com/results | grep -c "historical lane view"         # expect 0

# 5. Pregame chip on /parlay-lab (only valid when today's snapshot exists pre-grade)
curl -s https://gametimepicks.com/parlay-lab | grep -c "Results update after games finish"
# expect ≥1 until tonight's settle

# 6. Public risk sections are live in graded JSON
curl -s https://gametimepicks.com/data/parlays/optimizer-summary.json | \
  python3 -c "import sys,json;d=json.load(sys.stdin);print(list(d.get('byPublicSection',{}).get('lifetime',{}).keys()))"
# expect: ['low', 'medium', 'high', 'longshot'] (some order)

# 7. Local tests (run before any PR)
cd app && npm test
cd .. && pytest pipeline/tests
```

If any of those fail, do NOT start product work — fix the regression
first.

---

## 12. Copy-paste prompt for the next Claude Code session

Paste this verbatim as the first message of the next session:

> Continue from current production state. Production SHA should be
> `1511d10` or newer; verify with `git rev-parse HEAD` and
> `gh pr list --state open`. Before any new feature work, read
> `HANDOFF_2026-05-29_GAMETIMEPICKS_UI_RESULTS_BANK_BUILDER.md` at
> the repo root top-to-bottom and run the §11 verification block.
>
> Then begin **PR 1 from §9** — write
> `docs/PARLAY_LAB_BUILDER_DESIGN_2026-05-30.md` containing:
> - an audit of the current Bankroll Plan subtab
> - the "Build My Card" selection-driven allocator flow (§8a) with
>   prose wireframes for mobile + desktop
> - the Bank Builder ladder spec (§8b) — $100 → $200 → $400 → $800
>   → $1,600 → $3,000, one pick per step, ladder reset on loss,
>   share-card framing
> - the inline banned-copy list (§6 + §8b)
> - mappings from each honesty rule to the data file / lib function
>   that enforces it
> - an explicit non-goal list (what we will NOT build in PR 1–6)
>
> Open this as a docs-only PR titled
> `docs(parlay-lab): bank builder + build-my-card design audit`.
>
> Hard rules (do NOT relax these — full list in §6 of the handoff):
> never settle May 29 before games finish; never fabricate; the word
> "lock" is banned in UI copy; avoid "safe"/"safety"; no
> FanDuel/DraftKings clones; no real-money advice; no cricket
> restoration; WNBA/IPL stay paused.
>
> After PR 1 is merged, pause and ask the user before starting PR 2.

---

## Closing notes (from the outgoing session)

- The current session ended at ~96% context. PR #177 was the last
  merge and is fully production-verified.
- I deliberately did **not** start PR C–F from the previous plan
  (Results detail density, Parlay Lab card readability, methodology
  tightening, handoff PR) because the user explicitly asked to stop
  after #177.
- The §8 product ideas (Build-My-Card + Bank Builder) come straight
  from the user's last design conversation in this session. They are
  fresh; design discussion should happen *before* implementation.
- If the next session disagrees with any choice in §9, treat §8 + §6
  as the constraints and re-plan the PR sequence under those rules.

End of handoff.
