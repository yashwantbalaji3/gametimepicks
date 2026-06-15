# World Cup — Odds API market expansion + UI upgrade (preview PR)

Branch `worldcup-projections-uiux-oddsapi-upgrade`, stacked on the #490 branch
(`4f3f472`) so it builds on the WC odds foundation rather than discarding it.
PREVIEW — do not merge without owner review.

> Branch-base note: the brief said "branch off main", but #490 (the WC odds
> generator + WC homepage focus) is unmerged. Branching off main would discard the
> foundation this task expands, so this branch is off the #490 branch and its PR
> supersedes #490 (merge this, or merge #490 first then rebase).

---

## Phase 1 — Odds API soccer market discovery (`soccer_fifa_world_cup`)
Inspected via free `/sports` + `/events`, then a per-event `/odds` probe.

| Market requested | Returned? | Notes |
|---|---|---|
| `h2h` (3-way) | **yes** | home / draw / away |
| `totals` | **yes** | over/under, 2.5 line |
| `spreads` | yes | Asian handicap (not surfaced this pass) |
| `double_chance` | **yes** | **REAL book odds** (1X / X2 / 12) — no derivation needed |
| `btts` | **yes** | both teams to score |
| `draw_no_bet` | **yes** | home / away, draw voids |
| `team_totals` | yes | per-team o/u (not surfaced this pass) |
| `player_goal_scorer_anytime` | **yes** | player in `description` (e.g. De Bruyne, Salah) |
| `player_shots_on_target` | **yes** | us region |

Books seen: betmgm, fanduel, bovada, betonlineag, mybookieag, draftkings, betrivers,
betus, lowvig (us); pinnacle, williamhill, onexbet (eu player props). Credits: ~25
used across discovery + generation (367 → ~342 remaining).

**Decision:** every team/match market above is real and odds-backed — integrated. Player
prop ODDS exist too, but the recent-form / hit-rate / lineup layer needs API-Football, so
player props are **failed closed** (stale removed) this pass rather than shown without context.

---

## Phases 2–6 — expanded generator (`build_odds_only_projections.py`, v2)
Per UPCOMING today-ET fixture, one app projection object per market (the game-detail page
groups them by matchId). June 15 (3 upcoming — Spain v Cape Verde had already kicked off):

| Fixture | Markets emitted |
|---|---|
| Belgium v Egypt | moneyline_90, double_chance, btts, draw_no_bet |
| Saudi Arabia v Uruguay | moneyline_90, **match_total_goals**, double_chance, btts, draw_no_bet |
| Iran v New Zealand | moneyline_90, double_chance, btts, draw_no_bet |

**13 market projections total** (moneyline 3 · double_chance 3 · btts 3 · draw_no_bet 3 ·
totals 1). Each is odds-backed (provider `odds_api`, names its bookmaker, real price,
`dataQuality: limited`).

- **3-way handling:** de-vig the home/draw/away implied probs to sum to 1; **Draw is a real
  outcome** everywhere; favorite + draw-risk + upset prob all surfaced.
