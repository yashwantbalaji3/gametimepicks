# Sprint 036 — Productization Review

**Date:** 2026-07-28 · **Branch:** `june30-reset` · **Baseline:** `7d96f5a7` (rebased onto `origin/main`)

Thesis under test: **sports research terminal** — explain what the market says, what simulation says,
how they compare, what happened historically, and where the methodology succeeded or failed.

---

## Phase 0 — verification

Bot drift this cycle was **not** archive-only: two `nightly-settle` commits touching 54 files including
the settled ledger. Money was checked *before* rebasing — `portfolio.json` and the BB lock untouched,
and the hash at `origin/main` identical. Rebased clean.

| Check | Result |
|---|---|
| Suite | 3134 → **3143** tests, 3139 pass, **0 fail**, 4 skip |
| tsc / build / e2e | clean / clean / **39 passed, 0 failed** |
| Money · BB lock | `affe6b21…` · `cb80473f…` unchanged |
| `vp/` | zero files in any commit |

**The ledger grew overnight: 22,155 → 22,660 rows, 49 → 50 dates.** That turned out to matter — see
the caption-drift finding below.

---

## Phase 1 — surface audit

Measured by inbound-link count across `src/app` + `src/components`.

**KEEP** (supports the terminal): `/`, `/today`, `/markets`, `/games/[sport]/[gameId]`, `/results` +
`/results/model-audit`, `/simulate`, `/mlb`, `/learn`, `/methodology`.

**REWORK**: `/sports` and `/about` are each linked from exactly **one** file (nav / command-rail
respectively) — real content with no path to it. `/board` is reachable only from sport hubs and from
`/trends`, which itself has zero inbound links.

**RETIRE — zero inbound links from anywhere** (10 routes): `/trends`¹, `/homer-nukes`,
`/nba/power`, `/nhl/power`, `/ipl/power`, `/mlb/parlays`, `/nhl/parlays`, `/ipl/parlays`,
`/results/nhl`, `/results/ipl`. Plus `/preview/june20`, a stale dated internal preview.

¹ `/trends` is deliberately kept despite zero inbound links: `navigation.spec.ts` documents it as
soft-retired and asserts it still responds so external links do not break. **Not a delete candidate** —
this is exactly the "do not delete blindly" case.

**53 orphaned components** are imported by no page — including a whole abandoned homepage generation
(`home-hero`, `homepage-command-hero`, `homepage-trending-tabs` at ~600 lines) and 11 Bank Builder
components. Static-import analysis; no `next/dynamic` usage was found for any of them.

---

## Phase 2 — the daily loop

| Slot | Exists today | Missing |
|---|---|---|
| Morning brief | ✅ `buildDailyBrief` → `/today` | **Delivery.** It is a page you must remember to visit. |
| Market overview | ✅ `/markets`, Sprint 032 coverage panel | Second book; movement |
| Slate | ✅ `slateGames` + availability contract | — |
| During games | ⚠️ freshness + event phase | No movement, no in-game update |
| After games | ✅ 22,660-row ledger, `/results/model-audit` | Not the front door it deserves to be |

The components exist. **What is missing is the loop, not the content** — nothing brings a user back,
and nothing records whether they came.

---

## Phase 3 — retention architecture

Arithmetically nothing. Dependencies are exactly `next`, `react`, `react-dom` — no auth package exists
to remove. **One** storage key in the entire app: `gtp_src` in `sessionStorage`, an analytics
once-per-session guard that dies on tab close. No accounts, no saved teams, no watchlist, no
preferences, no notifications, no service worker.

**The email form discards emails.** `/board` is the only route rendering it; with
`NEXT_PUBLIC_BUTTONDOWN_USERNAME` unset the provider resolves to `"none"` and `submitNewsletter`
returns `{ok: true, mode: "captured_locally"}` **without storing anything**. The user-facing message is
honest ("aren't live yet"); the internal field name is not, and will mislead the next reader.

A `return_visit` event type and a five-bucket `RETURN_COHORTS` taxonomy are defined — with no emitter
and no persistent store capable of computing a cohort.

---

## Phase 4 — market research engine

| Asset | State |
|---|---|
| Team markets | 10 files, 07-09→07-27. **One book (DraftKings)**, and the schema cannot express a second — `bookmaker` is a single top-level scalar |
| Player props | 24 files, **8 providers**, 26,815 rows. Multi-book ready today |
| Capture cadence | ~15/day since 07-22, 104 capture dirs |
| **Retained payloads** | **2 of 104.** `raw.json`/`normalized.json` gitignored; 102 already gone |
| Manifest timestamp | **Was absent — fixed this sprint** |
| Movement reconstruction | Only accidentally, via git revisions of a regenerated-in-place public file: 2–5 coarse snapshots/day, one book, no per-row times |

