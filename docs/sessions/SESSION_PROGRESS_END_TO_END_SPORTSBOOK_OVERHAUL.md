# Session progress — end-to-end sportsbook overhaul + live slates

> Generated 2026-05-17 ~10:00 PM ET. Untracked. Do not commit.

## Part 1 — PR #51 merge

- Squash SHA: `ae3e8da` (Power Board shared shell collapse).
- Production live. NBA Power Board, MLB Power Board, NHL Power Board, IPL Power Board all serve compact shell.
- Canonical Vercel deploy: https://vercel.com/yashwantbalaji33-7164s-projects/gametime-picks/3mfshUrU3wwFXUArbdCvCCZe8g2J
- Rollback: `git revert ae3e8da`

## Settlement re-check (Phase 2)

Probed at the start of this PR:

- **NBA May 17 Game 7:** Still **In Progress** per ESPN scoreboard (CLE 105 - DET 73, `completed=false`). Game is essentially decided but ESPN has not flipped `completed=true`. Cannot settle honestly tonight — pending games are never counted as losses. The Game 7 audit belongs in a separate operator-approved settlement run after the game finals (likely tonight, after this PR ships).
- **MLB May 17:** Same as the previous session — 14 of 15 Final but the May 17 board is schedule-only (`propsAvailable=false`, 0 leans). No leans to grade.
- **NHL / IPL May 17:** schedule-only shells; nothing to settle.

No Results data changed in this PR.

## Phase 4 — paid Odds API credit audit (no paid calls in this PR)

### Current state

- **Remaining credits:** ~368 (last confirmed in prior session handoffs; auto-refresh since then has used the free MLB-StatsAPI path only).
- **Monthly free budget:** 500 credits.
- **Recommended safe floor:** 300 credits remaining at all times.

### Per-run cost estimates

Formula: `events × markets × regions` per cached event lookup.

| Sport | Typical event count | Markets (MVP) | Regions | Cost / day |
|---|---|---|---|---|
| NBA (regular season) | 8-12 | PTS, REB, AST | 1 (us) | 24-36 |
| NBA (playoff day) | 1-2 | PTS, REB, AST | 1 | 3-6 |
| MLB (full slate) | 13-15 | pitcher_strikeouts, batter_hits, batter_total_bases | 1 | 40-50 |
| MLB (small slate) | 5-8 | same 3 markets | 1 | 15-25 |
| NHL (playoff day) | 1-2 | player_shots_on_goal, player_goalie_saves | 1 | 2-4 |
| NHL (regular season day) | 8-12 | same 2 markets | 1 | 16-24 |
| IPL | unknown coverage | batter_runs, bowler_wickets (uncertain support on US books) | 1 | unknown |

### Monthly scenarios (30-day)

| Scenario | Sports/Day | Estimated monthly | Within 500 budget? |
|---|---|---|---|
| A. Conservative | MLB only when needed (~3 days/wk × 40), NHL playoff days only (~3 days/wk × 3), NBA playoff days only (~3 days/wk × 5) | ~700-900/mo | **Over budget** — needs trim |
| B. Normal | MLB daily + NHL playoff daily + NBA playoff daily | 50/day × 30 = ~1,500/mo | **Way over** |
| C. Aggressive | NBA + MLB + NHL + IPL daily, full markets | 75+/day × 30 = ~2,250+/mo | **Way over** |

### Recommendation

500 free credits/month covers **only one sport's daily next-day slate at MVP scope** without a paid plan upgrade. Practical cadence:

- **MLB** — fetch only the NEXT DAY's slate (~40-50 credits), and ONLY on days the model has confidence intent. ~4 days/week × 45 = **~180 credits/month**.
- **NHL** — fetch playoff-day events only (~2-4 credits each). ~12 playoff days × 3 = **~36 credits/month**.
- **NBA** — fetch playoff-day events only (~3-6 credits each). ~10 playoff days × 4 = **~40 credits/month**.
- **IPL** — block until paid stats provider is decided. **0 credits/month** for now.

Total under that cadence: **~256 credits/month**, well inside the 500 budget with margin for retries.

### No paid calls in THIS PR

Per the user's hard rules ("before ANY paid Odds API run: estimate cost, document expected before/after credits, keep safe floor"), this PR delivers the audit and recommendation but does NOT run any paid fetch. A targeted MLB May 18 + NHL May 18 paid run is a separate operator-approved follow-up.

## What this PR ships (UI overhaul)

Given the scope limit per safe PR, focusing on the user's two biggest complaints — homepage and sport lobbies — and adding one clearly-visible "live status" thread across both surfaces.

1. **Shared sport-lobby framework** — every sport overview becomes a consistent "Sport Lobby":
   - sport status panel (games next-48h + projections status + results status)
   - 4 action cards (Model Board · Power Board · Parlays · Results) replacing text paragraphs
   - already-collapsed footer disclosure from PR #50 preserved
2. **Homepage hero polish** — projection-first CTA pair, sport rail to NBA/MLB/NHL/IPL, audit CTA, parlay CTA. (Already done in PR #48 trend strip — this PR keeps it and adds richer sport rail entries.)

Deferred to dedicated future PRs:
- Board page card overhaul (NBA + MLB — data-dense surface; touching simultaneously with sport lobbies risks regressions)
- Parlay Lab ticket-slip styling
- Results layout overhaul (already polished in PR #47 + #50)
- Global casino animation layer
- Settlement of NBA Game 7 once finals
- Paid odds runs (operator-gated)

## Tests + verification

To run at the end of this PR.
