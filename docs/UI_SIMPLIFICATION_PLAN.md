# UI Simplification Plan (2026-07-14)

The report is now honest and complete; the next win is making it *simple*. A mature sim product answers the
user's question in the first screen and hides everything else behind one tap. This is the plan to get there —
**no money, no settlement, no capability changes**; pure information architecture.

## Principle
**Answer first, detail on demand.** The first post-generate screen is the answer (the `SimulationResultSummary`).
Everything else is progressively disclosed. We already do this on MLB (collapsed accordions) and now WC (result
summary above the market detail). This plan tightens it.

## Current state (good)
- WC report: `SimulationResultSummary` (probability center) → `WcGameCenter` (market detail) → secondary.
- MLB report: `MlbSimulationResultSummary` (strongest leans) → collapsed "More detail" accordions.
- `/simulate` lobby: simulate-first, availability chips per game.

## Simplification backlog (ranked, all display-only)
1. **One result grammar across sports.** WC and MLB summaries now share the `Simulation result` heading + the
   same card chrome. Extract the shared shell (heading, market-implied/run-count badge, honest footer) into one
   `SimulationResultShell` so the two summaries can't drift. *Low risk, high consistency.*
2. **Collapse the WC market detail by default.** `WcGameCenter` should sit inside a single "Full market detail"
   accordion below the summary (like MLB's "More detail"), so the probability center is the whole first screen.
3. **One "what you're looking at" line, not three.** Each report currently repeats the market-implied / 90' /
   paper-only disclaimer in a few places. Consolidate to one honest footer per report (the summary's), and drop
   the duplicates.
4. **Availability chips → the report header.** Surface the per-market availability (from `market-coverage.ts`)
   as small chips at the top of the report, so "what's real here" is answered before scrolling.
5. **Kill dead surfaces on the report.** Any panel that renders empty ("coming soon" with nothing behind it)
   should be a single quiet line, not a full card. Audit for empty cards.
6. **Mobile: the result summary must fit one viewport.** 3-way bar + 4 snapshot tiles + one-line explanation.
   Push the footer/disclaimer below the fold.

## Guardrails (unchanged)
- No market is *added* to the UI here — this is layout only.
- The honest footers stay (market-implied / player-prop / paper-only). Simplify, don't delete the truth.
- No money, no portfolio, no settlement touched.

## Definition of done
A first-time user presses "Generate Simulation Report", and the first screen answers "who's favored, by how
much, and is there an edge?" — without scrolling, on mobile, in both sports, with the source honestly labelled.
