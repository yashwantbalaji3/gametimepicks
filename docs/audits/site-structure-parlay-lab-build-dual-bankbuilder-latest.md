# Site structure rebuild + soccer odds — audit (preview PR)

Branch `site-structure-parlay-lab-build-dual-bankbuilder` off main `aa4eb35`. PREVIEW
PR — **do not merge** without owner review. Scope is large (foundational IA + dual
Bank Builder + soccer); this PR delivers the highest-leverage coherent slice and lays
out the rest as follow-ups (the brief explicitly allows splitting).

---

## Supplement (priority): soccer odds via The Odds API — RESOLVED, SHIPPED

**Finding: the existing `ODDS_API_KEY` DOES power World Cup odds.** `soccer_fifa_world_cup`
is ACTIVE in The Odds API. Today's (ET) fixtures all return real 3-way prices.

### Soccer source decision table
| Soccer layer | Source tried | Available? | Used? | Notes |
|---|---|---|---|---|
| Fixtures/schedule | repo `world-cup/schedule.json` | yes | yes | 104-fixture WC calendar; numeric matchIds reused for consistency |
| Odds | **The Odds API** `soccer_fifa_world_cup` (h2h+totals, us) | **yes** | **yes** | 3-way moneyline de-vigged; ~2 credits/run; 367 remaining |
| Rich team/player stats, lineups, xG | API-Football / API-SPORTS | **no** (no `API_FOOTBALL_KEY`) | no | needs the key — see prior audit's credential spec |
| Settlement | official final score (regulation 90) | yes (manual/API) | n/a this run | unchanged |

### What shipped (new pipeline + data)
- `pipeline/world_cup/build_odds_only_projections.py` — LIMITED-DATA odds-only generator:
  fetches WC odds, filters to today's ET fixtures, de-vigs the 3-way h2h, maps each event
  to the schedule's numeric `matchId`, flags by real ISO code (`teams.json`), `dataQuality:
  limited`, `provider: odds_api`, confidence capped (no stat layer). Emits projections +
  suggested cards in the app schema.
- June 15 output: **4 matches** (Spain v Cape Verde, Belgium v Egypt, Saudi Arabia v
  Uruguay, Iran v New Zealand), **2 parlay-eligible favorites** (Belgium -185 p≈0.61,
  Uruguay -235 p≈0.66 → 1 Low card @ +120). Spain/Iran below the 0.55 favorite floor →
  shown as projections, NOT in cards (no padding). Longshot tier omitted (no plus-money
  eligible WC leg) — honest.
- Mixed cards: WC now contributes 2 eligible legs, so `build_mixed_sport_cards` produced
  **4 MLB+WC mixed cards** (Low 2, Medium 2).
- Integrity: no fabricated stats/lineups/xG/player props; flags by ISO code (no fabricated
  logos); only odds-backed legs; honest counts.

---

## Information architecture

### Primary nav (top + mobile bottom) — now
`Today · Games · Parlay Lab · Build · Bank Builder · Results · Sports · Learn`
(Picks → **Parlay Lab** rename; `/picks` route kept, `/parlay-lab` redirects to it. `/learn`
hub already groups methodology + audits.)

### Daily user flow
Today (World Cup focus → MLB parlays → Bank Builder → Results) → tap a sport / Parlay Lab
for curated cards → Build for a custom card → Bank Builder for the ladder.

### Where content lives
Today's featured event → `/today` (WC focus). Suggested parlays → `/picks` (Parlay Lab) +
homepage MLB section. Mixed parlays → Parlay Lab "Mixed". Bank Builder → `/bank-builder`
(completed run + Dual teaser). Settled results → `/results` + homepage recap. Methodology/
audits → `/learn` + `/methodology`. Stale/cached/unavailable → honest per-surface states.

---

## Delivered in THIS PR
1. **Soccer odds (Supplement A–G)** — discovery + odds-only generator + WC projections +
   WC card + mixed MLB+WC cards. World Cup is now a live, odds-backed (limited-data) sport.
2. **Parlay Lab rename (Phase 2)** — top nav, mobile bottom nav, page title + header.
   `/parlay-lab` → `/picks` redirect kept; routes unchanged.
3. **Homepage WC-first command center (Phase 3)** — new "Today's Focus: World Cup" lead
   section (fixtures, 3-way de-vig picks, per-fixture dropdowns, honest data-state) →
   "Today's MLB suggested parlays" (curated snapshot cards) → Bank Builder recap →
   sports grid → **UFC settled recap moved to the results zone** (no longer leads) →
   yesterday's results. Honest "projections unavailable / no matches" states when WC data
   is absent.
4. **Dual Bank Builder teaser (Phase 10)** — `dual-bank-builder-teaser.tsx`: two parallel
   lanes (Lane A lower-variance / Lane B higher-variance), `$100 → $10,000`, Step 0 · idle,
   "Awaiting kickoff", lava/glow V1 visuals (reduced-motion-safe), clear NOT-STARTED state.
   No new run started.

## Deferred to follow-up PRs (documented, not faked)
- **Games sport accordions + per-game "View projections & suggested parlays" (Phase 4)** —
  `/games` already groups by sport; the deep accordion + per-game entry flow is a follow-up.
- **Game-detail per-game 4-risk-tier parlays + tabs (Phase 5)** — `game-detail-page.tsx`
  exists; per-game parlay generation across risk tiers is a larger build.
- **Full Parlay Lab curation engine + all advanced filters/sorts + 10–15/sport target
  (Phase 6–7)** — `/picks` has sport/risk/goal filters today; the curation engine + full
  filter/sort matrix is a follow-up (the `projection-framework` concentration/eligibility
  helpers from the prior PR are the foundation).
- **Build guided remodel (Phase 9)**, **universal player-detail drawers everywhere
  (Phase 8)**, **Results progressive-disclosure redesign (Phase 11)**, **grouped sidebar
  visual-identity + logo treatment (Phase 12–13)** — each a focused follow-up PR.

---

## Integrity / tests / build
- Bank Builder `$10,376.17 / 5–0 / completed` and UFC 250 settlement **byte-identical**
  (no historical mutation). Soccer fabrication: none (odds-backed only, flags by ISO).
- 903 app tests pass (nav-label + WC game-detail tests updated to the new copy/ids); tsc
  clean; `npm run build` clean (189 pages). Copy + secret audits clean.
- Browser-verified (desktop + mobile 375px, 0 console errors): homepage WC-first + Parlay
  Lab nav; `/bank-builder` Dual teaser; `/world-cup` odds-backed projections.

**Recommendation:** review on the Vercel preview; merge the soccer-odds + IA backbone +
homepage + Dual teaser slice, then take the deferred items as scoped follow-up PRs.
