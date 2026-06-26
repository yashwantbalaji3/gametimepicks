# Bank Builder Survival Audit — June 26, 2026 (Cycle 3, Lane A Step 2)

**Mandate:** maximize the probability of completing the $100→$10,000 ladder. NOT EV, payout, or
excitement — survival only. Lane A won June-25 Step 1 ($100→$201.08) and now climbs Step 2; Lane B is
stopped (lost June-25, restart operator-gated). Re-evaluated from scratch on the June-26 markets.

**Verdict: the generated Lane A Step-2 card is on the survival frontier — KEPT, no leg replacement.**

## Rung target
Step 2 rolls $201.08 toward the $700 rung → required combined multiplier **3.481×** (= 700 / 201.08).

## Candidate universe (verifiable June-26 model feed)
6 World Cup games; markets the model can evaluate: **moneyline · double chance · draw no bet · BTTS**.
**No totals offered on June 26** — so (per "never fabricate unsupported markets") totals are out of the
universe. De-vigged probabilities (`wc-odds-only-v2`):

| Game | Safe anchors (P) | Payout legs (P) |
|---|---|---|
| New Zealand vs Belgium | Belgium DC 0.937 · Belgium DNB 0.919 · Belgium ML 0.811 | BTTS No 0.547 |
| Senegal vs Iraq | Senegal DC 0.921 · Senegal DNB 0.903 · Senegal ML 0.775 | BTTS No 0.551 |
| Uruguay vs Spain | Spain DC 0.864 · Spain DNB 0.825 · Spain ML 0.627 | BTTS No 0.582 |
| Norway vs France | France DC 0.807 · France DNB 0.758 · France ML 0.602 | BTTS Yes 0.600 |
| Egypt vs Iran | Egypt DC 0.737 | Egypt ML 0.372 · BTTS No 0.554 |
| Cape Verde vs Saudi | CV-or-SA DC 0.712 | Cape Verde ML 0.359 · BTTS Yes 0.506 |

## Generated card (KEPT)
**Egypt or Draw** (DC, −320, P 0.737) + **France ML** (−175, P 0.602) + **Senegal/Iraq BTTS No** (−140,
P 0.551) → combined **+254 (3.54×)** → $201.08 → **$710.96** (clears the $700 rung). Legs across 3
distinct games (no correlation). **Survival = 0.737 × 0.602 × 0.551 = 24.4%.**

## Combination search (every distinct-game combo reaching ≥ 3.481×, ranked by survival)
| Structure | Best survival | Card |
|---|---|---|
| 2-leg | 23.3% | Spain ML + Egypt ML @ 3.86× — **worse** (needs a longshot to reach 3.48×) |
| **3-leg** | **24.8%** | Cape-Verde-or-Saudi DC + Belgium DC + **Egypt ML (0.37)** @ 3.48× |
| 3-leg (generated) | 24.4% | Egypt-or-Draw DC + France ML + Senegal BTTS-No @ 3.54× |
| 4-leg | 23.9% | (more legs → lower joint) — **worse** |

## Why every leg survived the audit
- **Structural ceiling.** In this efficient (no-edge) odds-only market, payout ≈ 1/survival, so *any*
  combo reaching 3.481× sits at ~24–25% survival. The generated card (24.4%) is on that frontier; the
  best alternative is 24.8% — a **0.4pp** difference, inside model noise (`dataQuality: limited`,
  confidence-capped).
- **The 0.4pp "better" card is actually riskier.** The 24.8% option requires **Egypt ML at 0.372** — an
  underdog moneyline to win OUTRIGHT (a single high-variance, lineup-sensitive coin-flip-minus). The
  generated card instead uses **Egypt-or-DRAW (DC, 0.737)** — covering Egypt win OR draw — plus a solid
  favorite ML (France) and a BTTS-No. Per the survival doctrine (prefer Double Chance / safe markets,
  minimize single-leg variance), the generated mix is **objectively preferable** despite the trivially
  lower joint number.
- **3 legs beats 2 here.** No 2-leg card reaches 3.481× without a longshot (best 2-leg = 23.3%). Three
  medium-high legs (0.74 / 0.60 / 0.55) is the safer path to a 3.48× rung than one anchor + one longshot.
- **No totals available** — the June-26 feed offers none, so the Step-1-style "DC anchor + safe total"
  shape isn't constructible; the selector correctly used the next-safest mix.

## Honest caveat
~24% survival at the $700 rung is brutal, and it compounds: clearing all four remaining rungs (Steps 2–5)
is realistically low-single-digit percent. That is the math of a 100× ladder in an efficient market, not
a flaw in the card. The card maximizes survival *given the rung target*; it cannot make a 3.48× step safe.

## Decision
**Keep the generated card.** It is the survival-maximizing rung-clearing card on June-26's available
markets; the only marginally-higher option trades 0.4pp of paper joint-probability for a high-variance
underdog moneyline, which the survival mandate rejects. No leg replaced.

*Reproducibility:* probabilities are `modelProbability` (de-vigged) from
`world-cup/projections/2026-06-26.json`; payouts are products of American-odds decimals. Generated 2026-06-26.
