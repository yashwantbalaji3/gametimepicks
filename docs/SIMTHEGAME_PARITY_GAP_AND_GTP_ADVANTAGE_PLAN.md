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
| **Distributions** | **A** player-prop · **D** full-game | **Player-prop** outcome distributions (bins) are now a public report section (§7), clearly labelled player-prop. There is still **no public total-runs or margin (full-game) distribution** — that stays unsupported. |
| **Key factors** | **A** | `reasonBullets` and risk tiers are public in the report. |
| **Betting markets** | **B** + **A** | Team markets show as a **de-vigged, market-anchored** snapshot (**B**). Player-prop **model probabilities** from the 10k sim are public (**A**). |
| **Clean report UX** | **A** | The 12-section V2.5 report is public and readable. |

---

## Presentation revamp — before / after (this mission)

The July-21 gap-bridge mission was UX/organization only (no new model claims). Before, the MLB game page stacked
the runner's answer-first dashboard **and then** the V2.5 report lower down — two reports, deep scroll, duplicated
market-snapshot / result / leans. After, **V2.5 is the single primary report** right after the "Simulation complete"
header, and the old dashboard is demoted into ONE collapsed "Advanced simulation detail" block.

| Category | SimTheGame | GameTime before | GameTime after | Remaining gap |
|---|---|---|---|---|
| Navigation / IA | simple, clean | heavy sidebar, no in-report index | in-report mini-nav (Summary · Player board · Agreement · Distributions · Products · Methodology) + "what happened / look at / not shown" orientation | none material |
| Game selector | clean grid | `/games` + `/simulate` lobby | unchanged (already clean) | none |
| Simulation result | one primary | duplicated (runner + V2.5) | **one** result block (V2.5 §3); runner's copy collapsed | none |
| Player stat table | signature box-score grid | prop list only | **Player simulation board** (§4): player · market · line · proj · model% · market% · gap · risk · product tag | no batted-ball / xStats (not in artifact) |
| Distribution visuals | margin/total charts | buried, generic label | **player-prop** distribution section (§7), labelled, empty-state | no public full-game run/margin distribution (D) |
| Market agreement | "96/100" card | buried in a collapsed accordion | clean **Market agreement** card (§6): score /100 + avg/widest gap + per-market bars (sanity check, not calibration) | none |
| Product-card integration | none (SimTheGame has no products) | eligibility count, low in report | per-pick **product tags** (Bank Builder Lane A/B, Moonshot Step 1, paper · $0) on the board + watchlist; eligibility summary §9 | — (this is a GTP-only advantage) |
| Settlement support | none | deterministic, low in report | deterministic official-box-score settlement, §8 | — (GTP-only advantage) |
| Transparency | good | good | product tags + "what is not shown" + honest empty states | none |
| Launch-readiness | live product | public paper beta | public paper beta, unified report | still no public full-game score / win prob |

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
