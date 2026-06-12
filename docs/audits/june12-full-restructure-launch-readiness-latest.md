# June 12 launch-readiness — restructure + visuals + methodology (Phases 1–4)

Run: 2026-06-12 · Base: `1e01eb9` (after the June-11 settlement, PR #453).

## Phase 1 — June 11 settlement verified intact (no fixes needed)

- Public summary: **$1,423.64 / Step 4 / 3–0 / "World Cup HIT"**; ledger has exactly 3
  settled entries (211.85 → 728.76 → 1,423.64), continuity + uniqueness test-enforced.
- Official-scores evidence present; WC settlement (3 graded picks, 2 finals + corners);
  WC cards 2W/3L; mixed cards 1W/5L; MLB report 148W–166L with ATL@CWS postponed and
  ungraded. WC player props remain pending (no official player stat lines) — correct.
- No stale `$444.19`, no `$728.76`-as-current, no pending Step-3 card (verified in build).

## Phase 2 — IA / navigation

- **Top nav** (`nav.tsx`): `Today · Games · Picks · Build · | Bank Builder · Results ·
  Sports · Learn` — About moved out of primary (footer + rail Learn group keep it).
- **Desktop rail** (`command-rail.tsx`) regrouped by intent:
  Today (Today/Games/Picks/Build) · Bankroll (Bank Builder/Results) · Sports (World Cup ⚽ /
  MLB ⚾ / NBA 🏀 / UFC 🥊) · Learn (How it works / Methodology / About). Removed
  implementation labels ("Straight Bets", "Suggested Parlays", "Build a Parlay",
  "Sports & Events") + the parlay-hash highlight machinery; routes still resolve.
- **Mobile bottom nav** already matched the target (Today/Games/Picks/Build/Bank) — untouched.

## Phase 2/3 — page flows + visuals

- **/today**: + "Yesterday · June 11" settled-results strip (Bank Builder step, WC finals +
  pick record, suggested-cards hit count, MLB record — all read from settled artifacts);
  + trust cue footer (How it works / Methodology). Bankroll locale-formatted.
- **/results**: same YesterdaySummary strip at the top (dynamic date).
- **/games**: sport-identity chips + per-card identity accents/icons; World Cup cards show
  real country flags (ISO codes via teams.json); cards add player-prop counts; hover lift.
- **Fixture detail**: hero gains the sport orb + a real flag matchup for soccer fixtures.
- **/picks**: date in the header; identity glyphs on the sport matrix + filter pills.
- **/build**: identity glyphs on sport pills.
- **Sport hubs** (`SportOverviewHero`): optional identity-orb prop adopted by /world-cup,
  /mlb, /nba, /ufc; World Cup + UFC get their own accents (`wc` emerald, `ufc` fight red)
  instead of falling back to gold.
- **/learn**: new "Methodology, briefly" per-sport summary cards linking /methodology.
- **Build fix**: extracted pure `flag-emoji.ts` so client components can render flags
  without dragging `node:fs` into the browser bundle (webpack failure otherwise).
- Player-prop cards already render real portraits when the artifact carries a URL and an
  initials-monogram otherwise — unchanged (no fake assets anywhere).

## Phase 4 — methodology (full numbers in docs/methodology/)

Written from settled results only: `june12-model-learning-notes.md` + 4 per-sport
"current" docs. Headlines: MLB hits-Overs 57.3% (n=2,480) vs TB-Overs 42.3% / K-Overs
44.7%; |edge|≥20% legs settle 44.4% (worse than small edges); confidence labels currently
non-predictive; WC model+market-agreement favorites delivered while the model-disfavored
+195 DC lost; NBA 50.1% lifetime with REB/PRA strongest.

**Guardrails applied in code:**
1. `build_mixed_sport_cards.leg_passes_settled_guardrails` — suggested-card legs exclude
   TB Overs, K Overs, and |edge|>20% (public projection views unchanged). Unit-tested.
2. `loadOfficialStepCandidate(stake, targetMin)` — step-agnostic Bank Builder candidate
   with a tightened model ≥55% AND market ≥50% per-leg gate, plus a **slate-freshness
   gate** (a candidate may only come from TODAY's projections — a played slate can never
   resurface as a pending card). `/bank-builder` + `/today` now load the candidate for the
   ACTIVE rung (Step 4 → $3,500 floor at the full $1,423.64 stake). The Flex leg got the
   same freshness gate.
3. Copy: reworded "unlocks"/"leakage-safe" (banned substrings) on /ufc, /about, WC team
   pages.

## Verification

809 JS tests pass · pipeline tests pass (incl. new guardrail tests) · `tsc` clean ·
`npm run build` clean · copy audit clean on all 11 routes (only the allowed negated
disclaimers remain) · nav labels verified in built HTML.
