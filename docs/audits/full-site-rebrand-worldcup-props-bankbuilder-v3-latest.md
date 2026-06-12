# Rebrand v3 — product header, lineup vocabulary, identity badges, Step-4 re-review

Run: 2026-06-12 (evening) · Base: `a27bc83` · State verified pre-work: $1,423.64 / Step 4 /
3–0; June-11 settled; Step-4 card pending (US-or-Paraguay DC −290 + Avila K U3.5 −112, +155).

## 1. Product header (the "ugly technical top bar")

`SlateStatusBar` rewritten: the internal strip (`today 2026-06-12 · active slate · bank
$100 paper · EDUCATIONAL · PAPER ONLY` — the $100 was a stale hardcoded label) is now a
row of clickable, plain-English chips: **Today · Jun 12** (→/today) · **Pregame slate**
(status dot; flips to "Slate settled") · **🏦 $1,423.64 · Step 4 · 3–0** (→/bank-builder,
reads the real public summary) · **Settled · Jun 11** (→/results), with a sentence-case
"Paper-only · educational" disclosure. Chips wrap on mobile. Locked by
`product-header.test.mjs` (no `"$100 paper"`, real summary loader, product links).

## 2. Lineup-status vocabulary (the "pre-lineup everywhere" complaint)

Before: 784 "Pre-lineup" occurrences on the WC hub alone. Now:
- `pre_lineup_likely` → **Projected starter** · `pre_lineup_public_projection`/
  `_market_view` → **Lineup pending** · `pre_lineup_unknown` → **Player evidence pending**
  · `waiting_on_lineups` → **Lineups pending** (public-visibility.ts, tested).
- ONE banner on the props explorer ("Lineups usually confirm closer to kickoff — player
  props stay projection-based until then"); the artifact's per-card "Pre-lineup
  projection" caveat is filtered at the normalize boundary (kept in artifacts, not
  repeated on 200+ cards or in the serialized payload).
- Remaining rendered copy reworded on /learn, /world-cup, /build, fixture caveats; the
  pipeline note copy (market_availability.py) updated so regenerated artifacts use
  "lineup-pending". Result: 0 occurrences on fixture pages; hub count 6 (current
  availability artifact text — self-heals on tonight's workflow run). Raw `PRE-LINEUP`: 0.

## 3. Competition badges (league identity)

New `CompetitionBadge` — **generated identity marks, documented as non-official** (no
licensed league/FIFA assets exist in the repo; none fabricated): "World Cup 2026" ⚽,
"MLB · 2026 season" ⚾, "NBA" 🏀, "UFC" 🥊 in each sport's accent/gradient. Adopted on
fixture-page heroes + all four sport-hub heroes (via a new `badge` slot in
SportOverviewHero).

## 4. Bank Builder Step 4 re-review — DECISION: KEEP the current card

The requested swap (replace Avila with **USA/Paraguay total goals Over 1.5**) fails on
real data, twice over:
1. **Over 1.5 is not a priced market in our artifacts.** The only real total-goals line
   for USA-Paraguay is 2.5 (Over +135 / Under −160, FanDuel family). Publishing an Over
   1.5 leg would mean inventing odds — forbidden.
2. Even at the real 2.5 line: Over 2.5 has model 46% (fails the ≥55% gate) and ANY
   total-goals leg from the same match as the DC leg is **same-game correlation** — the
   exact gate that already excluded DC+Over on the settled Step-3 review.
Cross-match WC-only alternatives top out ≈ $3,236 (< $3,500 floor). The full June-12
review matrix (mixed + MLB-only, board-lean model probabilities) already ranked the
current card best on the probables/settled-market axes.
**Avila availability re-verified live**: MLB Stats API game feed (gamePk 824102) lists
Luinder Avila as the official HOME probable starter; game Scheduled. No withdrawal
trigger. Card unchanged: +155 · $1,423.64 → $3,623.97 (+$2,200.33) · combined model
50.7% · pending · ledger untouched (locked by the step-4 integrity tests + the new
review test asserting exact legs).

## 5. Carried verifications

818 tests pass · tsc + build clean · copy + stale audits clean (the only "pre-lineup"
text left is the regenerating availability note) · games-first hubs, props explorer,
last-5 drawers, fixture-only cards, headshots/flags all live from this morning's PRs.

## Limitations

- Hub "pre-lineup" ×6 lives in the current markets-availability artifact; the generator
  is fixed, so tonight's workflow run clears it.
- Competition badges are generated identity, not licensed marks (documented).
- Tonight: settle the Step-4 card only from official finals (90′ regulation + MLB box
  score); if Avila is scratched pre-game, withdraw/review immediately.
