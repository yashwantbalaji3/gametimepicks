# MLB Team-Scoring Monte Carlo — Input Audit (2026-07-09)

**Verdict: we can build a minimally honest MARKET-ANCHORED simulation now — but NOT an independent
predictive model.** Only market lines are committed; every genuine team-scoring input (pitcher, lineup,
bullpen, park, weather) is missing. So v1 re-expresses the market as sampled distributions; it does not
predict beyond the market.

Money md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $0 exposure — unchanged (audit + internal engine).

---

## Input classification

| Input | Availability | Usable for |
|---|---|---|
| schedule + gamePk mapping | `available_committed` (board leans) + `available_fetchable_free` (StatsAPI) | pregame + postgame |
| final scores / linescores | `available_fetchable_free` (StatsAPI schedule) | postgame validation / backtest |
| moneyline / total / run line + market probs | `available_committed` — **`team-markets/2026-07-09.json` only** (via `getMlbGameCenter`) | pregame simulation anchor |
| starting pitchers | `missing` (not committed; would need a StatsAPI probable-pitchers fetch) | — |
| team offensive strength | `missing` | — |
| pitcher strength | `missing` | — |
| bullpen strength | `missing` | — |
| park factor | `missing` | — |
| home/away split | `not_needed_yet` (small; can add later, data-backed) | — |
| lineup availability | `missing` | — |
| weather | `missing` | — |
| recent form (team scoring) | `missing` (board `recentGames` is per-player-prop, not team runs) | — |
| historical scores/totals | `available_fetchable_free` (StatsAPI) | backtest only |

## Verdict

- **Can we build a minimally honest model now?** Yes — a **market-anchored** Monte Carlo from the
  committed total / moneyline / run line. It samples run distributions but its point estimates (win
  prob, total) come from the market.
- **What inputs are missing?** All independent scoring inputs (pitcher / lineup / bullpen / park /
  weather / team strength). Without them there is no predictive edge over the market.
- **First-version assumptions:** a negative-binomial team-run count model with a fixed variance-to-mean
  ratio; the market total as the expected total; the win margin anchored to the market moneyline
  (closed form). Independence between the two teams' runs.
- **Assumptions too dangerous for public use:** calling this a "simulation" that predicts outcomes —
  it does not; it re-expresses the market. Any public rollout would overclaim. Hence internal-only +
  `hybrid_shadow` / `market_anchored_simulation` labels, and a `public_rollout: BLOCKED` readiness level.

**Backtest data constraint:** only 2026-07-09 has committed team-market lines, so the backtest can only
grade that date's final games (tiny sample). See the backtest report.