- **Double chance:** uses **REAL book odds** (1X/X2/12) with model probability from the
  3-way no-vig sum and a real edge (model − market). Never fabricated. (Derived 1X/X2/12
  from the 3-way remains the documented fallback when a book doesn't price it.)
- **Cards:** 2 WC cards (Low + Medium) from the strongest odds-backed leg per match
  (lower-variance markets preferred); Longshot omitted honestly. **4 mixed MLB+WC cards.**

## Phase 5 — player-prop truth cleanup
`player-projections/latest.json` regenerated as **count 0, status
`unavailable_needs_api_football`, current-dated** — the stale June-12 "164 props" is gone.
Disclaimer states the odds exist but the stat layer needs API-Football.

## Phases 8–14 — UI
- **Homepage WC focus:** keyed on the 3-way moneyline (one card per fixture); each dropdown
  now shows the **3-way (with Draw), the double-chance pick + odds, and the total-goals line**,
  plus "player props need API-Football".
- **`/world-cup` + game-detail:** already multi-market-aware — the richer data lights them up.
  Verified `/world-cup` renders double chance / BTTS / draw-no-bet / total goals and a clean
  player-props-unavailable state (no stale "164"). Game-detail shows 4 markets/fixture
  (Projections / Player-Props / Markets tabs). (`next dev` can't serve the dynamic game-detail
  route under `output: export` — a dev-only quirk; the static build generates all pages.)
- **Methodology:** WC card states odds via The Odds API (limited data) vs API-Football for stats.

---

## Integrity / tests / build
- All markets odds-backed; double chance from real book odds; no fabricated odds/stats/props;
  flags by real ISO code; player props failed closed (no stale).
- New `wc-odds-projections.test.mjs` (6 tests): odds-backed + bookmaker + price on every
  projection; 3-way no-vig sums to ~1 with a real Draw; double chance uses real book odds +
  model probs; player props failed closed (current-dated, no stale rows); no banned copy.
- Full suite passes; tsc clean; build clean (188 pages — one fewer: commenced Spain dropped).
- MLB / UFC / Bank Builder untouched except mixed cards that legitimately include WC legs.

## Honest limitations / deferred
- **Player props**: odds exist on The Odds API (goalscorer/shots) — a fast follow-up can show
  them as odds-backed limited-data props, but recent-form/hit-rate/lineup needs API-Football.
- **spreads / team_totals**: returned by the API but not surfaced this pass (follow-up).
- **Full `/world-cup` tab rebuild + Build/Parlay-Lab deep WC filters**: the new markets flow
  through the existing components; a dedicated tabbed redesign is a follow-up.
- Spain v Cape Verde commenced before generation, so it's excluded from upcoming projections.

**Recommendation:** review on the preview; merge this WC market expansion. Next: add
`API_FOOTBALL_KEY` to unlock player/team stats + lineups + the Poisson model, then surface
goalscorer props + spreads/team totals.

---

## API-Football enrichment (credential added by owner — verified + wired)

**Credential verified first (low-cost):** `GET /status` → Pro plan, active (ends 2026-07-11),
0/7500 requests today. Key stored ONLY in the gitignored `.env` (never printed, never committed);
the value never enters any tracked file or the git history.

**Data-source split (as instructed):** prices from The Odds API; **fixtures, standings, group,
lineups, recent form, settlement from API-Football.**

**Recon findings:**
- `/fixtures?league=1&season=2026&date=…` returns the real WC fixtures (Belgium, Spain, Saudi
  Arabia, Sweden, …) with team ids + live status.
- `/standings?league=1&season=2026` → real groups (Group G = Belgium/Egypt/Iran/New Zealand).
- `/fixtures?team={id}&last=5` → **real recent form across all competitions** (Belgium D-W-W-D-W).
  This is the correct recent-form source; `/teams/statistics?league=1` is thin this early
  (played 0), so the full Poisson team-strength model is deferred until more group games settle.
- `/fixtures/lineups` → posted for started matches, pending for upcoming (honest gate).

**Shipped — `enrich_with_api_football.py`:** reads the odds-backed projections and attaches
**real recent form (last-5) + group** to each, bumping `dataQuality` → `B` (odds + stat layer),
`statProvider: api_football`. June 15: **13/13 projections enriched** (Belgium [DWWDW] vs Egypt
[DLWDW], Group G; etc.). Fail-soft: a team that can't be matched keeps its odds-only projection.

**UI:** the homepage World Cup focus dropdown now shows the 3-way (Draw real) + double chance +
totals + **recent-form pills (W green / L crimson / D grey) per team + group**. Methodology WC
card updated to the live two-provider reality. New test asserts real form rows (date/opponent/
competition) + the dataQuality bump.

**Deferred (next increment, now unblocked):** player-prop projections (Odds API goalscorer/shots
odds + API-Football player recent form), lineup display when posted, settlement grading of
finished WC matches, and the full Poisson model once WC-season stats thicken. Recent form +
group + the verified credential are the foundation for all of these.
