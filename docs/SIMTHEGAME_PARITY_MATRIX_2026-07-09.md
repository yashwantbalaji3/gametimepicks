# SimTheGame / FreeSim Parity Matrix + Full-Market Artifact Audit (2026-07-09)

Covers mission **Phase 4** (competitor methodology → parity matrix) and **Phase 5**
(full-market MLB artifact audit). Architecture/product inspiration only — no UI,
asset, or copy is taken from the competitor. Money untouched (`affe6b21…`, 19-14).

## 1. Competitor flow (SimTheGame)

`account → select sport → select game → run simulation → dashboard`. Free tier =
**one 10,000-run simulation/day**; Pro removes the cap + adds live-odds refresh.

## 2. Their methodology (the important part)

**Market-implied, not a projection model.** They pull DraftKings odds via The Odds
API (40–90 markets/game: mainline · period · props · specialty), then:

1. **De-vig** every priced line → the book's no-vig implied probability.
2. **Distributions from priced ladders** — each priced Over/Under threshold is a
   point on a discrete distribution. *"No fitted normal curve, no Poisson."*
3. **Outside-in game scripts** — draw team scores first, then period splits, then
   each priced player, then specialty; every layer reconciles (period splits sum
   to the score; player stats sum to the team total; "HRs can't exceed hits").
4. **10,000 runs** for stable tails (they show a 10 → 1,000 → 10,000 convergence
   chart; 1,000 is *"rough; extreme cases under-sampled"*).

**Positioning:** *"a transparency layer over the betting market … does not predict
games or generate picks."* Tags **SUPPORTED / NEUTRAL / OPPOSED** are *"a
transparency signal, not advice."* (We already use this exact vocabulary.)

## 3. Module-by-module parity (MLB)

| Competitor module | What it shows | GTP status | Blocking gap |
|---|---|---|---|
| Score Center (median score + 80% range) | team runs distribution | ❌ artifact missing | no team-run sim |
| Win / Upset probability (moneyline) | ML win % | ❌ artifact missing | no `h2h` odds ingested |
| Most Stretched Market | biggest sim-vs-book gap across ML/RL/total | ⚠️ props-only today | no team markets to compare |
| Game total | total runs distribution | ❌ artifact missing | no `totals` odds ingested |
| Run line / spread | margin / cover % | ❌ artifact missing | no `spreads` odds ingested |
| Team totals | per-team runs | ❌ artifact missing | no `team_totals` odds ingested |
| Period / inning markets (F1/F3/F5) | inning totals | ❌ artifact missing | not ingested |
| Average Box Score (per-team, priced players) | mean stat line + 80% range | ⚠️ partial | we have per-player props, not a reconciled team box score |
| Pitcher Report (outs, ER, K, BB, H) | starter/bullpen lines | ⚠️ partial | we simulate `pitcher_strikeouts` only |
| **Player props (proj + edge + hit%)** | prop table | ✅ **supported (our core)** | — |
| **Prop distributions (bins)** | per-prop histogram | ✅ **supported** | `distributions.<market>__<id>__<line>` |
| **Biggest model leans (by edge)** | top edges | ✅ supported | `generatedPicks` sorted by `edgePct` |
| **Market agreement / calibration** | sim vs market | ✅ **supported + deeper** | by-edge calibration ledger |
| Market Fit / calibration log | per-anchor gap | ✅ supported | `/results/model-audit` |
| Simulation Audit (raw paths + seed) | reproducibility | ⚠️ partial | we ship `artifactHash` + deterministic gen, not raw paths |
| **Model-performance ledger (settled hit rate)** | did the model hit? | ✅ **GTP-ONLY** | SimTheGame has none — this is our moat |

**Signal, not noise:** GTP is a **player-prop projection simulator with a
money-independent settled-results ledger**; SimTheGame is a **market-implied
full-game distribution engine with no results ledger**. Our win is fuller
model-performance transparency + a projection model, not copying their team markets.

## 4. Full-market MLB artifact audit (Phase 5)

| Market/module | Supported? | Current source | Missing data | Implement now? |
|---|---|---|---|---|
| moneyline / win prob | ❌ | — | Odds API `h2h` (not ingested) | no — ingest+derive first |
| projected score / range | ❌ | — | team-run distribution model | no — generator first |
| run line / spread | ❌ | — | Odds API `spreads` | no — ingest+derive first |
| game total | ❌ | — | Odds API `totals` | no — ingest+derive first |
| team totals | ❌ | — | Odds API `team_totals` | no — ingest+derive first |
| inning markets (F1/F3/F5) | ❌ | — | period totals (not ingested) | no |
| player props | ✅ | board leans + de-vig | — | yes (live) |
| player-prop distributions | ✅ | `distributions.*` bins | — | yes (live) |
| box-score summary | ⚠️ | per-player props | team reconciliation | partial |
| market snapshot | ✅ | `marketSnapshot.lines` (DK, de-vigged) | props-only | yes (props) |
| biggest model gaps | ✅ | `generatedPicks.edgePct` | — | yes |
| model agreement | ✅ | edge + calibration | — | yes |
| model-performance overlay | ✅ | `/mlb/results` ledger | — | yes |
| by-edge calibration | ✅ | `buildMlbAudit` | — | yes |

### Key question — *"Can we generate true full-game MLB predictions for July 9 with existing data?"*

**No — artifact schema + generator + team-odds ingestion are required first.** Today
the MLB pipeline ingests only **8 player-prop markets** (`batter_home_runs, batter_hits,
batter_total_bases, batter_rbis, batter_runs_scored, pitcher_strikeouts, pitcher_outs,
pitcher_earned_runs`). The board carries **no** team-level market fields; the sim
artifact's `distributions` and `generatedPicks` are player-prop-only; `simulationSummary`
is a headline. The artifact **already declares** scoreline/first-scorer/xg/corners/cards
as `not_supported_for_sport`. Nothing fabricates a team market — and nothing should.

## 5. Implementation priority (the path to parity, without faking anything)

1. **Ingest team markets (small, cheap):** add `h2h,totals,spreads,team_totals` to
   `MLB_INGEST_MARKET_KEYS` in `ingest-mlb-slate.mjs`. The Odds API supports these for
   MLB; we already de-vig. → unlocks a **real** market snapshot for team markets.
2. **Market-implied team distributions (generator):** in the sim generator, de-vig the
   `totals` ladder → total-runs distribution; `h2h` → win prob; `spreads` → margin /
   cover %; `team_totals` → per-team runs. Persist under `distributions.total`,
   `simulationSummary.winProb`, etc. This is SimTheGame's "distribution from priced
   ladders" approach and needs **no new model** — just de-vig + bin the ladders.
3. **Dashboard Game Center:** render §2 modules only when those artifact fields exist;
   otherwise the existing honest `unavailableModules` placeholder. (Phase 7.)
4. **Run-count:** evaluate 1,000 → 10,000 (Phase 6) to match their stability claim —
   only if the artifact truly says `runCount: 10000`.
5. **Keep the moat:** the settled model-performance ledger + by-edge calibration is
   ours alone — lead the dashboard with it.

**Guardrail:** every full-game module stays behind an artifact-field check
(`unavailableModules`) until steps 1–2 ship. No moneyline/score/total/team-total is
ever rendered from an absent field. Steps 1–2 are a deliberate daylight change (new
generator code + tests + a re-costed ingest), not an overnight edit.
