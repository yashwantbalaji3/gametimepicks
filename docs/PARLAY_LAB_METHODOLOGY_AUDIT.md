# Parlay Lab — methodology audit (§11 / §12 / §13)

**Audit date:** 2026-09-26 · **main:** `1676900fc9` · **Settled record:** 126 cards over 38 days,
2026-08-17 → 2026-09-25 (policy v2).
Read-only measurement against committed artifacts and pipeline source. **Nothing changed.**

> Founder observation: *suggested parlays have not produced satisfactory success; this appears true
> across risk levels.* It is true, it is measurable, and the repository had already diagnosed the
> cause — twice — and fixed it everywhere except the path that publishes the cards.

---

## 1 · The record

| stream | settled days | W–L | hit | staked | returned | ROI |
|---|---|---|---|---|---|---|
| MLB | 38 | 21–82 | 20.4% | 103 | 97.40 | **−5.4%** |
| UFC | 4 | 1–10 | 9.1% | 11 | 2.72 | **−75.3%** |
| Premier League | 9 | 4–8 | 33.3% | 12 | 12.86 | +7.2% |
| NFL | 0 | — | — | — | — | — |
| Multi-sport | 0 | — | — | — | — | — |

⚠ **NFL and multi-sport have never settled a card.** The lanes exist and are marked `live: true`;
they have produced no record at all. §29's "must no longer be effectively MLB-only" is not a
forecast — today's leg pool is **371 legs, every one of them MLB**.

---

## 2 · Do the risk tiers differ by defensible risk properties? (§11.4)

Partly — and not where it matters.

| tier | n | legs (med) | price (med) | implied P | realized hit | gap |
|---|---|---|---|---|---|---|
| low | 4 | 2 | 1.90 | 52.7% | **0.0%** | −52.7 |
| medium | 51 | 2 | 2.62 | 38.1% | 35.3% | −2.8 |
| high | 34 | 3 | 5.60 | 18.6% | 11.8% | **−6.8** |
| longshot | 37 | 5 | 13.63 | 7.6% | 10.8% | +3.2 |

**What works.** The tiers are clean, non-overlapping **price** bands, and implied probability is
strictly ordered (52.7 > 38.1 > 18.6 > 7.6). The tier is therefore not merely leg count, which
answers §11.4's literal question: a 2-leg card lands in `low`, `medium` *or* `high` depending on
price.

**What does not.** Realized hit rate is *not* ordered where the money is: `high` (11.8%) and
`longshot` (10.8%) are indistinguishable at n=34/37. The rungs a reader would read as materially
different risk are, in outcome, the same rung.

**Where the loss lives.** `medium` is close to its price and roughly break-even (ROI +2.6%).
`high` comes in **6.8 points under the probability it was sold at**, and that band alone is
ROI −41%. `longshot`'s +18% ROI rests on a handful of hits at a median price of 13.63 and should
not be read as skill at n=37.

⚠ **`low` has fired 4 times in 38 days and won none.** n=4 supports no conclusion about the tier,
and that is the point: **the tier a reader would trust most has essentially no record.**

### 2b · Three tier vocabularies, and one I wrongly called a defect

`slipId` carries a tier token, the card carries a `tier` field, and the optimizer buckets are
`conservative / balanced / aggressive / star_power`. Of the 67 slipIds carrying a token, **57
disagree with the `tier` field, shifted by exactly one rung** (low→medium 22, medium→high 22,
high→longshot 13).

I first read this as a mislabelling of the public record. **It is not.** The `tier` field is
derived from clean, non-overlapping price bands and is the one the ledger's `byTier` uses; the
slipId token is a stale internal label inside an opaque id. Recorded because the one-rung shift
looks exactly like the P-series "band = price not leg count" defect and the next reader will have
the same instinct.

---

## 3 · 🔴 The finding: no leg in this product has a probability

The optimizer's published pool, today: **371 legs · `playerId` 371/371 · `projection` 371/371 ·
`edgePct` 371/371 · `probability` 0/371.**

No probability, anywhere: not on a leg, not on a card, not in the settled record. A card's only
probability is the book's price.

Three consequences follow directly:

1. **§13's correlation framework cannot be built on this.** The section warns against naively
   multiplying marginals. There are no marginals to multiply.
2. **§28's joint calibration cannot be measured.** "Actual success by predicted probability bucket"
   needs a predicted probability. §1's table above is against the *market's* implied probability,
   which is the only one that exists.
3. **§12's `ProductEligibleLeg` cannot be populated** from this producer as specified. It asks for
   `projection/probability`; a projection is here, `edgePct` is not a probability.

---

## 4 · 🔴 The selector promotes two signals it has measured as harmful

`pipeline/parlay_optimizer.py::leg_score` — the scorer that produced every leg published today:

