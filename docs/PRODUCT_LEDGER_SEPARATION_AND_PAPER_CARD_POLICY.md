# Product Ledger Separation + Paper-Card Policy

**Read this before touching anything that says "card", "product", or "ledger".** GameTime Picks has TWO
completely separate ledgers. Confusing them is the single most dangerous mistake a future session can
make. Money md5 `affe6b21071f2b3be96bb2774eb347c3`; official record 19-14; exposure $0.

---

## 1. Two ledgers, one wall

| | Official money ledger | Internal paper product ledger |
|---|---|---|
| path | `app/public/data/mr-dub/portfolio.json` (+ `banked-ladders.json`) | `data/internal/product-cards/**` |
| web-served | **yes** (public site) | **no** (404 — `data/internal`, `public:false`) |
| record | **19-14**, bankroll $19,065.40, crown $20,465.40 | paper units only, no record impact |
| exposure | the official product's real paper bankroll | **$0 real exposure**, `realExposure:0` always |
| who writes it | the settlement pipeline (`settle_*`) + refresh | `promote-founder-review-to-paper-card.mjs`, `settle-paper-product-cards.mjs` |
| affects 19-14? | yes | **NEVER** |

The wall: **no product-workflow script reads or writes any money artifact**, every workflow script
asserts the money md5 is unchanged before/after, and every workflow artifact carries
`officialMoneyRecordAffected:false` + `public:false` (enforced by the schema validators + tests).

## 2. Why paper cards do not affect 19-14

The 19-14 record is computed only from `portfolio.json` / the master ledger by the official settlement
pipeline. Paper cards live in a different directory tree, are never read by that pipeline, and their P/L
is expressed in **paper units** in `product-cards/settlements/**` — a number that is never summed into
bankroll, crown, profit, or the win/loss record. A test greps every workflow script for money writes.

## 3. Why exposure stays $0

A paper card is `paperOnly:true`, `active:false`, `realExposure:0`. The word `active:true` is reserved
exclusively for **real-money** activation, which this layer never performs. `paperStakeUnits` is a
tracking number for paper P/L only; it is not dollars and creates no exposure. The validator rejects any
card with `realExposure > 0` or `active:true`.

## 4. How founder approval works

The only state change that needs a human is `founder_review → paper_approved → paper_active`, performed
by `promote-founder-review-to-paper-card.mjs`. It **refuses to run** without BOTH
`--approve-founder-review` and `--approved-by <founder>`. It records an `ApprovalRequest` (with the
money-guard md5 snapshot) alongside the paper card, so every card has an auditable approval provenance.
Nothing auto-promotes; there is no scheduled/CI promotion.

## 5. What can be settled

Only markets with a **tested settlement rule + an official/final data source**:
- **MLB team markets** — `moneyline`, `run_line`, `total` — from the committed StatsAPI linescore
  (`settleMlbMoneyline/RunLine/Total`, join gameId→gamePk via the board).
- Everything gated by `SETTLEABLE_MLB_MARKETS` / `SOCCER_SETTLEABLE` remains eligible, but paper
  settlement currently wires only MLB team markets end-to-end.

## 6. What remains unsupported

- **MLB player props + `team_totals`** in paper settlement — the per-player / per-team actual is not
  wired here → **pending** (never fabricated, never a loss).
- **Soccer** paper settlement — API-Football finals are not committed for grading here → **pending**.
- Any market with `settlementSource: "none"` — cannot be promoted at all.

## 7. How no-play is represented

When the pool is weak the preview is `status: "no_play"` with a `noPlayReason` and no legs. Promotion
refuses a `no_play` preview. **A card is never forced.**

## 8. Void / push / pending handling

- **pending** — leg not final / not wired. A pending leg keeps the CARD pending, *unless* a loss already
  decides it (one loss ⇒ card lost even with pending legs).
- **push / unavailable** — dropped from the parlay (standard book behavior). A card of only push/void
  legs settles as **void** (0 paper units).
- **won** — all surviving legs win. **lost** — any leg loses.
- Pending is **never** scored as a loss; non-final games are **never** graded.

## 9. Graduating to public cards (if and only if the founder approves)

A paper card may only ever become a *public* card through a separate, explicitly-founder-approved,
guard-tested rollout — never as a side effect of this workflow. Required go/no-go gates:

1. A real multi-week paper track record with honest settlement (no fabricated legs).
2. Per-market calibration showing the selection logic adds value (not the full-game sim, which stays
   internal + non-driving).
3. A public-UI honesty pass (labels distinguish paper vs real; no "beats the market" copy).
4. New guard tests: public card state, exposure accounting, Results Trust Center separation.
5. Explicit founder sign-off recorded as an approval artifact.

Until every gate is met, product cards stay **internal, paper-only, founder-review-gated**, and the
official 19-14 record stands alone.
