# HANDOFF — Real Schedules + Mobile UI (2026-06-01)

> Two goals: (1) add **real, sourced schedules** for the sports we surface,
> and (2) make the whole site **ideal on mobile**. No projections, parlays,
> results, or odds were added for unsupported sports; no fabricated
> schedules/matchups/venues. Real player-prop modelling remains **NBA + MLB
> only**. No data/pipeline/optimizer/settlement/generated-projection
> changes.

---

## 1. Repo state

- **Current main SHA:** `55c3007` (after PR #234)
- **Branch:** `main`, working tree clean (only untracked scratch notes)
- **Active slate:** `2026-06-01` — pregame, MLB-only (no NBA games that day; honest)
- **Latest settled slate:** `2026-05-30`
- **Environment note:** the sandbox clock is in the 2026 timeline
  (`2026-06-02`) and the free public ESPN / NHL APIs return matching 2026
  data, which is why real schedule sourcing was possible and verifiable.

---

## 2. PRs in this cycle (all squash-merged, gate-passed)

| PR | Title | Merge SHA | Files |
|----|-------|-----------|-------|
| [#231](https://github.com/yashwantbalaji3/gametimepicks/pull/231) | Real schedules — refresh WNBA/UFC, add MLS | `6f80c55` | `lib/event-schedules.ts` (+ test), `lib/sports-coverage.ts` (+ test) |
| [#232](https://github.com/yashwantbalaji3/gametimepicks/pull/232) | Mobile-first Sports & Events coverage board | `a871eba` | `components/sports-coverage-board.tsx` (new), `app/events/page.tsx`, removed `sports-coverage-grid.tsx` |
| [#233](https://github.com/yashwantbalaji3/gametimepicks/pull/233) | Mobile-first Home ordering + de-clutter | `642c496` | `app/page.tsx` |
| [#234](https://github.com/yashwantbalaji3/gametimepicks/pull/234) | Surface Sports in mobile nav + align core paths | `55c3007` | `lib/nav-active-route.ts` (+ test), `components/mobile-bottom-nav.tsx`, `components/nav.tsx` |
| #235 (this) | Docs — real-schedules + mobile-UI handoff | _this PR_ | `docs/HANDOFF_2026-06-01_REAL_SCHEDULES_MOBILE_UI.md` (new) |

Each merge waited for the real `Vercel – gametimepicks` check = SUCCESS
**and** `mergeStateStatus` = CLEAN, then synced main.

---

## 3. Schedules added / refreshed

All baked into `app/src/lib/event-schedules.ts` (the Events-hub registry),
generated **directly from the public API JSON** (no hand-transcription).

| League | Status | Events | Range | Source | retrievedAt |
|--------|--------|--------|-------|--------|-------------|
| **WNBA** | refreshed (was stale 4-game 05-29 snapshot) | 8 games | 2026-06-02 → 06-05 | ESPN public scoreboard `basketball/wnba` | 2026-06-02T03:06:05Z |
| **UFC** | refreshed (was 1 stale 05-30 card) | 5 cards | 2026-06-06 → 07-11 | ESPN public scoreboard `mma/ufc` | 2026-06-02T03:06:05Z |
| **MLS** | **NEW** (coming-soon → schedule-only) | 8 fixtures | 2026-07-16 → 07-22 | ESPN public scoreboard `soccer/usa.1` | 2026-06-02T03:06:05Z |
| **FIFA World Cup** | unchanged | 2 (opener window) | 2026-06-11 → 06-12 | ESPN `soccer/fifa.world` + official Final Draw | 2026-05-29T20:56:00Z |

Pre-existing, surfaced via their own hubs (not changed this cycle):
- **NHL** schedule — `api-web.nhle.com` (loaded by `/nhl`).
- **IPL** schedule — ESPN cricket scoreboard (loaded by `/ipl`).
- **World Cup** full 104-match schedule — `app/public/data/world-cup/`.

Every baked snapshot carries `source name + URL + retrievedAt +
rangeStart/rangeEnd + a schedule-only note` and is asserted by tests.

---

## 4. Source metadata (provenance)

- **All free public, no-key feeds**, the same ESPN/NHL families the repo
  already used. URLs are stored verbatim on each league's `source.url`.
- **`retrievedAt`** is a real capture timestamp (`2026-06-02T03:06:05Z` for
  the WNBA/UFC/MLS refresh; FIFA keeps its original `2026-05-29` because it
  was not re-fetched).
- **Point-in-time snapshots, attributed as such** — the UI labels them
  "snapshot <date>", never "live". No frontend network calls; everything is
  baked into repo files.

---

## 5. Sports coverage table (as shipped)

| Sport | Coverage | What's live |
|-------|----------|-------------|
| **MLB** | Projections + Parlays | projections, parlays, graded results |
| **NBA** | Projections + Parlays | same (no NBA games on the June-1 MLB-only slate) |
| **NHL** | Schedule only | `/nhl` |
| **WNBA** | Schedule only | refreshed snapshot, Events hub |
| **UFC** | Schedule only | refreshed snapshot, Events hub |
| **FIFA / World Cup** | Schedule only | `/world-cup` + Events hub |
| **IPL (Cricket)** | Schedule only | `/ipl` |
| **MLS** | **Schedule only (new)** | real July fixtures, Events hub |
| **EPL** | **Coming soon** | ESPN has no published 2026-27 fixtures → no real schedule to show |

- **Projections + parlays:** NBA, MLB (unchanged).
- **Schedule-only:** NHL, WNBA, UFC, FIFA/World Cup, IPL, **MLS**.
- **Coming soon:** **EPL** only.

No unsupported sport has odds/projections/parlays/results anywhere.

---

## 6. Mobile UI changes

- **Sports & Events hub (`/events`)** rebuilt mobile-first
  (`SportsCoverageBoard`): a coverage summary, tappable category filters
  (All / Picks available / Schedule only / Coming soon, with live counts),
  and big cards. Schedule leagues show a **"Next" event** (matchup + date +
  ET time) and an **attributed source line**. The full multi-day schedule
  tabs stay below.
- **Home** reorganised for 375 via a flattened responsive grid: status bar
  → path cards → Featured slip → Bank Builder → Sports coverage → Suggested
  preview → Track record → (Guided, demoted) → newsletter. Dropped the
  redundant Projections sidebar module; trimmed the Suggested preview from
  3 cards to 2 so the page is shorter. Same content packs into a clean
  two-column desktop. Full Parlay Lab was **not** re-added to Home.
- **Mobile bottom nav** gained a 5th destination, **"Sports" → /events**
  (calendar glyph). Schedule-only routes (`/events`, `/nhl`, `/ipl`,
  `/world-cup`) now highlight "Sports". The mobile/tablet top nav relabels
  "Events" → "Sports"; the **desktop rail is unchanged** ("Sports &
  Events").

All six core paths are reachable on mobile: Home, Projections (Straight
Bets), Parlay Lab (Parlays), Results, Sports from the bottom nav; Bank
Builder from the top strip.

---

## 7. What is live in production

NBA + MLB projections/parlays/results (unchanged); a mobile-first Sports &
Events hub with **real, attributed schedules** for WNBA / UFC / MLS / FIFA
(plus NHL / IPL / World Cup via their hubs); EPL honestly "Coming soon"; a
de-cluttered, mobile-ordered Home; and a 5-item mobile bottom nav that
surfaces Sports. Gold/vault brand throughout.

---

## 8. Verification

- **Tests:** `npx tsx --test src/lib/*.test.mjs` → **572 pass / 0 fail**
  (registry + nav honesty tests updated for the new schedules, MLS, and the
  5-item nav).
- **Types:** `npx tsc --noEmit` → clean.
- **Build:** `npm run build` → green, 139/139 static pages.
- **Browser (mobile 375 + tablet 768 + desktop 1280)** across `/`,
  `/events`, `/projections`, `/parlay-lab`, `/bank-builder`, `/results`,
  `/about`:
  - no horizontal overflow; no console errors; no banned copy; no
    user-facing "safe/safety".
  - Events shows real refreshed/new schedules with ESPN attribution
    (snapshot 2026-06-02); MLS schedule-only, EPL coming-soon (no link).
  - no unsupported sport shows picks; Results latest settled 2026-05-30,
    no May-25/26 leak, **no June-1 settled leak**, no UFC/MLS/EPL results.
  - Build My Card works on Parlay Lab; Bank Builder paper-only; Events
    schedule-only; 5-item bottom nav renders without clipping and
    highlights correctly; desktop rail unchanged.

---

## 9. Hard rules honored

No fabricated schedules/matchups/fights/venues/teams/odds/projections/
parlays/results/recent10 · no data/pipeline/optimizer/settlement changes ·
no generated projection/parlay data changes · no May-31 backfill · no
June-1 settlement · no same-slate results altering pregame · UFC/MLS/EPL
have **no** odds/projections/parlays · schedule-only stayed schedule-only ·
coming-soon (EPL) has no fake schedule · Bank Builder paper-only · Events
schedule-only · no fake sportsbook links · no secrets · no banned betting
copy.

**Preview branches #213 / #214 / #215 remained DRAFT and unmerged — never
merged or edited.**

---

## 10. Known limitations

- **Baked snapshots are point-in-time** (WNBA/UFC/MLS retrieved
  2026-06-02). They are attributed as snapshots and will age until a future
  refresh; there is no automated job refreshing `event-schedules.ts`.
- **EPL stays Coming soon** — ESPN had no published 2026-27 fixtures at
  retrieval time. It can flip to schedule-only once fixtures publish.
- **IPL / NHL on-disk schedules** (`/ipl`, `/nhl`) were not refreshed this
  cycle (separate from the Events-hub registry); their pages already handle
  stale/empty states honestly.
- **Home desktop** uses a paired-row grid; tall parlay modules leave some
  right-column whitespace (cosmetic — mobile order was the priority).
- Coverage levels are **capability-based**, not per-day.

---

## 11. Next recommended work

1. **Automate schedule refresh:** a small script/CI job that re-fetches the
   ESPN snapshots and rewrites `event-schedules.ts` (or moves these to
   `public/data/*` like NHL/IPL) so WNBA/UFC/MLS never go stale.
2. **EPL → schedule-only** once ESPN publishes 2026-27 fixtures (flip the
   registry level + bake a snapshot, same pattern as MLS).
3. **Refresh NHL / IPL** on-disk schedules and surface their next-event in
   the coverage board (join like WNBA/UFC/MLS/FIFA).
4. **Real projections/parlays for a new sport** would require a full
   `pipeline/<sport>/` (ingestion + model + grader + tests) before a sport
   may be marked "full" — out of scope here.

---

*End of handoff. Current main `55c3007`. Active slate 2026-06-01 (pregame,
MLB-only). Latest settled 2026-05-30. Real schedules live for WNBA / UFC /
MLS / FIFA (+ NHL / IPL / World Cup hubs); EPL coming soon; NBA + MLB remain
the only projections + parlays sports.*