Two further constraints worth naming: CI caps player-prop capture at **3 events/day** even when the var
is unset (asserted as intended in `mlb-pregame-ci-enablement-guards.test.mjs`), so 8 of 11 games get no
prop capture; and `settlement-joins`, though committed and timestamped, are **not** a movement source —
only 6 of 10,764 selection keys have more than one `capturedAt`, and they drop `bookmaker` entirely.

> **The blocker is a one-line retention decision, and it is losing history daily.** The pipeline
> captures exactly what a movement feature needs and deletes it.

---

## Phase 5 — Bank Builder / Moonshot

Sprint 035 reworded both; neither was restructured. **Verdict: PAUSE, do not delete.**

- Ledger integrity, settlement and audit trail are sound and must be preserved.
- Language is now honest — Moonshot states its lifetime **0–7** outright; Bank Builder frames itself as
  a historical record on ten winning legs.
- What remains is a product question, not an engineering one: whether a 0–7 product keeps a nav slot.

---

## Phase 6 — analytics

Complete, tested, documented — and **has never transmitted a byte**. Five event types, all derived from
four path patterns. Eight of thirteen declared events have no emitter.

Zero instrumentation on: `/` (top of funnel), **`/simulate` (the primary nav CTA and core action)**,
`/markets`, `/picks`, `/build`, `/bank-builder`, `/moonshot`, `/mr-dub`, and every sport hub except
`/mlb`. Even fully switched on, today's setup would report page views and nothing about research
behaviour.

Activation is two build-time env vars — and because `NEXT_PUBLIC_*` is inlined under static export,
flipping them requires a rebuild, not a runtime toggle.

---

## Phase 7 — what shipped

### `0d3a12bd` — a stale public settle rate now fails the build

Sprint 035 put measured settle rates into the confidence captions. **They drifted in one night**:
Category C moved 51.7% → 51.0%, and the Sprint 035 guard kept passing because it asserted the *string*
rather than the *data*. A public claim left truth inside 24 hours, invisibly — the same green-but-wrong
shape this codebase keeps surfacing, this time self-inflicted.

The caption is corrected, and a new guard streams the ledger, recomputes all three rates, and fails on
>0.5pp drift with a message naming the tier, both numbers, n, and the fix. It also asserts the
*ordering* the captions claim (A below C) against live data — so if that ever flips, the captions are
caught being backwards and the Sprint 035 ranking decision gets revisited on new evidence. The
hardcoded rates were removed from the Sprint 035 test: duplicating a number in both the claim and its
guard is what allowed the drift.

### `9d6f137e` — capture timestamps + redirect-stub links

- `capturedAt` stamped onto the **committed** manifest in both capture scripts. Reported honestly:
  0/104 existing manifests carry it, climbing from the next capture.
- 13 internal links no longer bounce through a redirect stub, including four "All games" links on the
  game report. The stubs themselves are kept and guarded — they exist for inbound links we don't
  control. The guard caught one link my own grep missed (trailing slash) and its mutation test verifies
  it doesn't over-match `/games/mlb/<id>`.

---

## Roadmap

### 30 days — stop losing data, start seeing users

| | Impact | Effort | Risk removed |
|---|---|---|---|
| **Decide market-payload retention** | Critical | S (decision) + M (impl) | History lost daily; 102/104 already gone |
| **Activate analytics** (2 env vars) | Critical | XS | Every later decision is a guess |
| Instrument `/simulate` and `/markets` | High | S | Core action is invisible |
| Raise the 3-event prop cap | High | XS | 8 of 11 games uncaptured daily |
| Retire the 10 zero-inbound routes (**not** `/trends`) | Medium | S | Maintenance drag |
| Rename `captured_locally` | Low | XS | Misleads the next reader |

**Founder decisions:** where payloads live (object storage vs. compacted daily roll-up); analytics
endpoint; `OPS_WEBHOOK_URL`; `VERCEL_DEPLOY_HOOK_URL`.

### 90 days — become a terminal

Second sportsbook for team markets (**requires a schema change** — `bookmaker` is a scalar today);
market-movement timeline built on retained captures once a real series exists; promote
`/results/model-audit` to a first-class destination; anonymous personalization (saved teams in
`localStorage`, no accounts); delivered morning brief.

Order matters: **retention → series → timeline.** A movement UI built before the series exists would be
a UI over two accidental git revisions.

### 6 months — earn the harder claims

Closing-line research; multi-book disagreement as a first-class signal (defensible with *no* edge
claim); accuracy dashboards per market and per book; accounts **only** if saved state demonstrably
drives return visits — which is unanswerable until analytics runs.

### Risks

1. **Every day the retention decision waits, a day of captures is unrecoverable.** Highest-cost delay
   on the board.
2. **No measurement means no feedback loop.** Retention work would ship blind.
3. **Single-book team markets make "the market" unfalsifiable** — it means DraftKings.
4. **Nothing is in the automation path**: cron only runs the default branch, and this work sits on
   `june30-reset`, 12 commits ahead of `main`.