```
base = confidence_weight × cw × tier_adjust  +  edge_weight × (min(edge,15) / 15)
       + recent10_bonus + pid_bonus + star_boost
base × marketWeight × calibrationFactor
```

Measured against the artifact's own 371 rows:

| | |
|---|---|
| `confidenceComponent` | Low **0.21** · Medium **0.455** · High **0.455** — a 0.245 spread on a legScore range of 0.35–1.22 |
| `edgeComponent` | rises **monotonically** with `edgePct`, 0.0226 → 0.30 (cap reached at edge 15) |

Together these are the majority of a typical leg's score. And the repository has already measured
both as wrong — in its own words, in `_sgp_leg_quality`'s docstring, written after a 0-23 run:

> **EMERGENCY REVAMP (post-June-7 0-23):** the prior score was `edge × confidence + …`, which
> rewarded exactly the legs that lose. Settled leg-level data shows both drivers are
> inverted/non-predictive:
> • Edge is NEGATIVELY predictive above ~10% (10-20% ≈ 44.9%, 20%+ ≈ 41.2% vs 0-10% ≈ 51%).
> • Confidence is inverted — High (48.1%) < Low (50.6%) < Medium (51.2%).

That revamp makes large edge a **penalty**, drops the confidence label entirely, and ranks on
market reliability and recent form instead. **It is wired only to the SGP/NBA paths** (lines 1743,
2318). The daily card path (871, 880, 1016, 1177, 1181) still calls `leg_score`.

### 4b · ⚠ And the artifact says the fix is applied

`optimizer/2026-09-26.json` publishes `learningPolicyApplied: true` with:

```
"edge signal is INVERTED at high values — edge capped, not used to promote"
"confidence non-predictive (spread 4.6pts) — excluded from ranking"
```

Measured against the same file's rows: **confidence is not excluded** (Low 0.21 vs Medium/High
0.455) and **edge does promote** (monotonic to the cap). Capping bounds how much a signal
promotes; it does not stop it promoting, and a signal the same policy calls *inverted* should not
carry a positive weight at any cap.

**A policy that measures a signal as harmful, states it removed it, and did not, is worse than one
that never measured it — the warning reads as a fix.** This is the vacuous-guard shape applied to a
model policy rather than a test.

---

## 5 · §12 — four definitions of "a good leg", not three

| # | where | edge | confidence | also |
|---|---|---|---|---|
| 1 | `parlay_optimizer.leg_score` | **promotes**, clip 15 | **promotes** (Low penalty) | star boost, market weight, calibration |
| 2 | `parlay_optimizer._sgp_leg_quality` | **penalises** above a threshold | **dropped** — "the label itself is not trusted" | market reliability, recent form |
| 3 | `snapshot_parlays._leg_score` | promotes, clip **20** | promotes, **High 1.0 / Med 0.65 / Low 0.3** | MLB top-player boost |
| 4 | `bank-builder-eligibility.ts` | — | — | header: *"It does not use edgePct/confidence."* |

Three different edge clips, three different confidence scales, and one product that refuses both
inputs outright. **Bank Builder's choice matches the measured evidence; the Parlay Lab's primary
scorer contradicts it.** They cannot both be right about the same leg.

**The star/top-player boosts are not the defect here.** Both modules document themselves honestly
as transparent product preferences and explicitly *not* confidence models, and
`star_players.py` makes the same argument the emergency revamp does — that a thin-sample bench
player's large edge is a pricing artefact, not an edge. They are a counterweight to a term that
should not be positive in the first place.

---

## 6 · What this means for the rebuild

**Structural, no promotion gate needed:**

1. **Record what was predicted.** A settled card must carry the model's own probability for each
   leg and for the card, or §28 can never be evaluated. Today the settled record carries
   `combinedDecimal` and `result` and nothing else. This is the prerequisite for everything below.
2. **One leg scorer.** Four is not a design. The merge target is #2's evidence, not #1's formula.
3. **Make `learningPolicyApplied` mean it** — or stop publishing it. Assert in a test that a signal
   named in `policyWarnings` as excluded contributes zero to `legScore`. That guard would be red
   today, which is the correct state for it to start in.
4. **NFL and UFC into the pool.** The pool is MLB-only today, not because the other sports lost a
   fair comparison but because they are not in it.

**Needs preregistration (§27):**

5. Replacing `leg_score` on the daily path. The evidence for #2's direction exists but was gathered
   in June on a different population; re-register before adopting, and evaluate walk-forward.
6. Any joint-probability model, and therefore any correlation treatment (§13). Both depend on step 1.

**Founder gates:**

7. **`high` tier.** It is 6.8 points under its price over 34 cards and −41% ROI. Options: withdraw
   the rung, keep it clearly marked as unvalidated, or hold it until the rebuild. Not my call.
8. **`low` tier.** 4 cards in 38 days and no wins. Either the no-play rule is working exactly as
   §30 intends and the rung is honest, or the rung is mis-specified. n=4 cannot tell them apart,
   and publishing a "conservative" tier with no record is the thing to decide.

