# Handoff — Bank Builder & Sports Event Hub (2026-05-30)

> Educational paper-trading product. NBA + MLB are the only modelled
> sports. Nothing here takes real money, publishes guaranteed outcomes,
> or settles a slate before its games are final.

## 1. Snapshot

- **Repo:** `gametimepicks` (Next.js 14 static export — `output: "export"`,
  `trailingSlash: true`, `images.unoptimized: true`).
- **Base before this work:** `main` @ `3a2fafd` (PR #182 merged).
- **Branch / SHA at handoff:** `main` @ `db28af0` (PR #184 merged). This
  docs-only PR (#8) adds one commit on top; its squash SHA is assigned at
  merge.
- **Local quality gate:** `npx tsc --noEmit` clean · `npx tsx --test
  src/lib/*.test.mjs` green (493 tests) · `npx next build` exit 0 (static
  export of all routes).

## 2. PRs in this sequence

| PR | Branch | Title | Merge | State |
| -- | ------ | ----- | ----- | ----- |
| 2 | `feature/build-my-card-selected-slips` | Selectable suggested parlays + My Card tray | #179 / `b8f3314` | merged |
| 3 | `feature/build-my-card-bankroll-allocation` | Allocate bankroll across selected slips | #180 / `51f1db8` | merged |
| 4 | `feature/bank-builder-prototype` | Bank Builder paper-bankroll ladder prototype | #181 / `6af6e09` | merged |
| 5 | `feature/bank-builder-visual-ladder` | Bank Builder visual progress ladder + share card | #182 / `3a2fafd` | merged |
| 6 | `feature/bank-builder-slip-selection` | Deterministic `selectBuilderSlip` helper | #183 / `b058ad7` | merged |
| 7 | `feature/sports-event-hub-schedules` | Sports Event Hub (schedule-only) | #184 / `db28af0` | merged |
| 8 | `docs/bank-builder-event-hub-handoff` | This handoff doc | this PR / docs-only | open → squash-merged on completion |

## 3. Feature states

### Build My Card / selected slips (PR 2)
- Suggested parlays in Parlay Lab are **selectable**; chosen slips
  collect in a **My Card** tray. Selection is client-side and additive
  on top of the existing suggested snapshot — no new pipeline, no
  fabricated slips.

### Selected bankroll allocator (PR 3)
- Allocates a paper bankroll **across the selected slips**, framed as
  educational/paper-trading. Pure presentation over already-published
  odds; no real money, no financial advice.

### Bank Builder (`/bank-builder`)
- Educational $100 → $3,000 paper ladder, five rungs (each doubles; the
  final rung needs 1.875×), one Daily Builder Pick per rung.
- **Read-only.** Derives entirely from the already-published
  optimizer/suggested snapshot + the existing graded record. No new
  pipeline, no parallel grader, no real money.
- Animated progress **tower** (PR 5): the gold fill reflects ONLY
  *cleared* rungs, so the base rung honestly reads 0%. A "You are here"
  marker shows the real paper bankroll. Reduced-motion users get the
  final state instantly (`.gtp-tower-fill`, `.vault-pulse`, `.reveal`
  are all gated behind `prefers-reduced-motion`).
- Screenshot-friendly **share card** (PR 5) sized for X / Reddit.
- **No durable ladder history yet** (§4.2 deferred) — the prototype
  starts at the base rung and never fabricates prior progress. The
  history panel honestly reads "Tracking starts when a Builder Slip
  settles."
- Today's Builder Slip is chosen by the tested, deterministic
  `selectBuilderSlip` helper in `lib/parlay-suggested.ts` (PR 6): only
  *pending* slips, combined decimal odds must clear the rung target,
  prefers lower-risk sections early and avoids Longshot on steps 1–2,
  then breaks ties by suggested score → game diversity → known start
  times → slip id. Returns `null` (honest empty state) when nothing
  qualifies. Never surfaces a settled slip as a pick.

### Sports Event Hub (`/events`) — schedule only (PR 7)
- Three tabs: **WNBA · UFC · FIFA World Cup**. **Schedule only** —
  dates, matchups, venues. No odds, projections, parlays, or picks, and
  the page says so. These leagues are **not modelled**.
- Each league shows a source banner: name, snapshot date, covered date
  range, an honest "point-in-time snapshot, not live" note, and a link
  to the public feed.
- FIFA World Cup cross-links to the existing `/world-cup` command center
  (the complete official Final Draw schedule lives there).
- A `disabled` source renders an explicit "source not connected yet"
  state instead of an empty calendar.
- New nav item **Events** (desktop + mobile strips).
- Code: `app/src/lib/event-schedules.ts` (typed data + pure helpers,
  16 unit tests in `event-schedules.test.mjs`),
  `app/src/components/event-schedule-hub.tsx` (tabbed client UI),
  `app/src/app/events/page.tsx` (server page + metadata).

## 4. Data sources

- **Bank Builder + Parlay Lab:** the existing published suggested-parlay
  snapshot + graded record. No new ingestion.
- **Event Hub schedules:** hand-inspected, verbatim snapshots of the
  **ESPN public scoreboard JSON** (no API key, no scraping):
  - WNBA: `.../basketball/wnba/scoreboard`
  - UFC: `.../mma/ufc/scoreboard`
  - FIFA World Cup: `.../soccer/fifa.world/scoreboard`
  - Snapshot captured **2026-05-29** and baked into
    `lib/event-schedules.ts` with full provenance. World Cup matchups
    were cross-checked against `public/data/world-cup/schedule.json`
    (official Final Draw) and matched exactly.

## 5. Limitations / known gaps

- Event Hub data is a **static snapshot**, not live — it ages. Refreshing
  means re-capturing the ESPN JSON and updating `lib/event-schedules.ts`
  (and `ESPN_RETRIEVED_AT` / range fields). A future PR could move this
  to a build-time fetch step.
- Bank Builder has **no persisted ladder history** — every load starts
  at the base rung. Durable history is deferred (design §4.2).
- The Event Hub does not auto-detect a stale snapshot; the honest
  "snapshot, not live" labelling is the current safeguard.

## 6. Hard rules honored (do NOT break)

- Schedule-only for WNBA/UFC/FIFA — **no projections, parlays, odds,
  optimizer, or grading** for these leagues.
- No fabricated outcomes/odds/schedules/recent-game data; null odds
  render "—".
- Do not settle a slate (e.g. May 29) before its games are final; never
  use final results to alter same-slate pregame suggestions.
- No banned hype copy (lock / guaranteed / risk-free / sure thing /
  no-brainer / can't miss / easy money / sharp money / etc.); no
  user-facing "safe"/"safety" (CSS `safe-area-inset-bottom` is an
  accepted false positive).
- No sportsbook scraping, no fake book links, no copied book UI/branding.
- No secrets committed; Odds API key never printed.
- Bank Builder framed as educational paper-trading; disclaimers top and
  bottom; a settled slip is never shown as a pick. No real-money
  financial advice.
- Cricket / IPL stay out; do not reactivate.
- Do not bulk-commit the ~52 untracked root `.md` / `.claude` working
  notes — stage specific files only.

## 7. Next work (required — approved direction)

### 7.1 Team filter (Home + Parlay Lab)
- Selecting a team must surface **all** parlays involving that team.
- A team can appear in **any leg** of a multi-leg slip, not just leg 1 —
  the filter must scan every leg, not the first.

### 7.2 Game / matchup filter (Parlay Lab)
- Allow selecting a specific matchup/game and show all parlays involving
  that game.
- Must work for **every game on the slate**, not a subset.

### 7.3 Risk-quality methodology (do not ship cosmetic-only sections)
- Risk sections must **not** be derived from combined odds + leg count
  alone. Factor in **individual leg odds** and **recent-10-game hit
  rate**.
- **Low Risk** should strongly prefer legs around **-150 or better,
  ideally closer to -200**; **avoid +100 / plus-money legs in Low Risk**
  unless there is an explicit, documented fallback.
- A player clearing the prop in **≥ 75% of the last 10 games** supports a
  lower-risk classification.
- **Never fabricate** `recent10`, odds, or sections just to fill cards.
  If not enough qualified slips exist, show **fewer** or an **honest
  empty state**.
- Do not start this work until PR #184 and PR #8 are complete or cleanly
  blocked/reported, and not before explicit approval.

### 7.4 Carryover (still open)
- Persist Bank Builder ladder history from the graded record (design
  §4.2) so cleared/reset rungs show real results.
- Move Event Hub schedules to a scripted/build-time ESPN refresh with a
  freshness stamp + staleness guard.
- Optional: add more leagues to the hub behind the same `disabled` →
  `connected` source model.

## 8. Verification commands

```bash
cd app
npx tsc --noEmit                          # types
npx tsx --test src/lib/*.test.mjs         # unit tests (493 pass)
npx next build                            # static export (exit 0)
grep -c "No qualifying Builder Slip" out/bank-builder/index.html   # 0 when a pick rendered
grep -c "ESPN public scoreboard" out/events/index.html             # >=1
```

## 9. CI / deploy note (infrastructure)

Two Vercel projects auto-deploy on every push: **`gametimepicks`** (real
production) and **`gametime-picks`** (a duplicate/legacy project). Both
deploying on every push doubles deploy load and can trip the Hobby-plan
**build-rate-limit**. Per the maintainer's standing decision, a PR may be
merged when local build/tests/typecheck pass **and** the real
`gametimepicks` deploy is green, even if the duplicate `gametime-picks`
project is red solely due to that rate limit (treated as infra throttle,
not a code failure). **If the real project is also red, do not merge —
wait for a fresh deploy to clear.**

PR #184 hit exactly this during 2026-05-29: the real project's per-project
deploy quota was exhausted (it deploys on every push **and** every
merge-to-main, ~2× the duplicate's load) and returned "Deployment rate
limited — retry in 24 hours," while the duplicate deployed green. Per the
rule, the merge was held until a paced single retrigger (after a long
quiet window) brought the **real** project green (commit `ded8bc4`,
"Deployment has completed"), and only then was PR #184 squash-merged.

Recommended cleanup: disable auto-deploy / Git integration on the
duplicate `gametime-picks` project in the Vercel dashboard to halve deploy
load and stop re-tripping the limiter (requires dashboard access; no
CLI/token available in the working environment).
