# MLB Simulation Uncertainty Audit

_What uncertainty the public MLB simulation actually carries, whether it is exposed, and how it must be framed.
Artifact-backed: every claim below was confirmed by opening `app/public/data/mlb/game-simulations/<date>.json` and the
schema in `app/src/lib/game-simulations/types.ts`. No inferred fields._

## TL;DR

- **Real per-prop distributions already exist.** Each simulated player line carries a full histogram from the
  10,000-run Monte Carlo — `game.distributions[key]` with `sampleCount: 10000` and non-empty `bins[]`.
- **Percentiles / a central band are derivable today** with no new modeling: the bins carry `probability` mass
  (and raw `count`), the mass sums to 1.0, and a CDF interpolation yields p10 / p50 / p90.
- **The uncertainty is currently under-exposed.** It renders as a histogram in the report (Section 7) but the
  numeric spread (median, p10–p90 band) is not surfaced anywhere, and the board/pick rows show only a point
  probability with no interval.
- **Framing is the hard constraint.** This spread is the *deterministic simulation's own* dispersion — NOT a
  validated predictive interval, and NOT model-vs-market confidence. The research/model calibration gate is
  BLOCKED; simulation uncertainty must never be relabelled as "how sure the model is that it beats the market."

## What the artifact actually contains

Confirmed on the 2026-07-22 slate, game `8291188eca889695bdbc42aac91ad1e5` (NYY vs PIT), which carries **46**
per-prop distributions. Example — `pitcher_strikeouts__543037__6.5` ("Gerrit Cole — Strikeouts (line 6.5)"):

| Field | Value | Meaning |
|---|---|---|
| `sampleCount` | `10000` | Real sampling ran — an "N-run" claim is honest here |
| `bins.length` | `16` | One bin per strikeout outcome (0,1,2,…) |
| `bins[i].lowerEdge`/`upperEdge` | e.g. `0`/`1`, `3`/`4` | Numeric bin edges (present for numeric props) |
| `bins[i].count` | e.g. `124`, `815` | Raw samples in the bin |
| `bins[i].probability` | e.g. `0.0124`, `0.0815` | Mass in the bin, 0..1 |
| Σ `probability` | `1.0000` | Complete, normalized distribution |

**Derived percentiles (CDF interpolation over the real bins):** p10 = 3 K, p50 = 6 K, p90 = 9 K. This is a genuine
dispersion read straight from the sampled mass — nothing is invented.

Schema (`types.ts`): `SimDistribution { key, label, sampleCount?, bins[] }`, `SimDistributionBin { label,
lowerEdge?, upperEdge?, count?, probability }`. A distribution is only present when it is **real** (non-empty bins);
a game without one honestly reports the module as unavailable rather than faking empty bins.

## Where uncertainty lives vs where it does NOT

- **Lives on:** `game.distributions[<prop key>]` — a per-prop histogram. This is the only place dispersion exists.
- **Does NOT live on:** the per-`pick` object. A generated pick carries `modelProbability` / `marketProbability` /
  `edgePct` — point estimates, no sigma, no percentiles. So any interval the UI shows must be sourced from the
  matching `distributions` entry, joined by the prop key, and must be null when no distribution is present.

## Current exposure vs recommended

| Surface | Uncertainty shown today | Recommended (no new modeling) |
|---|---|---|
| Report Section 7 (Distributions) | Histogram bins (visual) | Add numeric p10 / median / p90 caption under the histogram |
| Player board rows | Point probability only | Optional: a compact p10–p90 band from the joined distribution |
| Pick / watchlist | Point probability + difference | Leave point; link to the distribution rather than fabricating a sigma |
| Games with no distribution | (nothing) | Explicit "distribution not computed" — never a fabricated band |

The safe, incremental win is a **numeric band caption** on the existing histogram (median + p10–p90), because the
histogram is already the honest artifact and the band is a pure read of its mass.

## Non-negotiable framing (simulation uncertainty ≠ model confidence)

1. **This is the simulation's dispersion, not a validated interval.** The 10k runs describe how the *seeded model*
   scatters outcomes given its inputs. It is not a backtested, calibrated predictive interval. Copy must say
   "simulation range / simulated spread", never "confidence interval" or "we're 90% sure".
2. **Never conflate with research-model confidence.** The research/model calibration gate is BLOCKED (all four
   modeled MLB markets lose to the market on Brier + logloss; the model is over-confident). A wide or narrow
   *simulation* histogram says nothing about whether the model out-predicts the market. Keep the two ideas in
   separate sentences and separate surfaces.
3. **Distinguish missing from zero.** No distribution ⇒ "not computed", not "0". A single-bin spike is a real
   (narrow) distribution, not a missing one.
4. **No edge / value / lock / best-bet framing** anywhere near the band. The band describes outcomes, not a bet.

## Verdict

Simulation uncertainty is **REAL and exposable** — the distributions carry 10,000-sample, normalized, per-prop
histograms and percentiles are a pure derivation. The gap is exposure (numeric band) and framing discipline
(simulation spread ≠ predictive confidence ≠ market-beating claim). Recommended next step: a median + p10–p90 band
caption on the existing Section-7 histogram, joined by prop key, null-safe when no distribution exists. No modeling,
no money change, no research surface.