---

## 7 · What I got wrong while producing this

- **I called the slipId/tier disagreement a mislabelling of the public record.** It is a stale
  token in an opaque id; the public tier is price-derived and correct (§2b).
- **I reported "57 of 126 mismatched".** It is 57 of the **67** that carry a token at all; 59
  slipIds carry none. The denominator was wrong in a way that overstated the problem.
- **I recorded in the Engine V2A audit that MLB player identity is absent.** It is absent from the
  *predictions and props* path; the optimizer's leg pool carries `playerId` on **371 of 371** rows.
  The gap is a path, not the sport. That document is corrected in the same commit series.

---

## 8 · Bank Builder and Moonshot (§14 / §15)

Same method, same day, same rule: measured against committed artifacts only.

### 8.1 The records

| product | bets | W–L | stake | profit | last settled | freshness label |
|---|---|---|---|---|---|---|
| Bank Builder | 73 | **37–36** | 100 | +15,890.40 | 2026-09-22 | fresh |
| Moonshot | 7 | **0–7** | 175 | −175 | **2026-07-06** | fresh |
| World Cup Specials | 18 | **0–18** | 180 | −180 | 2026-07-07 | stale |
| Homer Nukes | 0 | — | 0 | 0 | never | stale |

**Bank Builder is a coin flip at the card level: 37–36, 50.7% over 73 bets.** Its +15,890 is a
compounding ladder on a $100 base, not a per-bet return, and the ROI column in the artifact
(`15890.4`) is that multiple rather than a rate — it should not be read as 1,589,040%.

⚠ **And the ladder's headline is a June run on sports the product no longer covers.** The public
ledger's five entries — 2026-06-09 to 06-13, **5 wins from 5** — took $100 to $10,376.17 and are
marked `nextPickStatus: "completed"`. Their sports: MLB ×1, **NBA ×2**, **World Cup ×1**, Mixed
(World Cup + MLB) ×1. NBA is not part of the current public prediction product and the World Cup
lane is retired. Two thirds of the number that defines this product came from lanes that no longer
exist. (That artifact is referenced only by tests, not by a rendered component — but it is the
`public-ledger-latest.json` a reader would find, and the ladder it describes is the one the product
is named for.)

**Moonshot is 0 for 7, lifetime.** Its side-lane companion, World Cup Specials, is 0 for 18. The two
together are −355 on 355 staked: **−100%**.

### 8.2 ⚠ Moonshot publishes daily and its record has not moved in 82 days

`freshness: "fresh"` beside `lastSettledDate: 2026-07-06` looks like a defect and is not one:
`freshnessFor` answers *"is there a card for today's slate?"*, says so in its own docstring, and
today's portfolio does carry a Moonshot card (exposure 25, 1 pending). The product is running.

The real finding is what sits behind that. The lifecycle store settled two Moonshot cards on
**2026-08-17** and deliberately did not write them to the money record:

> grading cards frozen on 2026-08-17 in place would restate financial history that predates this
> settlement. Outcomes are recorded here instead; the money record is unchanged.

That reasoning is sound — a settlement owner should not silently restate history. The consequence
is not: **the public Moonshot record is 82 days old while the product publishes a card a day**, and
the lifecycle artifact that holds the newer outcomes was itself last generated **2026-09-07**, with
`settled: 1, held: 3`. A reader cannot tell from either artifact that the product has been running.

⚠ This is the same shape as the nightly-settle defect in the overnight handoff: work is computed
and then not published, and the surface that would show it stays at its last good value. It is not
the same bug, and it needs its own decision.

### 8.3 What this means against §14 and §15

- **"Effectively MLB-only" is confirmed for the constructor** (371/371 MLB legs today) and
  *inverted* for the historical Bank Builder record, which is mostly NBA and World Cup. Neither is
  the MLB+NFL+UFC target.
- **Neither product has a model probability**, for the same reason the Parlay Lab does not: the
  legs it selects from do not carry one. Every published Bank Builder and Moonshot probability is
  a de-vigged market price. That is honest as *market context* (§3) and it is not a model.
- **Bank Builder at 37–36 is not evidence of a working selector**, and it is not evidence of a
  broken one either. It is 73 observations of something indistinguishable from the price.
- **Moonshot at 0–7 is too small to judge** and too small to publish as a record. §30's NO PLAY
  state and a shadow period are the right posture, not a rebuild justified by seven cards.

### 8.4 The one thing that must come first

Every recommendation in §6 applies here unchanged, and step 1 applies hardest: **a settled card
must record the probability the model gave it.** Until then Bank Builder's 37–36, Moonshot's 0–7
and the Parlay Lab's tier table are all measurements of the *market's* probability, and no amount
of further auditing can separate the selector's contribution from the price it inherited.
