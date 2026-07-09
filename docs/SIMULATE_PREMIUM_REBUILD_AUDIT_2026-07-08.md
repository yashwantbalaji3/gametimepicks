# Simulate Premium Rebuild — UX Audit (2026-07-08, Chunk 3)

Audit of the live `/simulate` + game-detail experience against the founder's FreeSim-style target (sport → game → clean pre-sim page → Generate → 10s+ animation → dashboard). Paper-only / educational; **no model/data/money/artifact changes** — this is a UX/structure rebuild.

## Confirmed problems

| # | Problem | Confirmed where |
|---|---|---|
| 1 | Featured game cards are plain (team names only, no logos) | `simulate-lobby.tsx` featured cards render `{f.teams.away} @ {f.teams.home}` — no logo; `featuredSimulations()` drops the logo URLs |
| 2 | Team logos missing from lobby cards | featured cards pass **names** to nothing; the aggregated `GamesExperience` rows *do* carry `homeLogo/awayLogo` but the featured strip doesn't |
| 3 | Sport selection not prominent | no sport selector/tabs on `/simulate` — sports are only implicit rows in `GamesExperience` |
| 4 | Featured games don't feel like premium matchups | small text cards, no logos, no venue/time, weak hierarchy |
| 5 | `/simulate` doesn't feel like a simulator dashboard | reads as a long explainer + a plain list; the left command rail dominates |
| 6/7 | **Game detail shows the dense report + posted prices BEFORE Generate** | `game-detail-page.tsx`: hero price quick-reads ("Top pick +150"), always-visible `MlbGameLabReport` (model-vs-market/leans), Model **spotlight** (odds/edge), and **7 SportShell tabs** (prices, prop tables, projections, markets) all render before/around the runner |
| 8 | Animation is basic/rookie | `simulation-animation.tsx` — a single small SVG diamond; no team identity, thin hierarchy |
| 9 | Flow is not sport→game→simulate→reveal | game detail is a report with a simulate button embedded, not a clean pre-sim page |
| 10 | Sidebar nav dominates over game selection | desktop command rail is the loudest element on `/simulate` |

## What already exists (reuse — do NOT rebuild)
- **`TeamMark`** (`components/ui/team-mark.tsx`) — renders `logoUrl` → `flagCode` → monogram fallback. This IS the team-identity primitive.
- **MLB logos** — `mlbTeamLogoUrl(teamId)` → `mlbstatic.com/team-logos/<id>.svg`; already set on `PublicGameDetail.homeLogo/awayLogo` for MLB and on the lobby's MLB `GameRow`s. WC uses `flagCode`.
- **Runner** (`game-simulation-runner.tsx`) already gates *its own* dashboard behind idle→animating(≥10s)→done. The leak is the *sibling* report/spotlight/tabs, not the runner.

## The plan (this chunk)
1. **Game-detail gating (the product unlock — highest priority):** for MLB-with-simulation, the page's default view is a **clean pre-sim** (matchup hero with logos + "what the simulation does" + Generate + preview pills). The `MlbGameLabReport` + Model spotlight + all price tabs are passed to the runner/experience and **rendered only when `phase === "done"`** (after the ≥10s animation) — so no posted prices / prop tables / distributions / leans appear before Generate. WC games (no sim) keep the current Game-Report layout.
2. **Premium animation:** upgrade `simulation-animation.tsx` to a professional "simulation engine" card — team logos left/right, elevated card, data-grid backdrop, animated diamond, honest 8-stage progress, "Simulation ready" finish. Still ≥10s, reduced-motion aware, real teams/runCount (1,000, never 10,000), no fake scores/soccer modules.
3. **Sport-first lobby:** add a prominent hero + **sport selector** (Today/MLB/World Cup/NBA/NHL/UFC with honest active/unavailable/off-season states + counts) + **premium featured cards with team logos** (thread `homeLogo/awayLogo` through `featuredSimulations`, render via `TeamMark`) + a scannable all-games list. Honest unavailable states (no fake soccer sim).
4. **Team identity:** reuse `TeamMark`; add a thin `MatchupIdentity` (home + away) for cards/hero/animation; MLB uses real logos, WC uses flags, everything else monograms — no external hotlinking beyond the existing mlbstatic/ESPN endpoints already in use.
5. **Flow/nav:** after reveal, offer back-to-simulations / try-another / see-today's-picks; the dense report stays secondary (below the dashboard, post-reveal only). `/games` stays as Game Reports; nothing deleted.

Honesty invariants unchanged: real teams/runCount only, `1,000` (never `10,000`), no fabricated logos/scores/xG/corners/cards/first-scorer/distributions, no unsupported soccer sim modules, paper-only, no banned copy. Canonical money md5 `affe6b21071f2b3be96bb2774eb347c3` untouched.
