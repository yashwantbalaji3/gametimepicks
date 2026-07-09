# Full-Game Simulation Artifact — Schema Design

The shape a **future** true MLB full-game simulation would take, with a pure structural + honesty
validator. Implemented as `app/src/lib/full-game-sim/schema.ts` (`FullGameSimulationArtifact` +
`validateFullGameSimArtifact`). The validator checks structure only — it never generates a value.

Today no artifact reaches `dataQuality.status === "ready"`; the internal readiness artifact is
`"partial"` (market-implied) — see the gap audit.

---

## Type (abridged)

```ts
type WinProbSource = "simulation" | "market_implied" | "hybrid_shadow";
type FullGameSimStatus = "ready" | "partial" | "blocked";

type FullGameSimulationArtifact = {
  schemaVersion: string; sport: "MLB"; gameId: string; gamePk?: number; date: string; asOf?: string;
  runCount?: number;                 // present ONLY when a sampled simulation ran
  public: boolean;
  source: { marketSnapshot?; modelInputs?; linescoreSettlement?; playerPropSimulation?; teamMarketLines? };
  teams: { away: {name,…}; home: {name,…} };
  projectedScore?: { awayMean?; homeMean?; totalMean?; marginMean?; source? };   // omitted, not faked
  winProbability?: { away; home; source: WinProbSource };
  distributions?: { totalRuns?; margin?; awayRuns?; homeRuns?; scorePairs? };     // each sums to ~1
  marketCoverage?: { moneyline?; runLine?; total?; teamTotals? };
  topLeans?: unknown[];
  dataQuality: { status: FullGameSimStatus; reasons: string[]; missing: string[] };
  guardrails: { publicFormulaChanged: false; officialMoneyRecordAffected: false; activeProductCard: false };
};
```

## Validator rules (structure + honesty)

Structure:
- `schemaVersion` non-empty; `sport === "MLB"`; `gameId`, `date` non-empty; `public` boolean; both team
  names present.
- `dataQuality.status ∈ {ready, partial, blocked}`; `reasons` / `missing` are arrays.
- `guardrails.{publicFormulaChanged, officialMoneyRecordAffected, activeProductCard}` all **=== false**.
- `runCount`, when present, is a **positive integer**.
- `winProbability.away/home ∈ [0,1]` and **sum to ~1.0** (±0.02); `source` is a valid label.
- every present `distributions.*` array has probabilities in `[0,1]` that **sum to ~1.0** (±0.02).

Honesty (the point of the validator):
- a `winProbability.source === "simulation"` while `dataQuality.status === "blocked"` → **error**.
- a simulation source with **no** `runCount` → **error** (can't claim a sim that didn't run).
- a **public** artifact that claims simulation while blocked → **error**.
- a blocked artifact carrying populated distributions → **warning** (confirm not fabricated).

## Fields omitted honestly today

The readiness artifact omits `projectedScore.{awayMean,homeMean,marginMean}`, all `distributions`, and
any `winProbability.source === "simulation"` — because no team-scoring model backs them. It carries only
`winProbability` / `marketCoverage` labelled `"market_implied"` and `dataQuality.status === "partial"`.

## Path to `ready`

To reach a real `ready` full-game simulation: build a team-scoring engine (Monte-Carlo over team run
rates with park / pitcher / lineup / bullpen inputs, calibrated against settled linescores), emit
`runCount` + `winProbability.source === "simulation"` + the distributions, and gate a public rollout on
a backtest (as with the shadow-calibration go/no-go).
