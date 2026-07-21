# July 15 Flagship Product Decision (re-verified)

Money locked `affe6b21`, exposure $0. Founder asked for a paper-only card from today's England vs Argentina
team-market candidates (Draw No Bet England, Total Under 2.5, BTTS No). After re-verification: **No Play for both
Bank Builder and Moonshot** — the candidates are not product-eligible and are mutually correlated. Nothing forced.

## Re-verification of each candidate (real 07-15 artifact, England vs Argentina)
Source: `world-cup/projections/latest.json`. Eligibility gate: `pipeline/world_cup/soccer_policy.py`
`parlay_eligibility` — a leg needs a **model edge over the de-vigged price** (moneyline ≥1.2%, double-chance ≥1.0%,
total ≥1.25%), and `bankBuilderEligible = parlayEligible AND riskTier=="Low"`. WC is **market-implied** (model ==
market), so the edge is ~0 on every market.

| candidate | odds | settle | market edge | parlayEligible | bankBuilderEligible | rejection |
|---|---|---|---|---|---|---|
| **Draw No Bet — England** | −143 | regulation_90 ✓ | ~0% | **false** | **false** | no model edge over the price (market-implied → −EV after vig) |
| **Total — Under 2.5** | −175 | regulation_90 ✓ | ~0% | **true** | **false** | parlay-only; not Bank-Builder (not Low-risk edge); a −175 market-implied favorite, no value |
| **BTTS — No** | −120 | regulation_90 ✓ | ~0% | **false** | **false** | coin-flip (50/50), no edge |

**Correlation:** all three are satisfied by the SAME low-scoring-England-win scenario (e.g. England 1-0 → Under 2.5
✓, BTTS No ✓, DNB England ✓). They are strongly positively correlated — stacking them multiplies the odds as if
independent while concentrating risk on one outcome. That is the OPPOSITE of a safe card.

## Bank Builder — **NO PLAY**
Zero `bankBuilderEligible` legs today (all market-implied, ~0 edge, not Low-risk-edge). The engine wrote no
proposal and the WC value-parlay engine produced **0 cards**. No operator-approved card authored. A card is **not
forced** — building a bank on 0-edge correlated favorites is exactly the fake product the guardrails forbid.

## Moonshot — **NO PLAY**
Only one leg (Total Under 2.5) is even `parlayEligible`, and it's a **−175 favorite** — not a longshot (Moonshot
targets +700..+3000). The other two aren't parlay-eligible, and all three are correlated, so no honest
multi-leg longshot exists. Public ladder stays **stopped, $0**.

## Why NOT override the eligibility (founder-approved ≠ ignore the rules)
A founder-approved card still has to be an honest product: real edge OR a genuine longshot, settlement-supported,
correlation-aware. These candidates are 0-edge market-implied favorites that are mutually correlated. "Paper-only,
$0" doesn't make a −EV correlated parlay a good educational product — it would still visually imply a "pick" with
value it doesn't have. Per the mission's own rule ("if there are not enough eligible legs, keep No Play"), No Play.

## Moonshot stopped-ladder cleanup (done)
The stopped ladder's public **candidate pool** previously listed a stale `player_goal_scorer_anytime` parlay
(settlement-pending, product-ineligible). Fixed two ways:
- `publicMoonshotCandidates(lane)` (`moonshot-lane.ts`) drops any candidate card containing a `player_*` leg, wired
  into `moonshot-lane-tracker.tsx` — the public surface can NEVER show a settlement-pending prop candidate.
- Patched `moonshot-lane/active.json` to remove the goalscorer candidate (2 → 1; only a team-market `double_chance`
  card remains). Money md5 unchanged.
- The `/moonshot` page no longer shows the stale June-19 **prior-run card** (which held now-ineligible goalscorer
  legs): the tracker only surfaces a prior run whose card is settlement-supported (team markets). The record
  summary still reflects it; only the prop-leg detail is hidden. `/moonshot` + `/mr-dub` Moonshot tracker are now
  free of prop labels.
- **Not altered:** the `/mr-dub` money-journey ledger's one historical settled card (a past leg in the canonical
  $100→$19,065.40 reconciliation) — touching it would break the money proof. It is honest *settled history*, not a
  current-eligibility claim. Tests: `moonshot-candidate-safety.test.mjs`.

## Money / exposure — UNCHANGED
`portfolio.json` md5 `affe6b21`, exposure $0, bankroll $19,065.40, crown $20,465.40, record 19-14. No active/placed
product card. No player props placed. No official-money change.

## Verdict
- **Bank Builder = No Play** (no eligible legs; would be a fake/correlated card).
- **Moonshot = No Play** (no honest longshot; only 1 eligible leg, a favorite).
- **France vs Spain = PENDING** (still no trusted 90'-separated official score).
- Public Moonshot candidate pool cleaned of settlement-pending props.
