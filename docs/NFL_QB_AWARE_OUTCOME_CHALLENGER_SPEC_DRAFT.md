# NFL QB-aware game-outcome challenger — validation specification (DRAFT for founder approval)

Status: DRAFT, 2026-11-11, forecast-guard (engine). Founder approval for Option B (~18:30Z) covers development and
evaluation only — **not promotion**. No confirmatory run happens before this file's sha256 is approved. Bars marked
**[FOUNDER]** are left to the founder; the drafter has seen exploratory QB-projection history (not outcome history for
this candidate).

## 1. What it is — and how it differs from the rejected candidate
**Candidate `qb-projected-passing-drive-tilt-v1`.** Within Simulation V2, each offense's drive-result tilt θ is:

  θ = θ₀ + κ · Δ

- **θ₀** — today's tilt, solved so the simulated mean points equal the official forecast's implied team points.
- **Δ** — the starter's projected passing value minus a league-average starter's in the same team context:
  (starter's projected mean passing yards − `leagueStarterProjection` mean for the same club and season) ÷ the league
  yards per drive.
- **The starter's projection** — the board's tier (a) row, or the frozen tier (b) / (d′) method; the frozen challenger
  spec v1, sha256 0f7e8c6b9cdec328a06d1a64b8d99016726e98bf86718a13b4786f2eb01944a5.
- **κ** — one coefficient, fitted walk-forward on development seasons only (§3).

The same runs then produce QB, receivers, rushers, TDs and score, which reconcile per run under the existing
conservation contract. The implied win%, margin and total are read from those runs.

**It is NOT `qb-absent-elo-shift-v1`**, which stays rejected and is not retuned or renamed:

| | `qb-absent-elo-shift-v1` (rejected) | this candidate |
|---|---|---|
| Signal | a binary availability flag (primary QB absent) | the continuous projected passing value of the identified starter, for every game |
| Applied as | a rating (Elo) shift | a drive-result tilt inside a coherent game simulation |
| Win head | rejected — not retried | evaluated only as a *reported* metric; promotion of a win head is out of scope under the ceiling rule unless the founder re-opens it explicitly |
| Margin and total | margin ELIGIBLE at the oracle ceiling | margin and total are the primary heads |

## 2. Inputs — pregame and timestamped only
- **Starter identity:** depth-chart captures and injury and roster captures, each stamped strictly before kickoff.
  Committed timestamped captures exist only from 2025 onward; 2022–2024 charts have no capture instant (the 2026-09-25
  refusal).
- **The starter's projection:** the board or the fallback method as of the receipt of record, the latest before kickoff.
- **Official anchors:** the official forecast of record (`nflOfficialOfRecord`), unchanged.

## 3. Data split
| Use | Data | Status |
|---|---|---|
| Development (fit κ) | REG 2018–2024, starter = the game's leading passer (hindsight identity — labelled; κ only) | exploratory |
| Development check | REG 2025, timestamped starter identity | exploratory |
| **Confirmatory** | every REG game after approval, forward only, untouched | the only decision-bearing data |

Development results are never pooled with confirmatory results.

## 4. Heads, metrics, baselines
**Heads:**
- margin: median absolute error, and 80% interval coverage;
- total: median absolute error, and 80% interval coverage;
- win: log loss, reported only.

**Strata:** every game; and games with a non-established starter on either side (tier b / d′, or a promoted backup).

**Baselines:**
- the official forecast of record — the incumbent;
- the official-anchored Simulation V2 with κ = 0. This isolates the QB term.

**Uncertainty:** paired differences per game; 95% cluster bootstrap over season-weeks (2000 resamples; seed from the
P300 prereg). Every stratum's n is reported. A stratum with n < **[FOUNDER]** is listed, never summarised as a direction.

## 5. Decision bars — **[FOUNDER]**
Margin and total, each:
- confirmatory n ≥ **[FOUNDER]**;
- paired MAE CI against the official entirely below 0;
- 80% coverage within **[FOUNDER]**, for reference the P300 band 0.72–0.88;
- the effect holding in the non-established-starter stratum.

The win head is reported, with no bar. Meeting the bars makes the candidate *eligible for a separately preregistered
promotion program* — nothing more.

## 6. Invariants
- Official forecasts, frozen history and public win% stay unchanged throughout.
- Receipts are write-once. Challenger receipts live in their own directory. No public surface reads them before
  promotion (the existing guard: no official surface reads a sim receipt).
- Same seed plus frozen inputs gives byte-identical receipts.
