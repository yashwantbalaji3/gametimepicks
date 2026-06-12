# Bank Builder Page Cleanup (latest)

Presentation-only cleanup of `/bank-builder`. No bankroll/ledger/step/nextPick mutation; zero
data-file changes.

## Removed from the page
- Plus100 "Builder Slip" picker (`TodaysBuilderPick`) — the +100 educational builder + its MLB
  player names (Seager / Hoerner etc.).
- The "Separate $100 educational builder" wrapper + the World Cup Flex Card (its leg now lives in
  the official Step-3 card).
- "Original tracked ledger (audit)" collapsible, "Last Settled Builder Slip" card, "Current Paper
  Run" + audit-detail blocks, the Eligibility-criteria panel, the NBA-Finals featured card, and the
  share card.
- Long methodology / internal notes / candidate-rejection copy.

## What remains (clean 5-section product page)
1. Hero + 4 KPIs: bankroll $728.76 · Step 3/5 · public record 2–0 · today's card Pending.
2. The 5-step ladder (Step 3 highlighted).
3. Today's official Step-3 World Cup card (Mexico ML −235 + South Korea or Czechia DC −270 →
   −105, $728.76 → $1,423.64, pending) — or a clean pending state when none.
4. Previous hits — settled ladder wins + the 2–0 record.
5. A one-line paper-only footer linking to /learn#bank-builder.

## /today bankroll fix
`/today` was reading the internal `summary-latest.json` ($444.19). Switched it to
`loadPublicBankBuilderSummary()` → now shows the public **$728.76 / Step 3**, matching
`/bank-builder`. Stale $444.19 no longer appears.

## Proof of no mutation
Bankroll/ledger artifacts unchanged (git shows zero `public/data` edits). The official Step-3 card
is rendered from real projections and stays PENDING — the ladder only changes after settlement.
