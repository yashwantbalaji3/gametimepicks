# Product Tracking System — Architecture, Implementation Plan, Blockers

_Date: 2026-06-24. A durable, settlement-driven, additive performance-tracking layer for every product._

## Goal
Every product (Homer Nukes, Bank Builder, Moonshot, WC Specials, Mr. Dub, and future products) gets a
stable identity, a persisted track record, and public Today / History / Stats / ROI surfaces — all derived
from **official settled results only**, never fabricated, and never touching the canonical bankroll.

## Status of this sprint
- **Built + unit-tested (shipped in this PR):** the Settlement Pipeline engine (D), the Product Registry
  (A), and the Performance computation (B). 11 new tests, tsc clean.
- **Designed (this doc):** the Performance **store** persistence, Public Results pages (C), and the audit
  of untracked surfaces (E) — with a phased plan below.

---

## A · Product Registry — `lib/products/registry.ts` ✅ built
Single source of truth. Each product: stable `id`, `name`, `sport`, real `launchDate` (sourced from its
first artifact), `status` (active/retired), `paperOnly`, `route`, `blurb`. Retired products (Diamond
Specials) keep their id so history never breaks. Helpers: `getProduct`, `activeProducts`,
`productsBySport`, `isKnownProduct`.

## B · Product Performance — `lib/products/performance.ts` ✅ built (compute) + 🔜 store
`computeProductPerformance(productId, settledResults[], asOf?)` → pure derivation of:
- **daily** record per date, **cumulative**, **rolling-7d**, **rolling-30d** windows
- each window: bets / W-L-push-void / stake / returned / **profit / ROI% / units / winRate**
- **longestWinStreak / longestLossStreak** and a **roiSeries** (cumulative profit per settled bet → chart)

Empty input → every window honestly reads zero (no fabrication). **To add (store):** a durable
`public/data/product-ledger/<id>.json` of `SettledResult[]` that the settlement-write step appends to, and
a loader `loadProductLedger(id)` the pages read. The compute layer already consumes exactly this shape.

## C · Public Results pages — 🔜 designed
One reusable route shell `/<product>/results` (or a tab on each product page) rendering, from the ledger:
- **Today** — today's graded card(s) + result
- **History** — reverse-chronological settled cards
- **Stats** — cumulative + rolling-7d/30d windows (record · ROI · units · win rate · streaks)
- **ROI chart** — `roiSeries` sparkline
- **Last 30 days** — the rolling-30d window highlighted
Data-gated: before a product has settled history, the page shows an honest "awaiting first settlement"
state (exactly today's Homer Nukes scaffold). A shared `ProductResults` component keeps all products
identical.

## D · Settlement Pipeline — `lib/settlement/soccer-markets.ts` ✅ built
One grading framework all soccer products settle through: `gradeLeg(leg, official)` + `settleCard(legs,
stake, official)` → per-leg W/L/void/**pending** + parlay result + paper P/L + implied decimal. Markets:
moneyline_90, match_total_goals, btts, anytime goalscorer, assists, shots on target. Refuses to grade
without official data (returns `pending`). The MLB equivalent already exists (`lib/mlb/mlb-settlement.ts`);
**the plan unifies both under one `gradeCard` contract** keyed by sport so every product — soccer or
MLB — settles identically. Runner: `scripts/settle-soccer-slate.mjs` (read-only; emits the official-scores
template when data is absent).

## E · Audit — where results are NOT persisted today
| Surface | Persisted? | Gap |
|---|---|---|
| Bank Builder lanes | partial | `mr-dub/ledger.json` (lane events) + `world-cup/settlement/*` through **June 20 only**; no per-product cumulative ledger keyed by id |
| Mr. Dub daily portfolio | no | `daily-portfolio.json settlement: pending`; daily results never rolled into a durable per-day ledger |
| **WC Specials** | **no** | `world-cup-specials-history.json` has **0 entries** — specials are generated daily but never settled/recorded |
| **Homer Nukes** | **no** | board shows 7d/30d "—"; no settled-history artifact exists |
| MLB props / Featured / Pitcher | no | shown live, never graded or tracked |
| WC parlay cards | no | generated, never settled |
The common gap: settlement today is **per-slate + ad-hoc** (one-off scripts), not a **per-product ledger
keyed by `product_id`**. The Registry + Performance libs are that missing unified layer; what remains is the
**write step** that appends graded `SettledResult`s to `product-ledger/<id>.json` after operator approval.

---

## Implementation plan (phased, additive, settlement-driven)
1. **Unify the grader** — extract a sport-agnostic `gradeCard(card, official)` over soccer + MLB engines
   (one contract, two market maps). _Low risk; pure._
2. **Persistence store** — define `product-ledger/<id>.json` (`SettledResult[]`) + `loadProductLedger(id)`
   + an operator-approved `persist-settlement.mjs` that appends graded results (never bankroll). _Gated write._
3. **Backfill** — settle the existing official-scored slates (June 11/16/20 are present) into the ledgers
   so the pages launch with real history; leave June 23 pending until its official results arrive.
4. **Public Results component** — shared `ProductResults` (Today/History/Stats/ROI/Last-30) reading the
   ledger; wire one tab per product. Data-gated empty states.
5. **WC Specials + Homer Nukes adapters** — normalize their leg schemas into `GradeableLeg` so they grade
   through the same engine; start recording them.
6. **Automation** — extend the daily workflows to (a) fetch official results when keys exist, (b) run the
   read-only graded report, (c) wait for operator approval, (d) append to ledgers. Never auto-touch bankroll.

## Blockers
1. **June 23 official results** (4 FT scores + player lines) — needed to settle the current slate; not
   ingested, must not be fabricated. (See the settlement report.)
2. **`API_FOOTBALL_KEY`** dormant — without it, official-scores files are operator-pasted, not auto-fetched.
3. **No persistence store yet** — the compute + registry exist; the durable `product-ledger/*` write +
   loader is plan item 2 (additive, gated).
4. **Approval gate** — per your instruction, no settled-history / ledger / results-page write happens until
   you review the graded numbers.

## Safety invariants (unchanged)
Additive only · settlement-driven · **never modifies bankroll** (`portfolio.json`/crown untouched) · never
fabricates results · everything testable (engine + registry + performance covered now).
</content>
