# Product Requirements

Per-surface behavior and the honesty rules each surface must uphold. This
reflects the live product as of main `5a1777d` (2026-06-02).

## Global rules (apply everywhere)

- **No fabrication**, **no unsupported-sport picks**, **no same-slate
  contamination**, **no public-era (May 25/26) leakage**, **no
  guaranteed/target hit-rate copy**, **no banned betting copy** (see
  `PROJECT_OVERVIEW.md`).
- Honest empty states are always acceptable and preferred over fabricated
  or padded content.
- Gold/vault brand throughout; mobile-first, no horizontal overflow at
  375px; no console errors.

## Home (`/`)

- Persistent **status bar** (today · active slate + settled/pregame · latest
  settled · `$100 paper`) — values read from real loaders, never fabricated.
- **"Where do you want to start?"** five path cards: Straight Bets,
  Suggested Parlays, Build Your Own, Bank Builder, Results (honest live
  status where cheap, e.g. slip count, latest-settled date).
- **Featured slip** (the model's headline slip; honest settled/pending
  chip).
- **Compact Suggested-parlays preview** (≤2 real cards + CTAs to
  `/parlay-lab#suggested` and `#build`). The **full builder lives on
  `/parlay-lab`, not Home**.
- **Sports coverage** module + **Track record** / **Bank Builder** modules.
- Mobile ordering: status → path cards → featured → bank builder → sports
  coverage → suggested preview → track record → guided → newsletter.

## Straight Bets / Projections (`/projections`)

- Single player-prop **projections** (NBA + MLB only), framed as **"Straight
  bet recommendations … single player-prop projections, not parlays."**
- Pick a game → review the model's projected line + edge per player.
- Honest date/empty states: when today's board hasn't posted (clock-gated
  to the morning run) or no games are scheduled, show `0/0` with the
  explanation "board posts each morning" and fall back to the latest slate.
- **Actionable vs prop lines (PR 1, 2026-06-02):** the "projections" count is
  **actionable projections only** (real projection + Over/Under). Posted lines
  with no model projection yet (`projection: null` / `insufficient_data` /
  `Pass`) are counted + labelled as **prop lines**, never "projections". The
  default date prefers the **latest actionable slate** over a future
  props-only board ("Latest actionable slate — not today's picks"); a future
  props-only board reads "Upcoming slate — lines posted, projections pending".
  Gated by `app/src/lib/projection-availability.ts`.
- A pointer states only NBA/MLB are modeled; other leagues → Sports &
  Events.

## Suggested Parlays (`/parlay-lab#suggested`)

- Model parlays grouped into **Low / Medium / High / Longshot** sections by
  **combined odds + leg count** (this ordering is honest by the math of
  combined odds; it is **not** a per-leg quality claim).
