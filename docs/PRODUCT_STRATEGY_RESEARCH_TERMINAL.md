# Product Strategy — The Accountable Sports Research Terminal

**Status:** RATIFIED as working strategy (Program 058–061 Lane A), pending founder countersignature in the founder report.
**Supersedes:** ad-hoc direction debates. This is durable product policy, not a sprint memo.
**Evidence base:** Sprints 046–057 plus the final preregistered protocol (`docs/MLB_FINAL_MODEL_DECISION.md`).

## 1. What GameTimePicks is

**A sports research terminal and market-intelligence platform.** The product shows, for every covered event:

1. **What the sportsbook market implies** (de-vigged consensus probabilities, line context, movement where captured).
2. **What our simulations produce** (full distributions, p10–p90 bands, transparent inputs).
3. **How calibration changes interpretation** (published calibration layers, per-market variance factors, overconfidence measurements).
4. **What actually happened** (official-source settlement, lineage-gated, quarantine-honest, closed accounting).
5. **What the platform learned** (running honesty ledger, preregistered experiment outcomes, including losses).

The moat is **accountability infrastructure**: event identity, settlement lineage, quarantine semantics, closed-population accounting, and a single public truth contract. Competitors sell picks; we publish verifiable research.

## 2. What the simulation model is

A **transparent research layer**. It is NOT a proven oracle, and public surfaces must never imply otherwise.

- Its distributions, calibration curves, and disagreement analytics are product content.
- Its measured record vs the de-vigged market is published, including the losing parts.
- The independent sportsbook-beating objective is **SUSPENDED** by the preregistered stopping rule (Lane C, 2026-07-29). Backtest-optimization cycles against the frozen corpus are over.

## 3. Conditions for future predictive claims

A predictive-superiority claim may only be introduced if **all** of the following hold:

1. A preregistered protocol (thresholds declared before scoring) reaches **OUTPERFORMS_MARKET** on data that did not exist at registration time — i.e., forward-only live-shadow evidence, not another slice of the historical corpus.
2. The result is stable across sub-windows and not driven by a single market family.
3. The founder explicitly approves the claim and its public wording.
4. The claim ships with its evidence (sample, window, margin, and the same dashboard that would reveal its decay).

Absent all four, the strongest permitted language is factual disagreement description (see §5).

## 4. Separation of concerns (the three questions that must never be conflated)

| Question | Owner | Public artifact |
|---|---|---|
| **Model capability** — does the simulator out-score the market? | Preregistered protocols only | Experiment registry + decision docs; currently: NO |
| **Product usefulness** — does the terminal help users think? | Adoption analytics (Lane B) | Behavioral evidence, once measurement is live |
| **Market comparison** — what does the market believe and how has it moved? | Market-intelligence layer | De-vigged boards, movement, pairing provenance |

A weak answer to the first question does not diminish the second or third — that separation **is** the strategy.

## 5. Market family policy (ratified with Lane C evidence, 2026-07-29)

| Market family | Policy | Required public behavior |
|---|---|---|
| `batter_hits` | **RESEARCH CONTENT** (strongest family) | Visible, calibrated, benchmarked vs market; no superiority claim |
| `batter_hits_runs_rbis` | **RESEARCH CONTENT** | Market-context display; experimental status labeled |
| `pitcher_strikeouts` | **RESEARCH CONTENT** (insufficient test evidence) | Market-context display; uncertainty warning (small n, worst variance factor) |
| `batter_total_bases` | **DISABLED FOR PREDICTION** | History stays visible; no recommendation-style output ever |

Lane C's per-market verdicts (RESEARCH_CONTENT_ONLY ×2, DISABLE_PREDICTION, INSUFFICIENT_EVIDENCE) are the controlling evidence. No family earned CONTINUE_R&D; none may be promoted without §3.

## 6. Public positioning contract

Every core surface (homepage, /today, market/game detail, /results, /methodology, /system-status) must be able to answer the five §1 questions without prediction-first or superiority framing. Honest simulation content is encouraged; implied forward edge is forbidden. Historical failures are never removed. The existing guard suite (public-beta-safety, shadow-calibration bans, built-HTML truth guards) enforces the floor; Lane A's copy audit tracks the remainder.

## 7. R&D allocation rule

Model R&D may not consume the majority of effort while the incremental-signal evidence stands at zero (blend weight w = 0, three independent fits). Effort flows to: product & adoption, market intelligence, multi-sport foundations (per `docs/MULTISPORT_PROMOTION_GATES.md`), and the honesty ledger.
