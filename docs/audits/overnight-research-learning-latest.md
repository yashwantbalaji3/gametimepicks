# Overnight — Hits/Misses Research, Learning Loop, Honest UI

> Settled-only research + a bounded, evidence-backed learning signal + an honest
> public "what we're learning" note. No paid credits. No settled-slate
> regeneration. No projection/grading-math change to past results — the
> reliability nudge affects FUTURE generation only.

## Deep research (settled data — full table in `hits-misses-research-latest.md`)
**MLB markets:** batter_hits **53.0%** (lo 51%, n=2964) · H+R+RBI 49.6% · pitcher_strikeouts 47.2% · **batter_total_bases 42.9%** (lo 40%, n=1224 — weak).
**NBA markets:** **REB 55.6%** (lo 52%) · **PTS 53.7%** (lo 51%) · **AST 44.5%** (lo 41% — weak).
**Odds bands (MLB, settled):** heavy_fav **67.5%** (n=770) → favorite 55.8% → mild 50.1% → near-even 44.0% → plus_money **41.5%** → high_plus **34.2%**. Monotonic — favorites win, plus-money is a variance play.
**Recent form (MLB L5):** 5/5 **59.4%** (lo 55%) → 4/5 51.9% → 3/5 50.5% → ≤2/5 ≈ 44–46%. Monotonic — validates the L5 gate.
**Cards:** 774 decided, 109 won (14.1%); **45.3% of losing cards lost by exactly one leg** → exposure caps justified. Top single-leg killers: batter_hits, PTS, total_bases, AST.

### What this confirms vs. changes
The June-revamp design is **evidence-aligned**: Low = negative-odds favorites (55–67% hit), plus-money rightly confined to High/Longshot (34–42%), L5 gate is real (5/5 = 59%). The one new, robust signal: **weak markets** (MLB total_bases, NBA AST) underperform even among favorites → gently de-emphasize them.

## Learning loop implemented
- **`market-reliability.json` artifact** (settled-only, shrunk to a 0.5 prior k=60, sample floor 100, Wilson-floored) — a transparent reliability score per sport+market, plus UI-ready insights (strongest/weakest markets, odds-band rates).
- **Bounded reliability nudge** in `parlay_optimizer._sgp_leg_quality`: `+12 · clamp(shrunkHitRate − 0.5, ±0.10)` for the leg's market. A TIEBREAKER only — it never overrides a stronger projection (tested), and is a **no-op if the artifact is missing**. Reliable markets (hits, REB, PTS) get a small boost; weak ones (total_bases, AST) a small penalty. Applies to future slates (June 7+); settled slates untouched.
- Tests: 4 new (`MarketReliabilityNudgeTests`) — delta sign/clamp, unknown-market zero, reliable>weak at equal edge, edge-not-overridden.

## Honest UI
- **`ModelNotesPanel`** on Results ("What the model is learning"): data-driven from the artifact — "Working" (markets clearing 50%), "Improving" (weak markets, de-emphasized in conservative cards), the heavy-fav vs plus-money odds insight, and an explicit "we track every settled pick — including losing days — and weight markets from results, not hype." No profit/guarantee claims.

## Validation (all green)
- app **718/718**, tsc clean, build ✓; pipeline **117** + mlb_model_test ✓ (incl. reliability tests)
- June-6 audits: low-risk (15 legs, 0 violations), leakage 0, coverage, risk-section (5/5/3/2), leg-modal (225/225), parlay-exposure, bank-builder — all PASS; results-projection-accuracy PASS (NBA 51.7%, MLB 49.8%, overall 50.3%)
- browser QA: Results leads with projection accuracy + learning panel; Home June 6 settled + Bank Builder; Parlay Lab 4 sections + SETTLED banner; **0 console errors; 0 overflow at 375px**

## Preserved / honesty
Projection-accuracy lead, MLB-below-50 neutral, parlay metrics labeled higher-variance, two-record UX, Bank Builder, leg modal metadata, date-state honesty, MLB-only/NBA-empty, no padding, no banned/V2 copy. **No losses hidden** — the down June-6 day and the weak markets are shown.

## Limitations / next
- Reliability sample is ~9–15 settled dates; shrinkage + floor mitigate overfit, but it will firm up with more data.
- Odds-band reliability is computed but not yet wired into scoring (markets-only nudge for now) — a sensible follow-up given the strong monotonic signal.
- June 7 not generated at overnight time; checker `3d04f6c0` watches the cron and will validate the flip (it will be the first slate to use the reliability nudge).

*Free settled-data research + bounded learning signal + honest UI. No paid API.*
