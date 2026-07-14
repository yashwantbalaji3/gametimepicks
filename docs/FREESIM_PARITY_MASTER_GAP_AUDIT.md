# FreeSim-Parity — Master Gap Audit (2026-07-14)

Where GameTime Picks stands against a mature public simulation product (SimTheGame / FreeSim class), and the
honest path to close the gap **without faking capability**. Money untouched (portfolio md5 `affe6b21`).

## The standard we're measuring against
A mature sim product lets a user pick a game, press one button, watch a run, and land on a **result screen** that
reads as a simulation outcome: a probability center (who wins / most-likely result), a handful of market
snapshots, the strongest edges, and an honest "no strong edge" state — with per-market availability made
explicit. It never presents a market it can't actually produce or settle.

## Gap table

| Capability | SimTheGame-class standard | GTP today | Gap / honest status |
|---|---|---|---|
| **One-button run → result screen** | Yes, both sports | Yes — WC + MLB runners land on a `SimulationResultSummary` above the fold | **CLOSED** (this upgrade) |
| **WC win/draw/win probability center** | Independent model | **Market-implied** de-vigged 90' prices (real) | **CLOSED, honestly labelled** — market-implied, not an independent soccer model |
| **WC total / BTTS / DC / DNB snapshots** | Yes | Yes — real de-vigged prices | **CLOSED** |
| **WC player props on the report** | Yes | 24 real provider props per fixture (goalscorer / shots / SOT / assists) | **CLOSED for display**; live settlement blocked (free API-Football plan, no 2026 stats) |
| **MLB strongest-lean result** | Independent player-prop sim | Real **10,000-run** player-prop sim | **CLOSED** |
| **MLB full-game score / total-runs / margin / win-prob** | Independent game sim | **Not generated** — artifact is player-prop only | **OPEN** — needs a dedicated full-game model. Internal market-anchored prototype only (never web-served). See `MLB_FULL_GAME_MONTE_CARLO_PROTOTYPE.md` |
| **Independent soccer model (xG / shots / corners / cards / correct score)** | Some products | **None** | **OPEN by design** — we do NOT fake it. Market-implied only until a real provider + model exist |
| **No-play / efficient-market state** | Rare | Explicit — "no strong edge = the market is efficient, a valid no-play, not a broken sim" | **AHEAD** |
| **Per-market availability honesty** | Often opaque | `market-coverage.ts` registry + `/simulate` matrix | **AHEAD** |
| **Bracket / tournament impact** | Sometimes | WC semifinal `BracketImpactCard` (advances-to-final / third-place), TBD until both semis played | **CLOSED for semis** |

## The three honest truths this audit protects
1. **WC is a market-implied read, not an independent soccer simulation.** No xG, no projected scoreline, no
   corners/cards/correct-score, no fabricated 10k soccer runs. 90' regulation only.
2. **MLB's public sim is player-prop only.** No web-served full-game score / total-runs / margin distribution.
   The full-game work lives in an internal prototype that is never served and never called "independent".
3. **A small/zero edge is a feature.** A market-implied read landing on "no strong edge" is the market being
   efficient — surfaced as a valid no-play, never dressed up as a pick.

## What this upgrade shipped (parity moves that were real)
- `WorldCupSimulationResultSummary` — above-the-fold probability center on the WC report.
- `MlbSimulationResultSummary` — above-the-fold strongest-lean result on the MLB report (prior slice).
- Both framed as **Simulation result**, both honestly labelled market-implied / player-prop.

## What remains OPEN (and must stay honest until real)
- MLB full-game distributions → internal prototype → validate → *then* consider surfacing. Not before.
- WC live prop settlement → paid API-Football plan (2026 season access).
- Independent soccer model → real data provider + validated model, or it stays market-implied forever.
