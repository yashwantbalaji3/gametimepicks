# Single Unified Simulation Report — Audit + Rebuild (2026-07-09)

**Goal: the post-generate game page reads as ONE FreeSim-style report, not "runner output + a competing
tabbed dashboard + duplicated cards."** No model/pick/settlement/money change; the Generate gate stays
intact. Money md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $19,065.40, $0 exposure — unchanged.

---

## Duplication the previous (collapse-only) pass left behind

The last mission collapsed the runner's heavy tail but left two structural duplications:

1. **The strongest lean rendered up to 4×** — the runner's Central read (section 3), the `strongest_lean`
   takeaway card, the `biggest_edge` takeaway card (identical max-edge pick), and Biggest-leans #1.
2. **Two competing report surfaces** — the `GameSimulationRunner` done-phase (answer-first sections +
   collapsed detail) AND, below it, a full `PostRevealTabs` dashboard whose Overview repeated the market
   snapshot (`MlbGameCenter`), whose Player-props / Distributions tabs repeated the runner's prop/dist
   content, and whose Advanced tab held the dense report.

## What the audit answered

- **Duplicate strongest lean:** Central read + `strongest_lean` takeaway + `biggest_edge` takeaway +
  Biggest-leans #1 (`deriveTakeaways` emits `strongest_lean` and `biggest_edge` from the *same* pick).
- **Duplicate market snapshot / game center:** runner priced-prop snapshot vs the tabs' `MlbGameCenter`
  Overview; for WC, `WcGameCenter` was the Overview tab.
- **Heavy sections still early:** already collapsed in the runner last pass; the tabs re-exposed them.
- **Above the fold:** report header, market snapshot, simulator output, one main read, top leans.
- **Expandable detail:** full pick table, distributions, model-vs-market agreement, unavailable modules,
  recap, the dense advanced report, methodology.
- **Sport-honest modules:** soccer stays market-implied (no 10,000-run); MLB team totals / full run
  distributions stay unavailable unless artifact-backed — unchanged.
- **Reusable safely:** `ExpandableReportSection`, `MlbGameCenter`, `WcGameCenter`, the runner's section
  components, `playerPropsTab`, `MlbGameLabReport`, `MethodologyPanel`.

## The rebuild (Option B — runner as the single spine)

**One report = the runner's done-phase.** The `PostRevealTabs` dashboard is removed from the game
report; the remaining detail is a small stack of collapsed disclosures under the runner.

MLB post-generate order (all in the runner's `done` phase, gated):
1. **Report header** — matchup, model/runs (only when artifact-backed), headline, projected score.
2. **Market Snapshot** — `MlbGameCenter` (de-vigged moneyline / total / run line), threaded into the
   runner via a new `marketSnapshot` prop → "what the book says" leads.
3. **Simulator Output** — priced-prop snapshot (the model's priced picks).
4. **Main Read** — Central read, the single strongest lean (**rendered once**).
5. **Top Leans** — biggest leans, top-6 compact cards.
6. **Key Takeaways** — now META only (`MainTakeaways` filters out `strongest_lean` + `biggest_edge`, so
   the hero lean is not repeated as takeaway cards) — highest confidence + most common market.
7. **Collapsed detail** — Full pick table · Outcome distributions · Model-vs-market agreement ·
   Unavailable modules · Copy recap (from last pass), then `mlbReportDetails`: **Player props by market ·
   Advanced report (dense report + spotlight + legacy market tabs) · Methodology**.

Soccer/WC: the runner's `postReveal` is now `wcReport` = `WcGameCenter` (market snapshot + match center +
expanded markets + regulation read) followed by collapsed disclosures (Advanced report · Scorers &
what's coming · Methodology). No `PostRevealTabs`, no 10,000-run claim.

## Integrity

- **Gate intact:** everything renders only in the runner's `done` phase / `postReveal`. Built painted
  DOM carries the Generate CTA + idle module-name preview pills (e.g. "Market snapshot", "Central read")
  but **no** actual prediction — win-probability values, the strongest-lean pick, the advanced report,
  and the player-props content are all absent pre-click (build-verified).
- **No formula/money change:** pure presentation. `deriveTakeaways` is unchanged (its unit tests hold);
  the dedup is a render-time filter. Money md5 unchanged; forensic PERFECT; health HEALTHY.
- **Honesty preserved:** soccer market-implied, MLB 10,000-run only where artifact-backed, unavailable
  modules stay collapsed + honest.

## Residuals

- The runner's section components (PricedPropSnapshot, CentralRead, etc.) still live inside
  `game-simulation-runner.tsx` — a future pass could extract them into a shared `UnifiedGameReport` for
  reuse on non-sim pages.
- The `PostRevealTabs` + `MlbDistributionsPanel` components remain in the repo (no longer used by the
  game report) — safe to remove in a later cleanup.
