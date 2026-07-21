# SimTheGame Parity Gap & GameTime Picks Advantage Plan

An honest audit of our current MLB game-report experience against SimTheGame-style expectations. Paper-only,
educational, $0 exposure. We classify every capability rather than overclaim it.

**Reference report:** the 12-section V2.5 MLB report (`app/src/components/game/mlb-simulation-report-v2.tsx`).

---

## Classification legend

| Code | Meaning |
|---|---|
| **A** | Supported **publicly now** |
| **B** | Supported as **market context only** (market-anchored, not a model claim) |
| **C** | **Internal-only** (under `data/internal/`, never web-served, never in a product) |
| **D** | **Not supported yet** (and will not be faked) |

---

## Parity table

| Capability | Status | Honest notes |
|---|---|---|
| **Full-game score center** | **D** | No public projected final score. The internal full-game model is still validating and mirrors the market; it stays internal. |
| **Win probability** | **D** public · **C** internal · **B** market-implied | No public win probability. Internal win-prob is validating-only. What we *do* show publicly is a **market-implied** de-vigged team snapshot (context, not a model claim). |
| **Player stats** | **A** | Recent-form / season context ships publicly in `reasonBullets` plus the player-prop lines themselves. |
| **Distributions (total-runs / margin)** | **C** | Player-prop distributions exist inside the 10k sim but are **internal**. There is **no public total-runs or margin distribution**. |
| **Key factors** | **A** | `reasonBullets` and risk tiers are public in the report. |
| **Betting markets** | **B** + **A** | Team markets show as a **de-vigged, market-anchored** snapshot (**B**). Player-prop **model probabilities** from the 10k sim are public (**A**). |
| **Clean report UX** | **A** | The 12-section V2.5 report is public and readable. |

---

## What GameTime Picks does better than SimTheGame (honestly)

These are advantages in **transparency, settlement rigor, and workflow** — not claims about beating the betting
market.

- **Player-prop 10,000-run simulation.** A real, reproducible 10k sim behind every priced game's props — not a
  single point estimate.
- **Eligibility transparency.** The report states which legs clear the product gates and which do not, in plain
  language, including a "not a bet" watchlist for the biggest model-vs-market gaps.
- **Deterministic official settlement support.** Every product leg settles from the official MLB Stats API box
  score (strikeouts / total bases) — no judgment calls, no scraped snippets.
- **Product-card workflow.** The Bank Builder and Moonshot review-card system, with md5-guarded promotion, is a
  disciplined approval path rather than an ad-hoc pick feed.
- **Paper / review mode with $0 exposure.** The entire product runs on paper; canonical money is md5-guarded
  (`affe6b21`) and cannot move as a side effect.
- **Clear no-play logic.** Unpriced games read "awaiting posted markets"; slates with no eligible legs read
  **No Play**. We never manufacture a card to fill a slot.

---

## What we do NOT support yet (and will not fake)

Each of these is **gated on out-of-sample validation** before it could ever go public. Until then it stays
internal or absent — never invented.

- **Public full-game projected score** — the internal full-game model mirrors the market (81-game backtest);
  the `pitcher-strength-v1` and `bullpen-fatigue-v1` features **failed** backtest and are not adopted.
- **Public win probability** — internal only, validating.
- **Public run / margin distributions** — player-prop distributions are internal to the sim; no public
  total-runs or margin distribution.
- **Any market-beating claim** — we do not claim to beat the market. The internal full-game model mirrors it and
  the soccer rating engine loses to it; both remain internal-only under `data/internal/`.

**Rule:** a capability moves from **D/C** to **A** only after it demonstrably holds up out-of-sample. Until then,
honest absence beats a confident fabrication.
