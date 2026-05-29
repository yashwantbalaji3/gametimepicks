# Parlay methodology — by sport and market

Last updated: 2026-05-26 (PR #115).

This doc captures how the GameTime Picks optimizer ranks legs,
builds slips, and what stays out of official suggestions until
the audit data justifies inclusion.

The hard rules from `docs/MODEL_LEARNING_LOOP.md` still govern:
no fabricated projections, no fake hit-rate claims, public
tracking of every official slip, decisive-only denominator.

---

## 1. Why current safe filters produce few slips

Empirically (5/25 audit + 5/26 generation):

1. **PR #110 safety filters were intentionally tight.** Max legs
   dropped from 5 → 4. Star Power same-game NBA cap dropped from
   2 → 1. AST override now requires `recent10Count >= 7`. Edge
   clip narrowed from 20pp → 15pp.
2. **The optimizer rejects entire leagues some days.** On 5/26 no
   MLB props were posted yet → 0 MLB legs in the pool.
3. **Conservative requires star-led legs already** (`require_recent10=True`,
   `max_legs_per_game=1`). The eligibility set is thin by design.
4. **Mixed slips have a 0.50 display penalty** (PR #110 filter D).
   Mixed gets pushed off the top of the safer lanes.

PR #115 does NOT lower these standards. Instead it:
- adds a DNP guard so legs without recent box-score presence
  cannot enter official lanes at all
- raises the *display* cap from 2 → up to 5 visible per lane so
  when the pool supports more we show more, with strict
  diversity rotation
- documents the prop-market expansion plan for a future PR
- gives the user a Custom Parlay Generator that builds slips
  from the existing leg pool using the same scoring rules

## 2. NBA methodology

Inputs the optimizer already weighs per leg:
- `projection edge` (clipped at 15pp post-PR #110)
- `confidence tier` (High / Medium / Low)
- `recent10Count` (the actual count of stored recent values)
- `recentSeries` numeric values (used in volatility-aware
  weighting)
- `starTier` (none / regular / core / superstar)
- `market` (PTS / REB / AST today; expansion list in
  `docs/PROP_MARKET_EXPANSION.md`)

Inputs we want the optimizer to add (next pipeline PR):
- recent-form trend (rolling mean of last 5 vs last 10)
- explicit blowout/spread risk
- opponent pace if available

### NBA same-game correlation

Acceptable today:
- Star scorer points-over + teammate assist-over **only** when
  recent10 supports both — Star Power cap is 1 leg per game, so
  this is gated by the cap.
- Rebound under + opponent rebound over only if the same game
  isn't already represented.

Risky (penalized today):
- Multiple teammates over points → `max_legs_per_team` enforces
  this (Conservative=1, Balanced=2, Star Power=1, Aggressive=3).
- AST overs in blowouts → no spread feed wired yet; PR #110 AST
  override requires `recent10Count >= 7` as a partial mitigation.
- Too many legs from one game → `max_legs_per_game` enforces
  this (Conservative=1, Balanced=2, Star Power=1, Aggressive=3).

## 3. MLB methodology

Inputs the optimizer already weighs per leg:
- `projection edge`
- `confidence tier`
- `recentSeries` (last-10 outcome vector)
- `isVolatileMlb` flag (currently applied to pitcher strikeouts)
- `bookmaker` (used for ranking books, not for slip selection)

Inputs we want to add (next pipeline PR):
- lineup / starting status (today we infer from `recentSeries`
  length only — DNP guard added in PR #115 closes the biggest
  gap)
- opposing pitcher handedness
- ballpark factors
- weather

### MLB same-game / same-team logic

Acceptable today:
- 2 hitter overs from the same team **only** in Balanced or
  Longshot lanes. Conservative `max_legs_per_team=1` blocks
  Conservative from stacking.
- Hits Over 0.5 has been the safest single-leg foundation
  historically (5/25 audit: 61.7% on 79 decisive legs). Most
  Conservative MLB legs land here.

Penalized today:
- 3+ same-team hitter legs in safer lanes → `max_legs_per_team`
  enforces this.
- Pitcher strikeouts in safe lanes → `isVolatileMlb` flag
  excludes them from Conservative/Balanced; they only appear in
  Aggressive/Longshot.

## 4. DNP guard (PR #115)

**Hard rule for official lanes:** a leg is excluded from any
official lane if its recent activity signal is too thin.

| Sport | Field | Threshold |
|-------|-------|-----------|
| NBA   | `recent10Count` | `>= 7` |
| MLB   | `len(recentSeries)` | `>= 5` |

When excluded, the leg is annotated with
`availabilityStatus="risk"` and `availabilityReason` (e.g.
`"insufficient recent10"` / `"recent series short"`). The
Custom Parlay Generator still surfaces these legs with a
warning chip; official lanes skip them entirely.

Rationale: the 5/25 audit had 10 pending slips, ALL of them
blocked by a single DNP'd player (Soto×4, Ruiz×3, Schroder×3,
Bauers×1). The guard catches the same shape at slip-build time.

## 5. Per-lane slip counts (target vs hard cap)

User request: **at least 5 suggested parlays per risk level per
sport when data supports it**.

Implementation:
- **Display layer** caps visible-per-lane at 5 (was 2). The
  display selector keeps the strongest cross-player diversity
  rotation in place — top 5 visible are NOT just the top-5 raw
  scores when those 5 share the same anchor player.
- **Optimizer side** is unchanged. We don't generate junk legs
  to hit the target — if the safe pool is small the lane shows
  fewer slips with an honest "current filters found fewer than
  N safe builds" note.

Target counts (when data supports them):

| Lane | NBA target | MLB target |
|------|-----------|-----------|
| Conservative | 5 | 5 |
| Balanced | 5 | 5 |
| Star Power | 5 | 5 |
| Longshot (collapsed) | up to 5 | up to 5 |
| Mixed (own tab) | up to 5 | n/a |
| HR Longshot | n/a | up to 3 (deferred — needs HR market) |

## 6. Diversity / repeat control

The display selector (`selectDiverseForDisplay` in
`app/src/lib/parlay-suggested.ts`) already penalizes a player
repeating across visible slips. PR #115 tightens this:

- Same-player penalty stacks with each repeat.
- Same-player + same-market gets an additional penalty.
- Mixed slips get an extra penalty for Conservative / Balanced
  (PR #110 filter D).

When alternatives exist, the top N visible slips will NOT all
share the same anchor player. When the pool is small enough
that repeats are unavoidable, repeats are allowed but the
visible-count drops below the target — we never substitute
junk just to spread.

## 7. Custom Parlay Generator (PR #115)

In addition to the official suggested slips and the existing
manual Custom Builder, PR #115 adds a "Generate for me" subtab
inside the Custom Builder section.

Inputs the user picks:
- Sport: NBA / MLB / Mixed
- Risk profile: Conservative / Balanced / Star Power / Longshot
- Optional game (gameId)
- Optional team
- Optional player(s)
- Optional market(s)

Output: 1–5 generated previews using the same scoring +
correlation rules as the official optimizer, but **never
persisted and never tracked publicly**. The UI label is
explicit:

> Custom generated · not officially tracked

This separation is deliberate: official results stay clean,
and users get more control without polluting the public hit
rate.

## 8. What we explicitly do NOT do

- We never claim 75–80% hit rates.
- We never use banned copy ("lock" / "guaranteed" / "free
  money" / "risk-free" / "can't miss" / "easy win" /
  "no-brainer" / "sharp money").
- We never fabricate projections, props, or recent form.
- We never count custom-generated slips toward the public hit
  rate.
- We never lower safety standards just to hit a slip-count
  target.
- We never bring back cricket (see PR #113 and the WNBA
  roadmap for the precedent).

## 9. Acceptance criteria for the next pipeline PR

To turn on a new market for **official** lanes, all of the
following must be true:

1. The Odds API returns it for our books.
2. The fetch script writes it to the NBA/MLB board JSON.
3. The grader can settle it from a public box-score endpoint.
4. The audit has at least 25 decisive legs in the rolling
   14-day window with hit rate ≥ 45%.
5. The market has a clear `isVolatile*` flag if its variance is
   above a documented threshold.

Until all five are true, a new market is **Custom Generator
only** (eligible by user choice) or **Longshot only**.

## 10. NBA single-game (SGP) path

Added 2026-05-28 in PR `feature/nba-single-game-parlay-methodology`.

The standard per-profile rules cap NBA at 1–3 legs per game.
When the slate has exactly one NBA game (e.g. an OKC @ SAS
playoff matchup), the standard path produces zero NBA-only
slips because `min_legs` cannot be satisfied with one game. The
explicit single-game generator (`generate_nba_sgp_slips` in
`pipeline/parlay_optimizer.py`) fires ONLY when all four
conditions hold:

1. The NBA source pool has ≥ 2 leans.
2. The slate has exactly one unique NBA gameId.
3. Standard NBA-only generation returned empty for the profile.
4. The profile is in `NBA_SGP_PROFILE_DEFAULTS` (Conservative /
   Anchor is intentionally excluded — its "Lower-variance
   builds" framing would be contradicted by stacking two legs
   from one matchup).

Stricter eligibility than the source profile:
- Edge floor 4–5pp (vs 2–3pp normal).
- Confidence whitelist: High + Medium (Aggressive also accepts
  Low).
- `recent10Count >= 7` (matches the existing DNP guard).
- No anomalies, no thin pids; Star Power still requires
  `starTier != "none"`.

Composition controls:
- One leg per unique player (no doubling on a single star).
- 2 legs by default; Spotlight / Swing can also produce 3.
- Slip score = `sum(edge%/100) − correlation penalty`. Market
  overlap (two PTS legs together) adds extra penalty so the
  generator prefers PTS + REB over PTS + PTS.

UI labeling:
- Each SGP slip carries `singleGame=true` + `sameGame=true`.
- Lane chip in the slip header reads "CORE · SINGLE-GAME" (or
  Spotlight / Swing).
- Separate "⟁ SINGLE-GAME · HIGHER VARIANCE" chip below the
  header, with a hover tooltip explaining the correlation risk.
- `/parlay-lab` pool-availability banner switches to the
  framing copy ("Tonight's NBA-only slips are single-game
  builds…") whenever every NBA-only slip is `singleGame=true`.

What this does NOT do:
- Does NOT loosen R1–R5 confidence guardrails.
- Does NOT loosen PR #110's same-game cap on the standard
  multi-game NBA path (unchanged behavior on multi-game NBA
  slates).
- Does NOT fabricate sides — every SGP slip's Over/Under comes
  from the model's `projection > line` decision via the
  existing rescue logic.

Tests: `pipeline/nba_sgp_test.py` (19 cases).

## 11. Related docs

- `docs/MODEL_LEARNING_LOOP.md` — daily settle / audit / promote.
- `docs/PROP_MARKET_EXPANSION.md` — per-market audit table.
- `docs/RECENT_FORM_METADATA_TODO.md` — drawer enrichment plan.
- `docs/WNBA_ROADMAP.md` — WNBA staged-launch contract.
