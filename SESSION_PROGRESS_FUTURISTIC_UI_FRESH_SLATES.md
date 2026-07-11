# Session progress — futuristic UI + fresh slates

> Generated 2026-05-17 ~9:45 PM ET. Untracked. Do not commit.

## Phase 2 — settlement check (honest no-op)

Live status probed via free APIs before any action:

- **NBA May 17:** CLE @ DET Game 7 still **In Progress** (ESPN scoreboard: CLE 72 - DET 49 at probe time). Cannot settle until final.
- **MLB May 17:** 14 of 15 games Final per MLB-StatsAPI, but the May 17 board on disk is **schedule-only** (`propsAvailable=false`, 0 leans, `pendingReason: odds_not_fetched`). Nothing to settle.
- **NHL May 17:** schedule-only shell; no projections. Nothing to settle.
- **IPL May 17:** schedule-only shell; no projections. Nothing to settle.

Conclusion: settlement is genuinely a no-op tonight. Pending games are never counted as losses. The NBA Game 7 audit will land after the game completes — that work belongs in a separate operator-approved settlement run, not this UI PR.

## Phase 3 — next-48h slate snapshot

| Sport | May 17 (today) | May 18 | May 19 | Action |
|---|---|---|---|---|
| NBA | board live (72 leans), Game 7 in progress | schedule-only | schedule-only | Game 7 settlement after final |
| MLB | board live (schedule-only) | board on disk | board on disk | paid odds run gated on approval |
| NHL | schedule on disk | schedule on disk | schedule on disk | shots/saves projection needs paid odds + free log loader |
| IPL | schedule on disk | schedule on disk | schedule on disk | blocked by paid stats provider |

### Credit estimate (no paid calls made)

- **Remaining credits:** ~368 (last confirmed in prior session handoff; auto-refresh has run since but free MLB API only).
- **MLB May 18 + May 19 (full slates):** rough estimate ~40-60 credits/day for `pitcher_strikeouts + batter_hits + batter_total_bases`. **Operator approval required.**
- **NHL May 18 + May 19 (1 playoff game/day):** ~2-4 credits/day for `player_shots_on_goal + player_goalie_saves`. **Operator approval required.**
- **IPL:** no quote — sportsbook coverage of IPL player props on US-licensed bookmakers is limited. Paid stats provider decision still pending.

## Phase 7 — Power Board redesign (the user's biggest UI complaint)

Replaced 4 paragraph-heavy Power Board pages (~669 lines total) with a single shared compact shell (`app/src/components/power-board-shell.tsx`). Each sport's `power/page.tsx` now passes:

- accent color
- eyebrow + short headline
- one-sentence honest description
- watch-card title and one-line subtitle
- planned-inputs chips
- CTA back to the main projection board

Result: each Power Board now reads as a focused "high-variance watch" surface — single neon card with chips — instead of 200+ lines of paragraphs explaining why HR / goals / sixes / volatility leans aren't active. Approved copy throughout (`high-variance watch`, `power profile`, `risk-aware`); no betting hype.

### Sport-specific accents

- NBA Power Board: "Player volatility watch" — usage spikes, minutes volatility, injury/news flags, matchup pace, etc.
- MLB Power Board: "HR watch" — barrel rate, pitcher HR allowed, handedness, park factor, weather, batting order (pulls real `power.inputsPlanned` from on-disk data when present).
- NHL Power Board: "Goals + shot-volume watch" — shot bursts, expected goals delta, goalie SV%, powerplay TOI, etc.
- IPL Power Board: "Sixes + boundary watch" — boundary strike rate, spinner/pacer matchup, venue, dew factor, etc.

## What this PR does NOT do (intentionally deferred)

The original 14-phase brief asked for far more than fits in one safe PR without destabilizing surfaces. To keep scope honest:

- **Phase 4 nav pills:** the centered logo + unified nav row already shipped in PR #50. Pill-style sport/product split deserves its own focused PR.
- **Phase 5 sport-lobby command-center redesign:** sport overviews already got their text-trim collapse in PR #50; deeper lobby restructuring is a separate iteration.
- **Phase 6 board card visual overhaul:** NBA/MLB cards are the most data-dense surfaces in the app and need careful per-card iteration. Touching them in the same PR as the Power Board collapse risks layout regressions.
- **Phase 8 parlay ticket-slip styling:** Parlay Lab redesign is a self-contained surface deserving its own PR.
- **Phase 9 Results layout polish:** Results already received the model-lessons card in PR #47 and section-tab unification in PR #50.
- **Phase 10 global casino accents:** decorative animation layer wants its own PR with reduced-motion testing.

## Verification

- `npm run typecheck` PASS
- `npm run build` PASS (31 routes static-exported; route bundle sizes for the 4 power pages dropped to baseline ~520B each)
- All pipeline tests PASS (public_copy, context_tag, parlay_builder, settle, export_results, mlb.settle, mlb.export, mlb.mlb_model)
- Mobile (390×812) check on all four Power Board routes: section tab "Power Board" correctly active in each sport's section nav; no horizontal overflow; no console errors; chips and CTA tap-friendly.

## Open items

1. Operator-approved MLB paid run for May 18/19 → would unlock real projections + the May 18/19 boards become live.
2. Operator-approved NHL paid run + a free `pipeline/nhl/` per-skater + per-goalie log loader.
3. IPL stats provider decision (paid Cricbuzz / SportRadar / RapidAPI cricket).
4. NBA Game 7 settlement run after the game finals.
5. Candidate-slip snapshot persistence (still the parlay hit-rate blocker).
