# Final end-to-end lava casino polish — plan + results

Run: 2026-06-12 ~22:30 UTC · Base `82194fb` (main). UI/UX + asset sprint, not settlement.

## 1. Current-state verification (before edits)
- Bank Builder: **$1,423.64 / Step 4 / 3–0**, Step-4 card **pending** (+155 — US-or-Paraguay
  DC −290 FanDuel + Luinder Avila K Under 3.5 −112 DraftKings, stake $1,423.64, return
  $3,623.97, profit +$2,200.33). 824 tests green on main.
- Step-4 guardrail re-check (live): **Avila Pre-Game, home probable** (MLB Stats API);
  USA–Paraguay scheduled. Both legs valid → KEEP, no mutation.

## 2. Page-by-page diagnosis (what THIS sprint fixes)
The site already shipped lava CTAs, 7 Picks lanes, PlayerAvatar, WC logos/portraits, MLB
headshots, competition badges, fixture-only suggested cards (PRs #452–#463). Remaining
user complaints this sprint closes:
- **#4 MLB fixture/board pages lack MLB team logos** — the single biggest "feels
  incomplete" gap. /games MLB cards and MLB fixture heroes rendered a text matchup only.
- **#6 player props are a wall of rows** — the explorer flattened every market into a grid;
  no way to read "this player, across their markets."
- **#3 lava not deep enough** — energy lived on buttons/Bank Builder; the *ambient page*
  was still gold + a faint cyan wash, so the canvas read premium-but-cool, not lava.

## 3. Asset gap — the enabling discovery
MLB board artifacts (`public/data/mlb/boards/<date>.json`) carry real **`homeTeamId` /
`awayTeamId`** (MLB Stats API ids — PIT 134, MIA 146, …). Official team logos are therefore
derivable HONESTLY from `https://www.mlbstatic.com/team-logos/{id}.svg` — the same
official-source family as the MLB Static headshots already in use. Verified live: ids
134/146/147 all return HTTP 200 `image/svg+xml`. No scraping, no fabricated marks.
Full inventory: `final-asset-logo-portrait-coverage-latest.md`.

## 4. Color directions evaluated (3)
- **A. Lava Sportsbook — full ambient (CHOSEN).** Keep graphite base + readable body text;
  deepen the *ambient page wash* from gold/cyan to ember + deep-red lava (`#FF6A2A` →
  `#B3261E`), so every route — not just CTAs — reads lava. Gold stays crown-only
  (selection, brand). This is exactly the stated preference ("liked the lava, want more")
  with contrast preserved (washes sit behind content at ≤0.11 opacity).
- B. Vegas Neon (magenta/animated rays) — rejected: cheap, hurts contrast.
- C. Premium Modern (today's graphite) — rejected: it's the "dull" the user called out.

## 5. Selected rationale
Ambient-lava is the lowest-risk way to finally answer "deeper lava everywhere": it recolors
the canvas glow (where energy belongs) using tokens already shipped, touches one file
(globals.css body/::before/::after), and never recolors body copy — so readability and the
gold crown identity are intact.

## 6. Route-by-route implementation
1. **MLB team logos** — `mlbTeamLogoUrl(teamId)` helper (official mlbstatic CDN);
   threaded `homeTeamId`/`awayTeamId` through the MLB fixture detail + /games rows; both
   already render `TeamMark` (logo→flag→monogram), so logos light up on /games MLB cards
   and MLB fixture heroes. NBA left on monogram (no official static mark wired). Fallback:
   no id → monogram, never a fake logo.
2. **Player-prop grouping** — new `PlayerPropGroup` + `groupByPlayer`; explorer gains a
   "👤 By player" view: one collapsible card per player (avatar, team, market count, real
   best-edge chip), markets nested strongest-edge first. Top-picks + market tabs unchanged.
3. **Deeper ambient lava** — globals.css body wash + ::before + dot-noise shifted from
   gold/cyan to ember + deep-red lava; reduced-motion irrelevant (static gradients).

## 7. Data guardrails
- No fabricated odds/projections/stats/portraits/logos/results. MLB logos are official
  mlbstatic URLs from real ids; the best-edge chip is `max` of the player's real edges.
- Bank Builder ledger + Step-4 candidate untouched (UI-only diff; re-asserted: no
  bank-builder artifact in `git status`).
- Settlement NOT performed here.

## 8. Regression / Bank Builder verification plan
tsc + full test suite + static build; grep built HTML for ($1,423.64 / $3,623.97 / Avila)
intact, MLB logos present on /games + MLB fixture, By-player view present; banned-copy +
internal-label sweep; then deploy + production re-verify.

---

## RESULTS (implemented)
1. **MLB team logos live** — official `mlbstatic.com/team-logos/{id}.svg` from real team
   ids on /games MLB cards (`out/games/index.html`: 108–147…) and MLB fixture heroes
   (`out/games/mlb/mia-vs-pit-…`: 134 + 146, alt="PIT"/"MIA"). Honest fallback chain
   preserved.
2. **By-player view live** — explorer "👤 By player" groups each player's markets into one
   expandable card, best-edge first; built into MLB + WC fixtures.
3. **Ambient lava deepened** — body/::before/dot-noise now ember + deep-red lava sitewide;
   gold kept as crown (selection/brand). Body text untouched → energy without losing
   readability.
4. **Step-4 guardrail** — Avila Pre-Game home probable (re-verified live) → KEEP, pending,
   no ledger/card mutation; values intact in built HTML.

## Verification
833 tests pass (+9: mlb-team-logo ×4, player-prop-group ×5) · tsc + build clean · MLB logo
URLs return 200 image/svg+xml · copy/internal-label sweep clean (only false positives:
`gtp-brand-lockup`, honest "No guarantees" disclaimer; pre-existing /learn educational
copy untouched).

## Limitations / next
- NBA official team marks not wired (no documented static endpoint adopted) — monograms.
- Suggested-card legs still lack per-leg images in artifacts (orbs) — a generator job.
- Tonight (separate, operational): settle Step-4 from official finals; withdraw if Avila
  scratched pre-game.
