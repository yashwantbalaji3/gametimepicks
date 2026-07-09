# Full-Game Simulation Gap Audit (2026-07-09)

**Honest verdict up front: GameTime does NOT have a full-game MLB score simulation.** What exists today
is a **market-implied full-game snapshot** (de-vigged team-market lines) plus a **10,000-run
player-prop simulation** (per-prop, not full-game). This doc maps exactly what would be needed for a
true FreeSim-style full-game sim, and what can/can't be shown honestly now.

Money md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $19,065.40, $0 exposure — unchanged (audit only).

---

## 1. Current MLB artifacts

| artifact | what it is | full-game sim? |
|---|---|---|
| `public/data/mlb/game-simulations/<date>.json` | 10,000-run **player-prop** simulation (`runCount=10000`, generated picks, per-prop distributions) | ❌ per-prop only, not game score |
| `gameCenter` (`getMlbGameCenter`, from `team-markets/<date>.json`) | de-vigged moneyline / total / run-line — **market-implied** | ❌ market snapshot, not simulated |
| `player-props/`, board `leans` | posted prop odds + model probs | ❌ prop layer |
| `results/settled_leans.jsonl`, `comparison_report_*`, `calibration/*` | money-independent model-performance grading + calibration rows | n/a (grading) |
| `data/internal/mlb/product-settlement/*`, `linescores/*` | internal settlement ledger + StatsAPI final scores | n/a (settlement) |

## 2. What the unified report displays today

Market Snapshot (`MlbGameCenter`, market-implied) → Simulator Output (priced-prop snapshot, the 10k
player-prop layer) → Main Read (central read, one prop lean) → Top leans → collapsed detail (full pick
table, **per-prop** distributions, model-vs-market agreement, unavailable modules, recap) → Advanced
report → Methodology. **No projected final score, no game-total/margin distribution, no simulated win
probability.**

## 3. What a true full-game simulation would require

Projected final score · **simulated** win probability (not market-implied) · total-runs distribution ·
margin distribution · run-line cover probabilities · total over/under probabilities · alternate lines ·
score bands · simulation confidence / data quality · a backtest/settlement path.

## 4. Gap matrix

| Feature | Current source | Artifact-backed? | Public-safe? | Missing data | Next step |
|---|---|---:|---:|---|---|
| Win probability | de-vigged moneyline | ✅ (market-implied) | ✅ as "market-implied" | a real scoring model | keep market-implied label |
| Game total (line + O/U prob) | de-vigged total | ✅ (market-implied) | ✅ | — | keep market-implied |
| Run-line cover prob | de-vigged run line | ✅ (market-implied) | ✅ | — | keep market-implied |
| Projected final score (away/home/margin) | — | ❌ | ❌ | team-scoring model | coming soon |
| Total-runs distribution | — | ❌ | ❌ | scoring model / alt-total ladder | coming soon |
| Margin distribution | — | ❌ | ❌ | scoring model / alt-spread ladder | coming soon |
| Score-pair distribution | — | ❌ | ❌ | joint scoring model | coming soon |
| SIMULATED win probability | — | ❌ | ❌ | Monte-Carlo scoring engine | coming soon |
| Player-prop distributions | 10k sim artifact | ✅ (per-prop) | ✅ as "10,000-run" | — | already shown, honest |
| Team-market settlement (ML/RL/total) | StatsAPI linescore | ✅ | internal only | — | validated 5+ dates (see July-9 doc) |

## 5. Verdict

- **Show today (honest):** market-implied win probability, game total + O/U, run-line cover (all labelled
  "market-implied"); the 10,000-run **player-prop** simulation.
- **Must stay "market-implied":** the team-market win prob / total / run-line — never called a
  simulation.
- **Must stay "coming soon":** projected final score, total/margin/score distributions, and a truly
  **simulated** win probability.
- **Prototyped internally (done this pass):** `data/internal/mlb/full-game-sim-readiness/<date>.json` —
  a per-game readiness record that surfaces exactly the market-implied point estimates + coverage and
  marks the distributions/score BLOCKED. Never web-served, never labelled a simulation.
- **Cannot build without new data:** the distributions + projected score need a dedicated team-scoring
  model (e.g. Poisson/negative-binomial on team run rates with park/pitcher/lineup inputs) or an
  alternate-line ladder ingest. A Poisson-from-the-total-line would *fabricate* the distribution shape
  (real MLB scoring is over-dispersed) — explicitly disallowed.

## 6. Schema + validator

The future artifact shape + a pure structural/honesty validator ship this pass:
`docs/FULL_GAME_SIMULATION_ARTIFACT_SCHEMA.md` + `app/src/lib/full-game-sim/schema.ts`
(`validateFullGameSimArtifact`). The validator refuses any artifact that claims a simulation while its
data quality is blocked, or a public artifact that claims a simulation it can't back.
