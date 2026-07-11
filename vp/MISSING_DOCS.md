# Missing Documentation — prioritized

**Maintained by:** Claude (VP) · **Updated:** 2026-07-06
Ranked by how much each doc would improve decision quality. The repo is unusually well-documented on *operations*; the gaps are in *durable product/strategy memory* and *current metrics*.

## P0 — write before or right after July 10 launch
1. **Product Vision & Business Model (1 page).** The stated goal is "scalable into a real business" but there's no doc defining audience, wedge, and how paper-only stays honest while growing. Unblocks half the strategic decisions. → `product-specs/VISION.md`
2. **Live Metrics Snapshot (auto or weekly).** Settlement record, bankroll, per-market reliability, credit balance, traffic — in one place, dated. Today these live scattered across `MODEL_REVIEW_*` and `admin/status.json`. → `model/RELIABILITY_LEDGER.md` + a weekly metrics note.
3. **LADDER_V2 Activation Decision Record.** The biggest pending model/eng call. Spec exists; the *decision* (activate now / after launch / after n≥X) is undocumented. → `decisions/0002-activate-ladder-v2.md`
4. **Launch Go/No-Go + Positioning.** What "launched" means: who we tell, where, with what one-sentence pitch, and the disclaimers that must be visible. → `launch/GO-NO-GO.md`

## P1 — durable product memory (write over the next 2–3 weeks)
5. **Per-product specs** (Bank Builder, Mr. Dub, Top 10, Knockout, Moonshot, WC Specials, MLB, Results, /ops). Handoffs capture *changes*; there's no stable "what this product is." → `product-specs/`
6. **Post-World-Cup Transition Plan.** The WC ends and it's currently the product's center of gravity. What becomes the flagship (MLB now, NFL/NHL later)? → `plans/`
7. **Decision Log backfill.** Capture the load-bearing past calls (player-prop ban, approval-lock, 90'-settlement, v1 all-in) as short ADRs so they're never re-litigated. → `decisions/`
8. **Monetization Options Memo.** Even if the answer is "not yet," document the honest paths (donations, pro tier, affiliate-free sponsorships, data/API) and their trust trade-offs. → `product-specs/`

## P2 — nice to have
9. **Public-facing README rewrite** to match reality (retire the "NBA demo" framing). → repo `README.md`
10. **Analytics/instrumentation plan** — are we measuring traffic/engagement? If not, what and how, honestly. → `ops/`
11. **Incident post-mortem template** — standardize what already happens ad hoc in `NIGHTLY_SETTLE_FIX_*`. → `ops/`
12. **Glossary** — canonical, crown, lane, rung, DC/DNB/BTTS, no-play, Mr. Dub — for future collaborators. → `product-specs/`

**How I'll work through this:** I draft; you correct. I'll propose P0 docs first and only write them once the underlying decisions (below) are made.
