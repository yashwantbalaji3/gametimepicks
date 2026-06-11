# Bank Builder — Tracked Ladder vs Featured Card Policy

## Two distinct concepts (kept separate, never silently merged)
1. **Tracked ladder** — the canonical $100→$3,000 paper bankroll. Settled ONLY by
   `scripts/build-bank-builder-ledger.mjs` from the official Suggested-pool Builder
   Pick (`selectPlus100BuilderSlip`) against graded results. This is the audited
   bankroll history.
2. **Featured card** — a special-event paper card (e.g. NBA Finals same-game),
   `trackedLadder: false`. Settled from the official game box score. Shown
   separately; it does **not** advance/reset the tracked bankroll.

## June 10, 2026 — both won, recorded honestly
- **Tracked ladder (MLB):** Luis Rengifo U1.5 hits + Alex Bregman U1.5 hits → WIN →
  bankroll **$211.85 → $444.19** (step up). Settled by the ledger builder from the
  official MLB Stats API. This is the tracked rung.
- **Featured NBA Finals card:** Stephon Castle REB o4.5 (REB 5 ✓) + OG Anunoby PRA
  o23.5 (PRA 38 ✓) → **HIT** → paper $211.85 → $728.76 (+$516.91). `trackedLadder:
  false`. Artifact: `featured-2026-06-10.json` / `featured-latest.json`. Officially
  confirmed from the ESPN Game 4 box score.

## Why the featured card is NOT folded into the ladder
The ledger builder settled the MLB Builder Pick (its real, code-defined input). The
NBA Finals card was a separate event override. Folding it into the bankroll would be
a retroactive rewrite of a code-settled tracked slip without an audited migration —
forbidden. Both wins are shown; only the MLB pick moved the tracked bankroll.

## Going forward (if the user wants NBA same-game as the tracked ladder)
That is a deliberate policy change requiring an audited migration of the ledger
builder's selection input — documented and dated here before any bankroll math
changes. No silent retroactive edits. As of June 10 the tracked ladder remains the
official Suggested-pool Builder Pick.
