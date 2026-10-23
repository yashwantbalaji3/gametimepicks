# Founder decision — Level A model suggestions vs Level B priced recommendations

- **Decided by:** the founder (Yashwant Balaji), in the GameTimePicks Launch Readiness session.
- **Time:** Friday 2026-10-23, about 9:16 AM ET (13:16Z).
- **Recorded by:** the release owner (Launch Readiness session), 2026-10-23, from the founder's own message to that session. This is not a peer relay.
- **Scope:** the public rollout policy for Bank Builder, Moonshot, Parlay Lab and Smart Betslip.

## Founder's text (verbatim, sections 1, 3–6 and the final directive)

> **1. REVISED FOUNDER PRODUCT POLICY**
>
> Effective immediately, design and implement two separate capability levels.
>
> LEVEL A — MODEL-SUGGESTED PICKS AND PARLAYS
> These are our projections and scenario-based suggestions based on official, frozen model forecasts.
> They may be made public once the necessary inputs, freshness, eligibility, UI, privacy and end-to-end acceptance checks pass, even if their predictive accuracy has not yet been established over a large forward sample.
> Label the information truthfully.
> Each suggested leg should display its available model projection, market and threshold where applicable, relevant evidence, uncertainty, risk classification and data timestamp.
> Do not invent a betting line or price when one does not exist.
> Do not show unsupported expected value or potential payouts.
> Use this category for the earliest feasible activation of cross-sport suggested cards.
>
> LEVEL B — PRICED SPORTSBOOK RECOMMENDATIONS
> These include real odds, expected value, sportsbook comparison, calculated payouts and betslip handoff.
> Keep their established requirements: authorized fresh prices, legal/operator eligibility, market-specific settlement, integrity checks, applicable storage terms and promotion controls.
> Continue implementing these features in parallel, but do not let their pending authorization prevent Level A from launching.
> Update the product capability registry to represent these two levels explicitly.
> Do not silently repurpose the existing historical-only or promotion gates. Implement a separate reviewed eligibility path for non-transactional model suggestions.
> This is my approval to change the proposed public rollout policy. It is not an approval to waive the separate controls governing paid prices, model promotion, historical records or sportsbook integrations.
>
> **3. PRIORITY P1 — BANK BUILDER FOR ALL SUPPORTED SPORTS**
> Bank Builder must evolve from a mostly MLB-oriented product into a genuine multi-sport prediction product.
> Target: NFL, NBA, MLB, UFC, EPL and additional soccer leagues where supported models and data actually exist.
> The interface should discover and evaluate eligible model-suggested candidates across these sports.
> It should support NBA-only, individual-sport and mixed-sport suggestions where valid.
> Each suggested card must explain: Which sports and markets contributed. The frozen source forecast for every leg. Why the system selected the combination. Risk and dependency considerations. Which legs are priced or unpriced. Which markets are unavailable and why.
> The design must use the existing canonical forecasts and shared evaluation machinery.
> Do not invent probabilities or label a card low-risk without a defensible methodology.
> The system should also function when the only available output is a set of unpriced model suggestions.
> Preserve existing MLB functionality and historical card records.
>
> **4. PRIORITY P1 — MOONSHOT FOR ALL SUPPORTED SPORTS**
> Moonshot must similarly support multiple sports.
> Its purpose is to surface clearly identified high-risk and longshot combinations backed by actual model analysis.
> Target: NBA, NFL, MLB, UFC, EPL and other supported soccer competitions.
> Allow NBA-only and mixed-sport Moonshot ideas, where eligible.
> Do not force a leg from every sport.
> Do not manufacture candidates simply to fill a card.
> Show the supported legs, evidence, risks and model references.
> Where real authorized odds are available, display legitimate priced scenarios under the established gates. Otherwise, publish unpriced model-suggested scenarios without imaginary payouts.
> Ensure Bank Builder and Moonshot use distinct, explainable selection policies.
>
> **5. PRIORITY P1 — PARLAY LAB: FOUR RISK TIERS**
> Make Parlay Lab V2 a coherent cross-sport experience.
> Maintain the four existing tiers: LOW — MEDIUM — HIGH — LONGSHOT
> For each tier, support model-suggested cards from all eligible sports.
> NBA-only and mixed-sport parlays are particularly important.
> The system must handle: Candidate eligibility. Model-source consistency. Supported market families. Duplicate-event and correlation controls. Missing or stale data. No-price cases. DNP, inactive, injured and questionable players. Accurate settlement classification. Unsupported operator or sportsbook cases.
> Provide useful explanations even when no real-price recommendation is available.
> Don't use arbitrary odds or unsupported probabilities to complete a parlay.
> Public Level A suggestions and Level B priced recommendations must remain visibly distinct.
>
> **6. PRIORITY P2 — SMART BETSLIP**
> Ensure model-suggested cards connect cleanly to the Smart Betslip experience.
> Users should be able to inspect or copy supported selections even when no sportsbook handoff is available.
> Only offer direct sportsbook links, comparisons and actionable priced slips when those particular integrations meet their requirements.
> Do not create fabricated links, stale prices or unsupported book identities.
>
> **FINAL FOUNDER DIRECTIVE (excerpt)**
> We should launch honest, functional, explainable model-suggested experiences as soon as they satisfy their applicable requirements, and add fully priced sportsbook capabilities as their separate gates clear.

## What this decision does and does not change

- **Changes:** a new, separate Level A eligibility path for non-transactional model suggestions built only from official frozen forecasts, plus a Level A axis in the capability registry.
- **Does not change:**
  - Level B gates: prices, operator eligibility, settlement, storage, promotion;
  - the existing `HISTORICAL_ONLY` / promotion gates;
  - historical records and settlement;
  - model promotion (the NBA official forecast stays the Elo side + v0.1 player medians);
  - paid-data authorizations.
- **Release owner's implementation conditions** (2026-10-23):
  - **Leg probabilities:** a Level A leg's probability is the official frozen forecast's own published probability.
  - **Joint probabilities:** computed only across distinct events (same-game and duplicate events refused). The independence assumption is disclosed on every card.
  - **Tiers:** use the existing founder-approved D2 bands applied to the model-fair price 1/joint (no new constants). Shown as a model probability, never as odds, payout or EV.
  - **NBA player projections:** they have no market line, so they are shown as Predicted Player Statistics and are never a card leg.
  - **Ledger:** Level A suggestions are recorded append-only and graded forward in a record separate from priced cards.
  - **Release:** public only after exact-head CI, the release owner's vehicle build, browser acceptance and Production verification.
