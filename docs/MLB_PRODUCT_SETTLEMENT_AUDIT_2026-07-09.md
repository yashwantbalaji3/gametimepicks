# MLB Product Settlement Audit (2026-07-09)

**Wiring MLB product-card settlement — pure rules + a SEPARATE preview ledger — so MLB legs can become
`productEligible` in the read-only multi-sport pool. No official money, record, exposure, or active card
is touched.**

Money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, bankroll $19,065.40, exposure $0 —
unchanged.

---

## Market inventory + classification

Groups: **A** settle from final game score · **B** settle from statsapi box-score stats · **C** needs an
extra stat source · **D** unsupported for eligibility.

| market key | source artifact | settlement source | rule | push/void | group | eligible now? | note |
|---|---|---|---|---|---|---|---|
| `moneyline` | mlb team-markets Game Center | final score (statsapi linescore) | higher final score wins | none (MLB has no ties; equal ⇒ pending) | A | **rule-ready, data-pending** | final scores not yet committed → grades once a score source is wired |
| `run_line` | team-markets | final score | `margin + line`: >0 win, <0 loss, =0 push | integer line can push | A | rule-ready, data-pending | same score dependency |
| `total` | team-markets | final score | over/under on `home+away` | `== line` push | A | rule-ready, data-pending | same |
| `team_totals` | team-markets (expanded) | final score | over/under on one team's runs | `== line` push | A | rule-ready, data-pending | same; team totals not yet ingested for MLB |
| `pitcher_strikeouts` | board / settled_leans | statsapi `pitching.strikeOuts` | over/under | `== line` push | B | **YES** | actuals committed in settled_leans |
| `batter_hits` | board / settled_leans | statsapi `batting.hits` | over/under | `== line` push | B | **YES** | reliable market (53.8%); actuals committed |
| `batter_total_bases` | board / settled_leans | statsapi `batting.totalBases` | over/under | `== line` push | B | **YES (settleable)** | net-negative pick (44.4%) — settleable ≠ good pick; quality is a separate gate |
| `batter_hits_runs_rbis` | board / settled_leans | statsapi `hits + runs + rbi` | over/under on the sum | `== line` push; missing component ⇒ pending | B | **YES** | never a partial settle |
| `batter_home_runs` (retired Homer Nukes) | — | — | — | — | D | no | product retired 2026-06-30 |

**Rule parity:** player-prop grading matches the existing pipeline grader
(`pipeline/mlb/settle_mlb_results.py` `_grade`): `actual > line` → Over wins / Under loses; `< line` →
Under wins / Over loses; `== line` → push. Validated: the pure over/under core reproduces the pipeline
`outcome` on **all 18,227 committed settled props with 0 mismatches** (cross-check test).

## Data reality (the one real constraint)

- **Player-prop actuals ARE committed** (`settled_leans.jsonl`, per-prop `actual`) → group B grades from
  committed data for any final date, no network.
- **Final team scores are NOT committed** anywhere in `public/data/mlb`. So group-A markets have a
  correct, tested rule but **live grading is data-pending** until a score source is wired
  (statsapi `/game/<pk>/linescore`, free — no Odds credits). On a non-final slate (July-9) every leg is
  `pending` regardless, so this blocks nothing today.

## Honesty rules encoded (mirrors the hard rules)

- Equal to the line is a **push**, never a loss.
- Missing final score/stat ⇒ **pending**; postponed/cancelled or tied-and-not-final ⇒ **pending**;
  never a loss.
- **Did not play** ⇒ **unavailable** (distinct from stat-missing and game-not-final).
- H+R+RBI never settles on a partial component set.

## Separate ledger — never the official money record

All settlement output goes to `data/internal/mlb/product-settlement/<date>.json` (repo-root
`data/internal/`, **not** web-served), marked `public:false`, `officialMoneyRecordAffected:false`. It
never reads or writes `mr-dub/portfolio.json` or any bankroll/daily-portfolio artifact. The raw MLB
model-performance ledger and this product-settlement preview stay separate from the official 19-14
record.

## What this unlocks

`settlementSourceFor("MLB", market)` now returns `statsapi` for the 8 settleable markets (was `none`),
so MLB legs in the read-only candidate pool can be `productEligible`. Activation stays fully gated — the
product preview remains watchlist / no-play, `active:false`, `exposure:0`. See
`docs/MULTI_SPORT_PRODUCT_ENGINE_ROLLOUT_PLAN_2026-07-09.md`.
