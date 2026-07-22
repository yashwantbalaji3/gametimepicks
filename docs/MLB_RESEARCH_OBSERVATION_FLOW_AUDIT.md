# MLB Research Observation Flow — Audit (why observations are 0)

**Verdict: not a bug, not a gate, not missing outcomes. A coverage/timing mismatch.** No date yet has *both* final games *and* captured pregame market leans. The pipeline is correctly wired and will produce the first observations automatically when the first market-covered date finalizes. **No fix that lowers eligibility, bypasses a gate, or fabricates a sample is warranted or permitted.**

Money-independent audit. Portfolio md5 `affe6b21071f2b3be96bb2774eb347c3` untouched.

---

## The chain (input → transformation → output)

```
Final MLB game (official StatsAPI box score)
   │  join-mlb-pregame-settlements.mjs  (--lookback 3, free, idempotent)
   ▼
settlement-joins/<date>/<gamePk>.json   { gameFinalStatus.isFinal, teamOutcome, marketRows[], contextualRows[], counts }
   │    marketRows come from pregame MARKET snapshots (paid capture) joined to the official outcome →
   │    each row gets settlementStatus ∈ win|loss|push|pending|push|unavailable|…
   ▼
build-mlb-research-observations.mjs  (--lookback 3)
   │    emits ONE observation per row where settlementStatus ∈ {win, loss, push}  (line 145; pending NEVER emits)
   ▼
research-observations/<date>.jsonl    ← currently ABSENT (0 rows, all dates)
```

## Current counts (the evidence)

| date | games | final | marketRows | settledEligible | pending | market-snapshots |
|---|---|---|---|---|---|---|
| 2026-07-21 | 15 | **13** | **0** | 0 | 0 | **0** |
| 2026-07-22 | 17 | **0** | **1716** | 0 | 1716 | 14 |

- **07-21 is final (13 games) but has 0 marketRows** — the paid pregame market capture (`PREGAME_ARCHIVE_MARKETS`) was enabled at 2026-07-21 22:33 UTC, *after* that day's games had started. So 07-21 has contextual features + official outcomes but no pregame market leans to settle → **cannot** produce observations (retroactively fabricating market lines is forbidden).
- **07-22 has full market coverage (1716 rows, 14 snapshots) but 0 final games** (live StatsAPI: 5 In Progress, 7 Scheduled, 2 Warmup, 3 Pre-Game). Every row is `pending`; the assembler correctly refuses to settle a non-final game.

**Result:** 0 rows are simultaneously (final) and (market-covered) → 0 observations. This is the honest, expected state of an accumulation phase that just turned market capture on.

## Answers to the audit questions

1. **Are finalized games producing settlement artifacts?** Yes — 07-21 has 13 final games, all joined (`joinStatus: joined`, official box scores attached).
2. **Are carried-forward market leans matching settlement keys?** Yes where they exist (07-22: 1716 marketRows joined). No for 07-21 (0 market snapshots that day).
3. **Are outcomes missing?** No — `teamOutcome` + `gameFinalStatus` are present on final games.
4. **Are observations intentionally blocked by a date gate?** No. The only filter is `settlementStatus ∈ {win,loss,push}` — a *correctness* rule, not a bypass-able gate. Pending is never an observation, by design.
5. **Bug or insufficient data?** **Insufficient overlapping data.** The mechanism is correct; it needs one date with final games AND pregame market coverage.

## Blocker & fix required

**Blocker:** the first date with market coverage (2026-07-22) has not finalized; the last final date (2026-07-21) predates market coverage.

**Fix required: none in code.** The activation levers are already in place:
- `PREGAME_ARCHIVE_MARKETS = true`, `PREGAME_ARCHIVE_PLAYER_PROPS = true`, `PREGAME_ARCHIVE_COMMIT = true` (persistent repo vars) → every date from 07-22 onward gets pregame market coverage.
- `join-mlb-pregame-settlements.mjs --lookback 3` + `build-mlb-research-observations.mjs --lookback 3` run on the `mlb-pregame-capture` cron → they re-grade a recently-pending date once its games are final and emit observations. **This is already automated.**

**Therefore:** when 2026-07-22 finalizes, the next `mlb-pregame-capture` run will settle its 1716 marketRows and write the **first** `research-observations/2026-07-22.jsonl`. Expected first-observation markets (from the 07-22 join `marketRows`): `h2h`, `spreads`, `totals` (team) + the captured player-prop families. No intervention required beyond letting the slate finalize.

**Only remaining risk:** a day where market capture silently fails (credits/key) would leave that date coverage-less like 07-21. The daily research health report (`research-progress.json` + the daily health block) surfaces this so a gap is visible immediately.

## Settlement automation (Phase 3) — decision

- **Research settlement is already automated** and needs no new workflow: `mlb-pregame-capture.yml` runs `join-mlb-pregame-settlements --lookback 3` and `build-mlb-research-observations --lookback 3` on its cron, re-grading recently-final dates and emitting observations. This is the path that produces the warehouse's observations.
- **`build-mlb-product-settlement.mjs` and `settle-paper-product-cards.mjs` are intentionally NOT wired into any workflow.** They are money-adjacent (they read `settled_leans.jsonl` / product cards and drive the paper-product record). Per the mission's guardrail — *do not change official settlement logic* — they stay **manual and founder-controlled**. No `mlb-settlement-production.yml` is created; automating money settlement is out of scope and unsafe here. (The public MLB *slate* completion is already automated separately via `mlb-daily-production.yml`, which is money-independent.)

## Storage integrity (Phase 7) — verified

The warehouse is append-only and immutable, so the dataset stays clean:
- **Stable IDs:** `observationId = sha(gamePk | playerId/selection | market | selection | line)` — deterministic, dedupes re-runs.
- **Immutable records:** every capture carries a `recordHash`; freezes carry `freezeHash`; joins carry `contentHash`. Content is content-addressed, not overwritten in place.
- **Append-only / idempotent:** captures skip an existing `<key>.json` unless `--force`; settlement join + observation build are idempotent over the `--lookback` window. Re-running a day never double-counts.
- **No `ResearchObservationV2` needed yet.** The current schema (`SCHEMA_VERSION` per family + per-observation `pregame_features` + `model_inputs_available` coverage) is sufficient for the first 500 observations. Revisit a v2 only if a real modeling need appears after the gate — documented, not built.
