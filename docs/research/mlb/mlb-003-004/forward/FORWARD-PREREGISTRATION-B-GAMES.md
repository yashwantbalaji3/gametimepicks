# MLB-002 / MLB-005 · forward test B-GAMES: the coherent engine as a game model (preregistration)

**Registered:** 2026-10-10, before the first pitch of any game in its window. The commit of this file and `grade-forward-b-games.mjs` is the registration.

**No new model code:** the forecasts are the `game` rows that forward test B's **frozen** code already writes (`run-forward-b.mjs`, `df30f710a2`): `engineSub.pHome` and `engineSub.totalRuns`. They come from pregame captures only, are written once per date, and use B's window rule.

## Why

Exploratory, on 2026 (examined repeatedly; `docs/research/mlb/mlb-005/coherence-v1/compare-games-2026.json`):
- The coherent engine with v2 inputs scored winner log loss 0.6816, against **0.6995 for the published game model** and 0.6684 for the market.
- It beat the published model (−0.018 [−0.033, −0.003]); on the verified-served subset the interval includes 0.
- It is still worse than the market.

That is a hypothesis, not evidence. This test is the evidence.

## Window and sample

- **Window:** games whose actual first pitch is after this registration commit.
- **Primary sample:** **regular-season** games only, **n ≥ 300**, which means 2027.
- **Postseason** games are reported separately and never count toward n.
- **One look**, when n is reached or at the end of the 2027 regular season. Short of n, it is reported as "not enough data".

## Comparison

**Published model:** the game prediction **of record** from `game-predictions-graded.jsonl` (moneyline; P(home) from the pick and its probability).

**Market:** that row's `marketImpliedProbability`, on the same side.

**Outcome:** the official final (opposing pitchers' runs, cross-checked with the graded row's `actual`).

**Primary:** winner log loss, engineSub minus the published model of record. Bootstrap resampling dates (4,000 draws).
- Pass: 95% upper end < 0 **and** calibration slope in [0.7, 1.3].

**Always reported, never used to pass:**
- engineSub minus market;
- the published model minus market;
- the total-runs log score and CRPS of the engine against the actual total;
- over/under log loss at the graded total line, engine against the published `total` row of record.

**Claims:**
- A pass is a claim against the published model only.
- A market claim needs its own interval below 0.
- **No betting-value claim.**
- No promotion without a founder decision.
