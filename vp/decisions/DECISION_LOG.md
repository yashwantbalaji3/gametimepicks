# Decision Log

Formal record of accepted decisions. Each entry: **decision · context · rationale · consequences · status**. Newest-relevant wins; superseding entries link back. All ten below were **accepted by Yash (founder) on 2026-07-06**.

Legend: `accepted` = in force · `superseded` = replaced · `deferred` = revisit later.

---

## ADR-0001 — North star: trust-first now, scalable analytics business later
**Status:** accepted (2026-07-06)
**Context:** Product had been framed as a portfolio demo; founder wants a real business.
**Decision:** GameTime Picks is a real public-facing sports analytics business. Short term = polished paper-only prediction product that builds trust. Long term = scalable sports analytics company.
**Rationale:** The honest, provably-settled money ledger is the defensible moat; trust compounds into audience, which is the precondition for any future business model.
**Consequences:** Every roadmap item is judged first on whether it builds or protects trust. No shortcut that trades honesty for growth.

## ADR-0002 — Primary user: mainstream sports fans
**Status:** accepted (2026-07-06)
**Decision:** Primary user = sports fans who want simple, trustworthy, model-backed picks without needing to understand the details. Secondary = evaluators (recruiters, investors, collaborators).
**Rationale:** Defines the bar for UX (simplicity, "know what to bet in 30s") and copy (plain, honest, not jargon-heavy).
**Consequences:** Prioritize clarity and flagship legibility over analyst-grade depth. Depth stays available (Methodology, Results) but never required.

## ADR-0003 — 3-month success definition
**Status:** accepted (2026-07-06)
**Decision:** Success in 3 months = polished live product with daily *automated* slates, visible model performance, strong flagships, and a growing audience. North-star metrics: **product freshness · user trust · daily active usage · settled pick performance.**
**Rationale:** Gives us a scoreboard; ties directly to the metrics-snapshot template.
**Consequences:** "Freshness is the product" is now a measured commitment, not a slogan. Automation of the daily loop becomes a P0 enabler.

## ADR-0004 — Proceed with a July 10 soft launch
**Status:** accepted (2026-07-06)
**Decision:** Launch July 10 as a **soft** launch — usable and polished, no large marketing push, keep improving.
**Rationale:** Product is 9.5/10 with no hard blockers; a soft launch captures learning without over-exposing thin records.
**Consequences:** Go/No-Go gates apply (see `launch/GO-NO-GO.md`). Marketing amplification is deliberately held back.

## ADR-0005 — No monetization yet
**Status:** accepted (2026-07-06)
**Decision:** Do not monetize now. Build trust, traffic, and a track record first. Later paths: premium analytics, subscriptions, tools. **No sportsbook affiliate revenue** (protects the honesty claim).
**Rationale:** Charging or taking affiliate money before trust is established would undercut the core moat.
**Consequences:** No paywalls/ads at launch. A monetization-options memo is drafted for later, not executed.

## ADR-0006 — LADDER_V2 stays preview-only
**Status:** accepted (2026-07-06)
**Context:** v1 rolls 100% of winnings; v2 (profit-preserving cash-out) is shipped as policy+display but not wired to money.
**Decision:** Keep LADDER_V2 as **preview/display only** until settlement support is fully implemented and tested. Never present it as live.
**Rationale:** v2 partial cash-out breaks three money invariants; activating near launch would risk the crown jewel. Faking "live" violates the no-fabrication directive.
**Consequences:** Live settlement remains v1 all-in. v2 activation follows the `LADDER_V2` flag → synthetic dry-run → extended gates → pinned-test migration checklist, post-launch.

## ADR-0007 — Automate ops, gate money and card approvals
**Status:** accepted (2026-07-06)
**Decision:** Maximize automation (fetch, settle-prep, rebuild, deploy pipeline), but **money movement and major product-card approvals remain operator-gated** until the system proves itself over more days.
**Rationale:** Balances "freshness is the product" against the reality that the money ledger is the asset and the sample is still young.
**Consequences:** Set the three GitHub secrets to automate the loop; keep `--apply` settlement and BB/Moonshot approval as human steps. Revisit full autonomy after a stable streak.

## ADR-0008 — MLB is the post-World-Cup flagship sport
**Status:** accepted (2026-07-06)
**Decision:** When the World Cup ends, **MLB** becomes the primary sport product. **Bank Builder + Top 10** remain the cross-sport flagships.
**Rationale:** MLB data already flows daily; reusing the proven pipeline avoids a post-tournament dark period. NFL/NHL follow in fall.
**Consequences:** A post-WC transition plan is a 30-day priority: MLB prop settlement → /results, MLB suggested parlays, MLB feeding Bank Builder + Top 10.

## ADR-0009 — Claude operating model (three surfaces)
**Status:** accepted (2026-07-06)
**Decision:** Chat = strategy · Code = implementation · Cowork/VP = product organization + parallel planning. Keep improving the system.
**Rationale:** Clear ownership + gates let a one-person company scale output without losing accountability.
**Consequences:** This VP workspace is the permanent product-org layer; I maintain the KB, decisions, plans, and reviews over time.

## ADR-0010 — Positioning: honest, responsible, casino-inspired
**Status:** accepted (2026-07-06)
**Decision:** Position as an honest paper-only sports analytics product. **No real-money betting language, no guarantees, no fake certainty.** The brand may feel casino/sportsbook-*inspired* visually; copy must stay responsible.
**Rationale:** The look drives engagement; the copy discipline preserves trust and reduces compliance risk.
**Consequences:** Copy review (Content Analyst hat) enforces banned-language rules; visual design keeps the vault/gold sportsbook feel. Public README must be reconciled to this positioning.

---
*Related: `0001-OPEN-STRATEGIC-DECISIONS.md` (the framing that produced these — now resolved). Future decisions get their own `NNNN-slug.md` file and a one-line entry here.*
