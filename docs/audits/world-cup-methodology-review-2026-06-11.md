# World Cup Methodology Review — PAUSE public model picks (2026-06-11)

## Why this review was triggered
The first-pass model produced a **South Africa moneyline +750 lean over Mexico** (model 13.0%
vs market 11.2%, "+1.8% edge", Low confidence). Even though it used real data and was labeled
Low, surfacing a ~13%-probability extreme underdog as a normal "model lean" is a credibility
red flag. South Africa beating Mexico is implausible enough that the model is clearly
**overweighting thin recent-form signals and underweighting team strength/talent** (which the
market price already encodes). We are pausing public model picks until the methodology is
deeper and more defensible.

## What is paused (public), what stays live
- **Market Outlook stays LIVE** — de-vigged sportsbook Home/Draw/Away + totals (clearly
  market-implied, not a model pick).
- **GameTime Picks model projections + suggested parlays are GATED from public surfaces** via
  new readiness flags: `methodologyReviewRequired=true`, `projectionsPublic=false`,
  `parlayPublic=false`. The artifacts are **preserved** (`projections/latest.json`,
  `parlays/latest.json`) for audit — nothing is deleted.
- `/world-cup` shows "model projections under methodology review"; `/projections` and
  `/parlay-lab` hide World Cup; the homepage says "market outlook live" (not "projections live").

## No-fake-data policy (unchanged)
We are NOT replacing the underdog lean with a fabricated favorite pick. We do not invent xG,
ranks, lineups, or stats. The fix is a better model + honest gates — not a forced favorite bias,
and not blind underdog suppression.

## Upgrade plan (next PR)
1. Heavier market anchoring on opening day (market prior ≥ ~0.82; recent-form weight capped low
   and reduced further when no opponent-strength adjustment exists).
2. **Market-sanity gates**: no public ML for an underdog with market probability < 15%; cap the
   model's lift over the market for underdogs; minimum market-prob + edge for `active` status.
3. A `projectionStatus` per pick: `active` / `research_only` / `gated_market_sanity` /
   `gated_sample_size` / `gated_missing_features`. Only `active` is public.
4. Parlays only from `active` projections; no extreme-underdog ML in Low/Medium; Longshot stays
   clearly separated.
5. Totals re-evaluated (more defensible early) but still capped Low until the sample improves.

Realistic opening-day outcome: with only thin recent-form and no rank/talent/opponent-strength
feature yet, most or all ML picks classify `research_only`/`gated_*` → the public sees the
Market Outlook plus an honest "under review" note, not noisy underdog picks.
