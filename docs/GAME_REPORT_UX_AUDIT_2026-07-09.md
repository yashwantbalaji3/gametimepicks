# Game Report UX Audit — FreeSim-style "answer first" (2026-07-09)

**Goal: the revealed game report should read answer-first — matchup → market → simulation → best few
leans — with heavy content one tap away, not dumped in the main path.** No model/pick/settlement/money
change; the Generate gate stays intact.

Money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, exposure $0 — unchanged.

---

## Where the clutter actually lives

The revealed MLB report is TWO stacked surfaces:

1. **`GameSimulationRunner` done-phase** (`game-simulation-runner.tsx:1004-1145`) — a 10-section
   dashboard rendered ABOVE the tabs:
   1 Header (matchup + model/runs + headline + projected score) · 2 Priced-prop snapshot · 3 Central
   read (strongest lean) · 4 Main takeaways · 5 Biggest leans (top-6) · **6 Full pick table (12 rows) ·
   7 Distributions · 8 Model-vs-market agreement · 9 Unavailable modules · 10 Copy recap**.
2. **`PostRevealTabs` dashboard** (`mlbDashTabs`) below it: Overview (`MlbGameCenter` market snapshot) ·
   Player props · Distributions · Advanced report · Methodology.

**The problem:** sections **6–10 are heavy and sat in the main reading path**, and the tabbed dashboard
partly duplicates them below. The WC report is already tab-clean — `WcSimulationRunner`'s done-phase is
just the tabbed dashboard (Overview = `WcGameCenter`), so the clutter is MLB-specific.

## What appears above the fold (before this change)

Header, priced-prop snapshot, central read, main takeaways, top-6 leans — **then** the full 12-row pick
table, distribution bars, a model-vs-market diagnostic, an unavailable-modules block, and a copy-recap
block, all expanded. That tail is what makes the page feel long.

## Classification

| Section | Verdict | Action |
|---|---|---|
| 1 Header (matchup, run count, headline, projected score) | user-critical (sim output) | keep visible |
| 2 Priced-prop snapshot | user-critical (market read) | keep visible |
| 3 Central read (strongest lean) | user-critical | keep visible |
| 4 Main takeaways | user-critical | keep visible |
| 5 Biggest leans (top-6) | user-critical | keep visible |
| 6 Full pick table (12 rows) | heavy detail | **collapse** (closed by default) |
| 7 Distributions | heavy detail | **collapse** |
| 8 Model-vs-market agreement | diagnostic | **collapse** |
| 9 Unavailable modules | honest-but-noisy | **collapse** (small disclosure) |
| 10 Copy recap | secondary | **collapse** |
| Tab: Advanced report (dense `MlbGameLabReport` + spotlight + legacy SportShell) | power-user | already behind a tab ✓ |
| Tab: Player props / Distributions / Methodology | on-demand | already tabs ✓ |
| `MlbGameCenter` "Overview" tab | market snapshot | keep (it's the tab's market landing) |

Redundancy noted (not changed this pass — see residuals): the strongest lean appears in three framings
(central read + a takeaway card + biggest-leans #1), and the runner's answer-first sections partly
overlap the tabbed dashboard below.

## Change shipped

A reusable `ExpandableReportSection` (`src/components/game/answer-first-report.tsx`) — a native
`<details>` disclosure, closed by default, mobile-tappable — now wraps runner sections **6–10** under a
"Deeper analysis · expand as needed" divider. Each disclosure renders ONLY when it has real content (no
empty toggles: the pick table, agreement, and unavailable blocks self-hide when empty). Sections 1–5
stay visible, so the fast read is the market/simulation answer + the top leans; charts, the full ledger,
diagnostics, unavailable modules, and the recap are one tap away.

Sport hygiene: the unavailable-modules disclosure renders `view.unavailableModules` — which comes from
the game's OWN artifact — and the tab arrays are sport-gated (`mlbDashTabs` only when `isMlbSim`,
`wcDashTabs` only when `isWcSim`), so MLB never surfaces soccer-only modules (corners/cards/xG/scoreline)
and vice-versa.

## What did NOT change

No model formula, pick logic, settlement, money, or product-card code. The pre-Generate gate is
untouched (all of this still renders only in the runner's `done` phase). No shadow-calibration value is
exposed. The reveal payoff (sections 1–5) is unchanged; only the heavy tail moved behind disclosures.

## Residuals (candidate follow-ups)

- Reconcile the runner's answer-first sections with the tabbed dashboard below (some overlap) — a larger
  restructure deferred as higher-risk.
- De-duplicate the strongest lean (central read + takeaway + biggest-leans #1).
- Optionally collapse `WcGameCenter`'s expanded markets (Asian handicap / team totals) on soccer.
