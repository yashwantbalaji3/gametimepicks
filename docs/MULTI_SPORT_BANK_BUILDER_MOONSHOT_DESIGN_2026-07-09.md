# Multi-Sport Bank Builder / Moonshot Design (2026-07-09)

**How Bank Builder and Moonshot should work once the shared candidate pool is trusted — plus a
read-only preview that surfaces what they WOULD show today, always as no-play / watchlist. No exposure,
no activation, no money change.**

Depends on: `docs/MULTI_SPORT_PRODUCT_ENGINE_AUDIT_2026-07-09.md` (engine map + the settlement blocker)
and `docs/SHADOW_CALIBRATION_BACKTEST_PLAN_2026-07-09.md` (reliability signal, founder-gated).

---

## Inputs

Both products consume the shared, settlement-gated candidate pool
(`data/internal/multi-sport/candidate-pool/<date>.json`, `CandidateLeg` schema). A leg may enter a
MONEY product only when `productEligible === true` — i.e. its market has settlement wired AND data is
adequate. Today that is soccer's five core team markets (moneyline_90, double_chance, draw_no_bet,
match_total_goals, btts). MLB, soccer Asian handicap, and soccer team totals are **analysis/watchlist
only** until their settlement is wired.

## Bank Builder — future rules

Priorities: low variance · strong artifact support · settlement-ready · low leg-correlation ·
conservative probabilities · **no forced picks** · founder approval before activation.

Selection (proposed):
1. Filter to `productEligible` legs.
2. Prefer conservative markets: match result on a clear favorite, double chance, draw-no-bet, and — when
   the model is trustworthy — MLB moneyline/run line/total **once MLB settlement + calibrated reliability
   support it**.
3. Require `marketProbability ≥ 0.60` (or `calibratedProbability` once wired) for a survival leg.
4. Two legs from **distinct games**, correlation in `(−0.2, 0.5)` (reuse the existing check).
5. Sport-agnostic survival floor (replace the hardcoded soccer/other split). Lanes may be single-sport
   or mixed — whichever yields the lowest-variance qualifying pair.
6. If fewer than two qualifying distinct-game legs exist → **no-play** (valid output).

Conservative player props (e.g. MLB batter_hits, historically ~53.8%) are eligible **only** once MLB
settlement is wired AND the shadow calibration clears its backtest — never on raw edge (which is
anti-calibrated at the high end).

## Moonshot / Longshot — future rules

Priorities: higher payout · controlled longshot logic · limited legs · cross-sport if correlation is
low · clear reason codes · **no fake EV** · founder approval before activation.

Selection (proposed):
1. Filter to `productEligible` legs.
2. Build a small independent-game combo (2–4 legs, distinct games) whose combined price ≥ the Moonshot
   floor (+700).
3. Cross-sport allowed when legs are from different games (correlation ≈ 0); parameterize the current
   `sportScope: "world_cup"` to `"mixed"`.
4. Never fabricate EV — combined probability is the product of de-vigged (or calibrated) leg
   probabilities; report it honestly.
5. If no qualifying combo reaches the floor → **no-play**.

## Exposure & activation invariants (unchanged)

Every guard from the engine audit stays: exposure is placed-only; md5 money guard; card locks;
idempotent all-or-nothing settlement; pre-event `ACTIVATION_CUTOFF_MIN = 30`; official record separate
from model ledgers. The preview below creates **none** of this — it never writes a card or exposure.

## Read-only product preview (shipped)

`app/scripts/build-multi-sport-product-preview.mjs` → `data/internal/multi-sport/product-preview/<date>.json`:

```json
{ "bankBuilderPreview": { "status": "no-play" | "watchlist", ... },
  "moonshotPreview":     { "status": "no-play" | "watchlist", ... } }
```

It applies the conservative rules above to the eligible candidate pool and reports what each product
*would* surface — always `no-play` or `watchlist`, **never** an active card, never exposure. Status
`watchlist` means "a qualifying set exists for review", not "placed".

## Rollout order (all founder-gated)

1. Wire MLB product-card settlement (`mlb-markets.ts` from statsapi) → MLB legs become `productEligible`.
2. Pass the shadow-calibration backtest → `calibratedProbability` becomes the selection quality signal.
3. Make the Bank Builder preference pluggable + allow Moonshot `mixed` scope (behind tests + approval).
4. Only then consider activating a real multi-sport card — with the usual approval + money guards.
