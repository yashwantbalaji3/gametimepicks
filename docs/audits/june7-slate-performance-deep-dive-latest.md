# June 7 Slate Performance Deep-Dive (latest)

> Evidence base for the emergency model/parlay fixes. All figures from settled,
> leakage-free data (`mlb/results/settled_leans.jsonl`, 7,025 board leans across
> 17 dates) and graded `publicRiskSections`. No fabrication.

## Headline
June 7 Suggested Parlays (`publicRiskSections`) went **0W-23L (0.0%)** across all
four tiers. This was not bad luck alone — the leg-selection signals are
**inverted**, so the optimizer systematically picks the worst-performing legs.

## Leg-level projection reliability by MARKET (Wilson lower bound, 95%)
| Market | Overall | Recent (Jun 3-7) | Jun 7 | Verdict |
|---|---|---|---|---|
| `batter_hits` | 53.0% (lo 51.3%, n=3189) | 51.6% | 52.9% | **reliable — the only edge** |
| `batter_hits_runs_rbis` | 49.1% (lo 46.9%, n=2126) | 46.4% | 44.8% | below 50% — downweight |
| `pitcher_strikeouts` | 47.4% (lo 42.4%, n=367) | 48.8% | 50.0% | below 50% — downweight |
| `batter_total_bases` | **42.7%** (lo 40.1%, n=1343) | **41.6%** | **41.2%** | **systematically bad — quarantine** |

## The inverted signals (root cause)
**Edge is NEGATIVELY predictive** — the bigger the model's claimed edge, the worse the leg:
| edgePct band | Overall | Recent |
|---|---|---|
| <0% | 51.3% | 50.0% |
| 0-5% | 51.4% | 48.5% |
| 5-10% | 51.2% | 51.2% |
| **10-20%** | **44.9%** | **41.3%** |
| **20%+** | **41.2%** | **42.0%** |

**Confidence label is inverted** — "High" does worst:
- High **48.1%** < Low 50.6% < Medium 51.2% (overall, n=7025).

**Side:** Over 49.9% ≈ Under 48.7% (no strong bias).

## Why this produces 0-23
The optimizer's `_sgp_leg_quality` ranks legs by `edge × conf_weight + …`, i.e. it
**prefers high-edge, high-confidence legs** — exactly the buckets that hit ~41-48%.
It also freely uses `batter_total_bases` (~42%). Parlays require every leg to hit,
so multiplying ~45% legs across 2-6 legs collapses the slip hit rate
(0.45² ≈ 20%, 0.45⁴ ≈ 4%). A whole slate of such slips realistically goes ~0-for.

## Structural truth (no excuses, no false hope)
Even the best market (`batter_hits` ~53%) makes a 2-leg parlay ≈ 0.53² ≈ 28% and a
4-leg ≈ 8%. **Player-prop parlays are inherently low-hit-rate**, and these
projections are at-or-near coinflip on three of four markets. Fixes can stop us
from publishing the *worst* legs and stop *actively selecting losers*, but they
cannot make multi-leg prop parlays high-probability. The product must (a) publish
far fewer, higher-quality cards (or none), and (b) keep framing honest.

## Fix priorities (evidence-ranked)
1. **Quarantine `batter_total_bases`** from Suggested Parlays (high-risk-only at most).
2. **Stop preferring high edge** — cap/penalize edge >~7-10% in leg quality (it's overprojection).
3. **Flatten/neutralize confidence** in leg quality (High is worst).
4. **Downweight** `batter_hits_runs_rbis` and `pitcher_strikeouts`; **prefer `batter_hits`**.
5. **Strict Low gate:** Low = reliable market (`batter_hits`) + negative odds + moderate edge + non-stale form; else Low is empty.
6. Simulate 1-5 on settled dates before shipping; expect FEWER cards (honest).
