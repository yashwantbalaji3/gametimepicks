# Overnight Summary — 2026-07-10

Worked the priority order: **protect money/trust → site structure → legends → selectors → model loop →
coverage matrix → UFC → assets → report.** Went deep on the safe, high-value items and documented the
risky ones (nav restructure) rather than rushing them. Official money untouched (md5 `affe6b21…`, 19-14,
$0). Suite 2057 green.

---

## Shipped (safe, additive/internal)

| # | deliverable | where |
|---|---|---|
| 1 | **Legends/glossary system** — single-source `lib/glossary.ts` (14 terms), reusable `<HowToRead>` legend, new `/market-guide` page, linked from `/learn` | public (educational) |
| 2 | **Daily model-improvement loop** — `run-daily-model-improvement.mjs` → `model-improvement/latest.json`: founder-gated recommendations (demote 3 weak markets, discount ≥20pp edge, more no-play), `safeToAutoApply:false` | internal |
| 3 | **Market coverage matrix** — `build-market-coverage-matrix.mjs` → `market-readiness/coverage-matrix.json`: 19 rows, settleability derived from real code, unavailable markets can't fake a pick | internal |
| 4 | **Docs** — Website/Nav review, Paper-Bankroll review (blunt), UFC repo/provider audit, this summary | docs |
| 5 | **Tests** — glossary (4), model-improvement/coverage boundaries (5); suite 2048→2057 | — |

## Blunt findings

- **Site structure:** Yash is right — `/simulate`, `/today`, `/games` overlap; `/picks` + `/build` are
  redundant. The fix is a nav relabel + `/build→/picks` merge, but nav labels are cross-coupled to
  `unified-nav-labels.test`, so it's a **deploy-reviewed pass**, proposed concretely in the review doc,
  not rushed overnight. The one safe win — a real **Market Guide** legend — shipped.
- **Paper bankroll:** NOT failing — **unproven on 1 settled card** (Moonshot lost −1u, BB pending).
  Don't over-correct. The real signals (confidence tiers anti-predictive; big edge under-performs;
  per-market reliability spread) drive concrete, founder-gated safeguards now recorded internally.
- **UFC:** more built than a scaffold (types/settlement/backtest/fail-closed page) but **0 scheduled
  events** right now, so the page honestly shows nothing. No fake fights. Needs the next card's
  schedule+odds ingested; then the existing gates light it up.
- **Full-game sim:** still market-anchored, `insufficient_sample`, internal, non-driving — unchanged.

## Explicitly deferred (with reasons)

- Nav relabel + duplicate-route merge (`/build→/picks`, `/games` under Simulate) — cross-coupled tests +
  deep-link risk; needs a focused reviewed pass.
- Homepage single-CTA restructure — real component change; propose-first.
- Asset/logo/portrait audit + fallback polish — not started (budget); existing `player-avatar`/`team-logo`
  components already fallback; a dedicated pass is warranted.
- Flagship deep-upgrade + methodology deep-audit docs — high-level review captured in the product/bankroll
  docs; a per-product spec is a follow-up.
- July-10 public slate — still held back (display-lane activation); a deploy-reviewed refresh publishes it.

## Guardrail proof

Official money md5 `affe6b21…` unchanged · 19-14 · $0 exposure · forensic PERFECT · health HEALTHY · no
card activated · no internal artifact web-served (model-improvement / coverage-matrix 404; market-guide is
an intentional public educational page) · full-game sim not driving · Generate gate intact.

## Recommended next prompt

Do the **deploy-reviewed nav + homepage pass**: apply the unified relabel (all 3 nav files +
`unified-nav-labels.test`), drop `<HowToRead>` legends into `/picks` `/build` `/results` `/simulate`, add
Build presets + redirect `/build→/picks`, make the homepage a single "Simulate tonight's games" CTA — then
rebuild + deploy. Separately: an asset-coverage audit + fallback polish, and publish the July-10 slate.