- **Volume discipline (PR #241):** the published set is capped — Low 3,
  Medium 3, High 2, Longshot 1; total ≤ 9; and per-player ≤2 / per-market
  ≤4 / per-game ≤3 exposure across the published set. Sections may be
  **empty** (honest empty copy) rather than padded. This is an
  anti-overpublishing policy, **not** a hit-rate claim. See
  [`VOLUME_DISCIPLINE_2026-06-02.md`](./VOLUME_DISCIPLINE_2026-06-02.md).
- **Empty-section clarity (PR 2, 2026-06-02).** A compact summary sits above
  the sections ("N cards across M of 4 risk sections · K empty after filters ·
  sections are not padded"). Empty High/Longshot sections render a **compact**
  one-line honest reason ("No qualifying … parlays after sport, variety, and
  volume filters. Sections are not padded.") with the section header kept — not
  a full-width block. **Sections are never padded and no cards are fabricated;
  odds bands and optimizer output are unchanged.** Copy never implies the shown
  cards are likelier to win. Helpers: `getRiskSectionDisplaySummary` /
  `getEmptySectionReason` in `parlay-risk-sections.ts`.
- Hash deep-links (`#suggested` / `#build` / `#bankroll`) drive the active
  mode; back/forward + the rail stay in sync.
- **Single-sport only (enforced).** Official Suggested Parlays are
  **individual-sport** — never cross-sport ("mixed"). Mixed-sport belongs in
  Build Your Own only. Enforced by
  [`app/src/lib/sport-capabilities.ts`](../app/src/lib/sport-capabilities.ts)
  (`filterOfficialSuggestedSlips` / `filterOfficialSuggestedSections`), wired
  into the Suggested surface (PR B): the **"Mixed" sport pill is removed**, and
  every Suggested section — including the **"All" tab** (the union of
  single-sport official slips) — drops mixed-sport cards. The same official
  filter feeds the **Home** suggested preview/featured/guided and the **Bank
  Builder** pool. Build Your Own keeps mixed-sport (modeled sports only).

## Build Your Own (`/parlay-lab#build`) + Build My Card

- **Build a Parlay flow (PR 3, 2026-06-02).** Header reads **"Build a Parlay"**
  with status chips **Custom · Modeled sports only · Not officially tracked**
  and a modeled-only note ("Schedule-only sports do not have model legs yet").
  A clear **build-type switch — Quick Generate / Manual Build** — renders only
  the selected tool (no longer two stacked tools). The DNP-risk toggle lives
  under **"Availability filters"** (advanced), not the primary path.
  `edgePct`/`confidence` are de-emphasized on leg displays (non-predictive per
  #240) in favor of factual sport/team/price. Config: `build-a-parlay-config.ts`.
- Custom slip construction from the same real leg pool; framed as
  exploratory and **not officially tracked**.
- **Mixed-sport allowed here only.** Build Your Own may combine legs across
  modeled sports (NBA+MLB) — this is the *only* surface where cross-sport
  slips are permitted. **Leg-level gating is enforced (PR C):** the Build
  Your Own candidate pool (`getLegPool` in `custom-parlay.ts`) runs every leg
  through `canUseLegInBuildYourOwn`/`filterBuildYourOwnLegs`, so a
  schedule-only / coming-soon / unknown / missing-sport leg can never be
  selected (fail-closed). Both the custom generator and the manual builder
  draw from this single gated pool. Mixed customs stay **untracked** and never
  enter official Results (until a real save/track/grade pipeline exists).
- **Build My Card** (selectable slips tray) works in Suggested mode; shows
  stake + projected payout. It never invents legs.

## Bank Builder (`/bank-builder`)

- **Paper-only / educational** `$100 → $3,000` ladder. Disclaimers top +
  bottom; never real-money advice; resets to base on a loss (always shown).
- Picks a single pending, fully-unsettled slip near **+100** from the
  **official** (single-sport, no mixed) published pool; **never shows a settled
  slip** as today's pick; **never forces a card**.
- **Eligibility transparency (PR 4, 2026-06-02).** A panel states the criteria
  (official cards only · pending & fully unsettled · priced near +100 ·
  recent-form shown · no forced card). When none qualifies, the empty state
  lists the **specific** honest reason (no pending cards / none near +100 /
  etc.) via `diagnoseBuilderPool` — never "nothing is good enough to win".
- **Recent-form (L10) transparency.** Each leg shows its **L10** (recent games
  that cleared the line, from real `recentSeries`; enriched from the optimizer
  legPool when the snapshot omits it). L10 is **display + a soft ranking
  tie-breaker only — never a win-rate/performance claim**, and **no hard
  ≥70/80 gate** is applied (it would starve candidates, per the #249 audit).
  `edgePct`/`confidence` are **not** used. Helpers: `recent-form.ts`,
  `bank-builder-eligibility.ts`.

## Results (`/results`)

- Settled track record, **public-era only** (from `2026-05-27`). **May 25/26
  never leak.** Latest-settled date shown honestly (currently `2026-06-01`).
- Hit rate counts only finished slips; pending/pushes shown separately.
  Framed "saved before games and graded after."
- Never force-grade; never settle a future/in-progress slate.

## Sports & Events (`/events`)

- Coverage hub: a badged card per league — **Projections + Parlays**
  (NBA/MLB) / **Schedule only** (NHL/WNBA/UFC/FIFA/IPL/MLS) / **Coming
  soon** (EPL). Mobile-first board with category filters + next-event +
  source attribution.
- Schedule-only leagues show **schedule only** (dates/matchups/venues), with
  source name + URL + `retrievedAt` + range. **No odds/projections/
  parlays/results** for unsupported sports. Coming-soon leagues link
  nowhere (no fabricated schedule). See
  [`SPORTS_COVERAGE_POLICY.md`](./SPORTS_COVERAGE_POLICY.md).

## Navigation

- **Desktop:** Command Center left rail (Home, Straight Bets, Suggested
  Parlays, Build a Parlay, Bank Builder, Results, **Sports & Events**,
  About), grouped, with hash-aware active highlighting for the two parlay
  modes.
- **Mobile:** top scrollable strip + a 5-item bottom nav (Home,
  Projections, Parlay Lab, Results, **Sports**); schedule-only routes
  highlight Sports.

## Empty-state requirements

- Name *why* a section/surface is empty without implying alternatives that
  don't exist; no banned copy; no claim that fewer cards means a higher win
  rate.
