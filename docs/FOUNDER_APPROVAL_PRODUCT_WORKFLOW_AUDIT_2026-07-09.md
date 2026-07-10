# Founder-Approval Product Workflow Audit (2026-07-09)

**The safe path from an internal candidate leg to a founder-approved, PAPER-ONLY product card — with
the official 19-14 money record, exposure, and public site fully walled off.** Nothing here activates a
real card, creates exposure, touches money, or ships public copy. Money md5
`affe6b21071f2b3be96bb2774eb347c3`; record 19-14; exposure $0 — all unchanged.

---

## 1. What artifacts exist today

| artifact | path | role |
|---|---|---|
| multi-sport candidate pool | `data/internal/multi-sport/candidate-pool/<date>.json` | 59 legs / 53 productEligible (07-09) |
| candidate-leg schema | `src/lib/multi-sport/candidate-leg.ts` | normalized leg + `productEligible` gate |
| founder-review previews | `data/internal/product-previews/{bank-builder,moonshot}/<date>.json` | `founder_review` / `no_play`, `active:false` |
| preview builder | `scripts/build-founder-review-previews.mjs` | conservative BB (≥0.60, 2 distinct games) + Moonshot (+700 combo) |
| MLB product settlement rules | `src/lib/mlb/product-settlement/mlb-markets.ts` | `settleMlb*` → `SettlementOutcome` (win/loss/push/pending/unavailable) |
| StatsAPI linescore parser | `src/lib/mlb/product-settlement/statsapi-linescore.ts` | final-only team scores (free) |
| internal MLB settlement ledger | `data/internal/mlb/product-settlement/<date>.json` | graded legs (separate from money) |
| **official money record** | `app/public/data/mr-dub/portfolio.json` (+ `banked-ladders.json`) | 19-14 · $19,065.40 — **NEVER touched here** |

**No product-workflow / approval / paper-card layer exists yet** — this mission builds it.

## 2. Product states today

Only two exist in the previews: `founder_review` and `no_play` (both `active:false`, `exposure:0`).
There is no approval, paper-card, or paper-settlement state. This mission adds the full state machine.

## 3. Settlement-supported markets

- **MLB** (`SETTLEABLE_MLB_MARKETS`, tested, StatsAPI box scores): `moneyline`, `run_line`, `total`,
  `team_totals`, `pitcher_strikeouts`, `batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`.
- **Soccer** (`SOCCER_SETTLEABLE`, API-Football): `moneyline_90`, `double_chance`, `draw_no_bet`,
  `match_total_goals`, `btts`, `player_goal_scorer_anytime`, `player_assists`, `player_shots`,
  `player_shots_on_target`.
- **Everything else** → `settlementSource: "none"` → not product-eligible.

## 4. Sports that can safely contribute candidate legs

MLB and Soccer — both have tested settlement rules + a free/available official data source. NBA and any
other sport: **not** settlement-wired → watchlist/no-play only.

## 5. Which legs are product-eligible today

Only legs where `settlementSource !== "none"` AND `dataQuality ∈ {strong, medium}`. 07-09: 53/59.
Team markets (MLB run_line/total/moneyline) + conservative soccer team markets dominate.

## 6. Which legs must stay watchlist / no-play

`thin`/`unavailable` data quality; any market without a wired settlement rule (MLB alt lines,
NBA props, soccer Asian-handicap/team-totals); anything a **full-game simulation** would suggest (the
sim is `internal_only` and must never select a leg).

## 7. Where accidental activation could happen

- A promotion script that runs **without** an explicit approval flag.
- A paper card written with `active:true` / `exposure>0` and later read by money code.
- A paper ledger merged into `portfolio.json` / the master ledger.
- A public component importing the workflow modules and rendering a card as a live bet.

**Mitigations (this mission):** approval-flag-gated promotion; schema validators that reject
`active:true`/`realExposure>0`/`officialMoneyRecordAffected:true`; separate internal ledger paths; a
money-md5 guard around every write; tests that no public code imports the workflow layer.

## 8. Where official-money contamination could happen

Only if a workflow script wrote to `portfolio.json` / `banked-ladders.json` / the master ledger, or a
paper P/L were summed into the 19-14 record. **Guard:** every workflow script asserts the money md5 is
unchanged before/after; a test greps every script for money-artifact writes; paper P/L lives only in
`data/internal/product-cards/settlements/…` and is never read by money code.

## 9. What must be founder-approval-gated

The single irreversible-ish step: **`founder_review` → `paper_approved` → `paper_active`**. Promotion
must refuse to run without an explicit `--approve-founder-review` + `--approved-by`. Everything upstream
(candidate pool, previews) is read-only analysis; everything downstream (paper settlement) only grades
what a founder already approved.

## 10. The safest state machine

```text
no_play ─┐
watchlist ─┼─▶ founder_review ─▶ paper_approved ─▶ paper_active ─▶ settled
          │         │                  │                │
          │         └─▶ rejected       └─▶ rejected     └─▶ voided
          └────────────────────────────────────────────────▶ archived
```

Valid transitions (enforced by `isValidWorkflowTransition`):

| from | allowed to |
|---|---|
| `no_play` | `watchlist`, `archived` |
| `watchlist` | `founder_review`, `no_play`, `archived` |
| `founder_review` | `paper_approved`, `rejected`, `no_play`, `archived` |
| `paper_approved` | `paper_active`, `rejected`, `archived` |
| `paper_active` | `settled`, `voided`, `archived` |
| `settled` / `voided` / `rejected` | `archived` |
| `archived` | — (terminal) |

**`paper_active` is PAPER-ONLY and INTERNAL** — it never implies real-money exposure. Real-money
activation and any public rollout are a separate, founder-approved, explicitly-guard-tested step that
this mission does **not** take.
