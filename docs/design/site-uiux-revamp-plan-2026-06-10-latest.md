# Site UI/UX Revamp Plan — 2026-06-10

_Information architecture + staged plan. This PR implements the safe quick wins; the
shared-component system is the larger follow-up._

## Information architecture (per surface)
- **Homepage** — "What's live today?" + 5 CTAs (Straight Bets, Suggested Parlays, Build
  Your Own, Bank Builder, Results) + freshness. *(command hero already in place.)*
- **Boards / Straight Bets (`/projections`, `/mlb`, `/nba`)** — individual projections;
  sport/date/status + plain-English confidence; link to Parlay Lab.
- **Parlay Lab (`/parlay-lab`)** — suggested cards grouped by risk; friendly empty states
  with the real reason; link to Bank Builder when a Builder Slip qualifies.
- **Bank Builder** — current bankroll/step/last win/next slip; lifetime record collapsed.
- **Results** — projection accuracy split from parlay-card performance; detail rows
  collapsed; pending-vs-settled explicit; "how to read this page".
- **UFC** — V1 moneyline projections + parlays; props pending a provider.
- **World Cup** — schedule/readiness only (fail-closed) until providers exist.

## Shared components to introduce (follow-up)
`PageHeader` · `FreshnessBadge` · `StatusPill` · `EmptyStateCard` · `MetricCard` ·
`SlipCard` · `ResultSummaryCard` · `SegmentNav` · `DataFreshnessNotice`. Adopt
incrementally per page (no big-bang rewrite) so each change is preview-verifiable.

## Staged rollout
1. **(this PR)** sport-neutral homepage copy + Results "how to read" + audit/plan/ops docs.
2. Results: extract dense tables into `MetricCard`/collapsible `ResultSummaryCard`.
3. Boards: plain-English confidence + freshness badge.
4. Shared component library + homepage "tonight's slate" sport-mix line.
Each stage = its own PR + preview deploy. No model/gate/data changes in any UI stage.
