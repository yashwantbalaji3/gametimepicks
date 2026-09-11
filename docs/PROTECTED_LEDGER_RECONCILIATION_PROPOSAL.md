# Protected-ledger reconciliation — proposal (P256 · Task 9)

**Status: PROPOSAL — nothing here has changed protected money.** `public/data/mr-dub/portfolio.json`
is byte-identical (md5 `affe6b21071f2b3be96bb2774eb347c3`). Numbers are reproducible with
`node app/scripts/mr-dub/reconcile-protected-era.mjs --now <ISO> --write`
(report: `data/internal/mr-dub/reconciliation-proposal.json`).

## The decision so far

2026-09-10, founder: repair Moonshot on the protected record, and **let Moonshot move the core
bankroll** — on the condition, stated with that choice, that Bank Builder's post-July results fold in
too, with the reconciliation prepared as a proposal first. This is that proposal.

## Where the protected record stands

| | Value |
|---|---|
| Last built | 2026-07-07 (the builder only runs from `settle_soccer_day.sh`, retired with the World Cup; automation deliberately never commits this file) |
| Current bankroll | $19,065.40 |
| Crown | $20,465.40 |
| Record | 19–14 (Bank Builder steps) |
| Moonshot | a separate section, one legacy June card (0–1), never part of the bankroll |

## What happened since (official, write-once receipts)

26 receipts, **2026-08-15 → 2026-09-09**, graded from the official box score and linescore.

- **Bank Builder: 7 won, 7 lost.** **Moonshot: 0 won, 14 lost** (the old 4–5-leg longshot cards).
- **76 rows excluded as never placed**: from 2026-08-18 to 2026-09-05 the daily portfolio was frozen (its
  roll-forward never ran), so those receipts describe cards nobody played.
- The dual-ladder card store holds no settled result after 2026-07-07 — the receipts are the complete source.

## Two rules

**Rule S — the record's own written rule** (`daily-portfolio-settle.ts`): a lost step costs the lane its
seed (Bank Builder $100, Moonshot $25); a won step rolls and never moves the bankroll.

| | Rule S |
|---|---|
| Bank Builder seeds lost | −$700 |
| Moonshot seeds lost | −$350 |
| **Bankroll** | **$19,065.40 → $18,015.40** |

**Rule B — Rule S, plus banking the wins the frozen-rung defect never carried.** Until the P255 fix the
generator dealt every lane a fresh $100 Step 1 each morning, so some wins were neither ridden nor lost:

| Lane | Won on | Paid | Replaced by | Banked under Rule B |
|---|---|---|---|---|
| Bank Builder A | 2026-08-17 | $191.13 | 2026-09-06 Step 1 $100 | +$91.13 |
| Bank Builder A | 2026-09-06 | $223.54 | 2026-09-07 Step 1 $100 | +$123.54 |
| Bank Builder B | 2026-09-07 | $307.93 | 2026-09-08 Step 1 $100 | +$207.93 |
| Bank Builder A | 2026-09-08 | $200.13 | 2026-09-09 Step 1 $100 | +$100.13 |
| Bank Builder B | 2026-09-09 | $300.85 | 2026-09-10 Step 1 $100 (settles tonight) | +$200.85 once tonight's receipt exists |

| | Rule B |
|---|---|
| **Bankroll** | **$19,065.40 → $18,538.13** (→ $18,738.98 after tonight's receipt) |

**Recommendation: Rule S.** It is the rule the protected record has always used, so no new accounting is
invented to settle the past. The five uncarried wins are disclosed on the record page as exactly that —
wins the ladder never rode because of a defect fixed on 2026-09-10 — rather than credited after the fact.

## What changes, and what never does

- **Changes:** the current bankroll (by the chosen rule); the core record becomes **26–21** (Bank Builder
  steps); Moonshot gets its own line in the same record set (**0–14**) with its money now inside the
  bankroll. The protected record holds SETTLED money only — a live card's seed at risk stays in the
  daily portfolio's open exposure, and reaches the record only when its day is folded.
- **Never changes:** the crown ($20,465.40); every entry through 2026-07-07; any settled day (a day, once
  folded, is never restated).
- **From 2026-09-11 on:** nightly settlement applies the same rule to both products from each night's
  receipt and commits `portfolio.json` — the one protected file automation will then write, under the
  founder's authorization. The ten whole-file md5 pins are replaced by an invariant guard: history
  through 2026-07-07 byte-identical, crown unchanged, bankroll = the July figure + Σ receipts under the
  chosen rule.

## Decision

**Rule S — chosen by the founder on 2026-09-10.** Applied the same night by
`app/scripts/mr-dub/fold-protected-era.mjs --apply`; nightly settlement folds each new receipt from then on.
