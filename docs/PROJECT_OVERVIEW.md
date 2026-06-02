# Project Overview

## What GameTime Picks is

GameTime Picks is an **educational sports-statistics web product**. It
publishes model-generated **player-prop projections** ("Straight Bets") and
**model parlays** for the sports it actually models (today: **NBA and
MLB**), tracks every published pick against official box scores, and
surfaces a transparent **Results** record. For sports it does **not** model,
it shows **schedule-only** information (or an honest "coming soon"), never
odds/projections/picks.

- **Production URL:** https://gametimepicks.yashwantbalaji.com
- **Vercel projects:** `gametimepicks` (authoritative deploy gate) +
  `gametime-picks` (legacy duplicate).
- **Repo path convention:** `/Users/yashwantbalaji/Downloads/gametimepicks`
- **Frontend:** Next.js static export (`output: "export"`,
  `trailingSlash: true`) under `app/`.
- **Pipeline:** Python under `pipeline/`, run by GitHub Actions; writes
  generated JSON into `app/public/data/`.

## Core product paths (the five clear paths + sports hub)

1. **Straight Bets / Projections** — `/projections` (single player-prop
   projections; NBA + MLB).
2. **Suggested Parlays** — `/parlay-lab#suggested` (model parlays in Low /
   Medium / High / Longshot risk sections).
3. **Build Your Own** — `/parlay-lab#build` (custom slip builder + "Build My
   Card").
4. **Bank Builder** — `/bank-builder` (paper-only educational $100→$3,000
   ladder).
5. **Results** — `/results` (settled track record, public-era only).
6. **Sports & Events** — `/events` (coverage hub + schedule-only leagues).

Home (`/`) is a dashboard: status bar, a "Where do you want to start?"
5-path launcher, a featured slip, a compact suggested-parlays preview, a
sports-coverage module, and track-record / bank-builder modules.

## Current live state (verify before trusting)

- **Latest settled slate:** `2026-06-01` (the June-1 public result was
  **1W / 47L** at the slip level — tracked honestly, never hidden).
- **Public-era start:** `2026-05-27` (`PUBLIC_PARLAY_RESULTS_START_DATE`).
  **May 25/26 must never leak** into public hit rates.
- **Modeled sports (projections + parlays):** NBA, MLB.
- **Schedule-only sports:** NHL, WNBA, UFC, FIFA World Cup, IPL, **MLS**.
- **Coming soon:** **EPL** (no sourceable fixtures yet).
- **Bank Builder:** paper-only / educational; never real-money advice.
- **Current main at last canonical-docs authoring:** `5a1777d`
  (2026-06-02). Re-verify with `git rev-parse HEAD`.

## Core trust principles (non-negotiable)

1. **No fabricated data** — no fake schedules, matchups, odds, projections,
   parlays, results, recent-form, or hit rates.
2. **No unsupported-sport picks** — only NBA/MLB get odds/projections/
   parlays/results; everything else stays schedule-only or coming soon.
3. **No same-slate contamination** — a slate's own results are never used
   to alter that slate's pregame picks; a slate is never settled before its
   games are final.
4. **No public-era leakage** — May 25/26 internal data never appears as
   public performance.
5. **No performance promises** — never claim or imply a guaranteed/target
   hit rate (e.g. "70%"). Per the 2026-06-02 calibration audit, the model's
   `edgePct`/`confidence` are not predictive; the product leans on
   discipline + honesty, not edge claims.
6. **Preview branches #213/#214/#215** stay draft/unmerged/untouched unless
   explicitly instructed.
7. **Stale PRs #1/#2/#4/#5** stay open; do not close unless instructed.
8. **Merge gate:** real `Vercel – gametimepicks` SUCCESS + `mergeStateStatus
   = CLEAN`, squash-merge, sync main after every merge.

## Hard banned user-facing betting copy

Never use, in any user-facing string:
`lock`, `guaranteed`, `free money`, `risk-free`, `can't miss`, `cant miss`,
`easy win`, `easy money`, `no-brainer`, `no brainer`, `sure thing`,
`sharp money`. Avoid user-facing **"safe" / "safety"** except the CSS token
`safe-area-inset-bottom`. Use "lower-variance", never "safe".

*See [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) for per-surface
behavior and [`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md)
for the honest risk register.*
