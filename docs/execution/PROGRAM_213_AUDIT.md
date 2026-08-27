# PROGRAM 213 — Phase 0 Evidence Pack & Release Plan

## Baseline integrity (measured 2026-08-27, ~01:30–02:00 UTC)
- Tip = origin = production: **3d66b6526** (P211 final; `verify:deployment` receipt "Production is
  serving local HEAD"). **Program 212 does not exist** in this repository (no commits, no log);
  the charter's "after Program 212" boundary is satisfied by P211's clean, production-proven
  boundary.
- Fresh baseline suite at this tree: **5,203 tests · 5,199 pass · 0 fail · 4 skipped**; typecheck 0;
  public export rebuilt fresh (290 routes). Protected money untouched: 19–14 · $19,065.40 · crown
  $20,465.40 (md5 affe6b21…).
- Working tree: clean except standing untracked `vp/` + handoff files (never committed by rule).

## The founder screenshot, reproduced and measured
- **1280×800**: the first viewport is the three badge chips (`PUBLIC BETA…`, `PAPER-ONLY…`,
  `DETERMINISTIC…`), a 9-word headline, a 24-word explanatory paragraph, three CTAs and one
  availability line — **257 words in the first viewport, zero live content**. The Simulation Hub
  (real games) starts below the fold. Homepage total: **1,507 rendered words, 5,142px tall**.
- **390×812 (mobile)**: top legal strip + ~270px logo block + slate chips + the three badge chips
  stacked full-width + 3-line headline + 5-line paragraph. **The primary action barely enters the
  viewport; no live content is visible at all.** The founder's complaint is worse on mobile.

## Route copy inventory (rendered words, built export, all 290 routes)
| Route | Words | Reading |
|---|---|---|
| / | 1,507 | manifesto + 11 stacked sections |
| /today/ | 2,397 | slate surface + repeated framing |
| /simulate/ | 4,198 | lobby + per-event copy |
| /markets/ (Picks) | 11,685 | ranked reads + rationale prose |
| /results/ | 16,421 | mostly data rows (legit); summary-first check due |
| /mlb/ · /nfl/ · /ufc/ | 3,698 · 3,578 · 3,800 | hub copy + methodology repeats |
| /epl/ | 1,841 | "not validated out of sample" repeated (incl. in NAV sublabel) |
| /bank-builder/ · /moonshot/ | 1,184 · 845 | P211 already leads with state; history essays below |
| /methodology/ | 3,791 | correct home for moved prose |
| MLB board dates | ~27,000 each | data tables — data-dense, not copy-clutter |

## Copy-class findings (charter §1A) on the primaries
- **DUPLICATE**: the legal sentence renders in the global top strip (`DisclaimerBanner` in
  layout.tsx) AND footer AND per-section "PAPER-ONLY · EDUCATIONAL" chips on product surfaces.
  One global owner is the rule; the compact strip or the footer wins, not both plus chips.
- **METHODOLOGY in nav**: the sports rail sublabels carry methodology ("Schedule + model forecasts
  not validated out of sample" under Premier League) — state labels belong beside actions, not as
  permanent nav prose.
- **FILLER**: the hero paragraph ("GameTime Picks is a simulation-first…") repeats /about +
  /methodology content in the primary viewport.
- **KEEP**: state truths (no qualified card, pregame/settled chips, freshness) are short and
  placed correctly — P209–P211 already built honest state surfaces; this program compresses copy
  around them, never the states themselves.

## Guard constraints found before mutation (repoint, never weaken)
- `home-simulate-flows` + `simulator-first-ux` pin the CTA labels "Simulate Today's Games" /
  "See Today's Picks" and hrefs /simulate /markets /build /results — the redesign keeps all four
  actions and labels; the "headline is simulate-first" assertion is repointed to the primary CTA
  (the charter's ordered headline is action-first: "Today's games, picks and results.").
- `public-beta-safety` forbidden-term list and vocabulary ratchets unaffected — no banned term is
  introduced; removed copy maps to REMOVE/MOVE_TO_HELP with destinations recorded per release.

## Dependency-ordered releases (charter §2–§8)
- **R-A — homepage + global nav reset (P0)**: hero → compact action-first module (≤8-word
  headline, three pinned CTAs, derived live-status strip); chips REMOVED, paragraph REMOVED
  (→ /about|/methodology which already carry it); mobile logo block compressed; nav sublabels
  stripped of methodology prose. First-viewport word + height budgets frozen as guards.
- **R-B — shared shells**: PageHeader/CurrentState/EmptyState/Disclosure primitives where real
  duplication exists (measured, not speculative).
- **R-C — page-by-page walk**: /today, /simulate, /markets, /build, /results, sport hubs,
  products, learn routes, footer consolidation (single legal owner decision executed here).
- **R-D — simulation experience**: one readiness contract already exists (P209 day-view machine +
  scenes); extend refusal-state fixtures per sport adapter; scene budget/reduced-motion proofs.
- **R-E — identity assets**: resolver audit (player-avatar/team-logo conventions from P-portraits).
- **R-F — responsive/a11y/perf matrix** on the built export, three engines.
- **R-G — /launch UX Assurance panel + closure** at one stamp.

Per charter §0B: execution starts with R-A immediately — no approval wait.
