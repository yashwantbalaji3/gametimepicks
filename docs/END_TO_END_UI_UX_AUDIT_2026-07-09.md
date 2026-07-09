# End-to-End UI/UX Audit (2026-07-09)

Mission Phase 8. Audited the built July-9 static export (237 HTML pages) — the exact
artifact that deploys — plus a mobile (375px) render pass. Money untouched
(`affe6b21…`, 19-14). Scope: navigation, buttons/CTAs, logos, NaN/overflow, mobile.

## Summary

| Dimension | Result |
|---|---|
| Broken internal CTAs (404s) | **1 found → fixed** (see below); re-scan of all 237 pages = **0** |
| Visible NaN / undefined / null | **none** on any audited page |
| Horizontal scroll on mobile (375px) | **none** (`/`, `/today` measured: scrollWidth == 375, 0 overflowing elements) |
| Team logos / imagery on key pages | **present** (`/`, `/today`, `/simulate`, `/games`) |
| Primary nav reachability | all 4 flagship CTAs present on Home (Simulate · Today's Picks · Bank Builder · Results) |
| July-9 freshness | Home + Today + Simulate render the July-9 slate |

## Fix applied (severity: low, but a real 404)

**Broken CTA `→ /results/date/2026-05-24`** on the May-24 MLB board archive page.
`BoardDateStatusBanner` rendered a "view settled results" link whenever
`state === "settled"`, but `/results/date/[date]` is statically generated only for
NBA-settlement ∪ MLB-result dates — and May-24 has neither (no settled leans that
slate). The link 404'd.

- **Fix:** the banner now gates the link on `resultsDateRouteExists(date)` — the
  exact same date set (`getAvailableSettlementDates()` ∪
  `getMlbAvailableResultDates().dates`) that `generateStaticParams` builds from. A
  settled board date with no results route no longer renders a dead link.
- **File:** `src/components/board-date-status-banner.tsx`.
- **Verified:** full re-scan of all 237 built pages → **0 broken internal links**;
  suite 1892 green, tsc clean, money md5 unchanged.

## Verified good (no change needed)

- **Simulator gating** (Phase 3 / previous chunks): July-9 MLB game-detail pages
  paint the Generate CTA + locked-preview pills only; **zero** moneyline / report /
  distribution leak in the pre-click DOM; runCount honest (now 10,000).
- **Nav labels** are clean and consistent (Build-a-Pick / Longshot Lab / Daily
  Dashboard / Soccer Specials) across nav, command rail, footer, mobile.
- **Banned copy**: the visible "safe" / "lock" strings that surfaced on the July-9
  no-play state were fixed this session (BB skipped-card, specials, Top-10 tab,
  Moonshot rungs → low-risk / Reliable / bank).
- **Honest empty/off-season states**: `/nba` ("No NBA games on the active slate"),
  `/ufc` ("Awaiting … lines"), thin-WC-day window auto-widen — no product is made to
  look active.

## Deferred (owner decision / larger scope — not overnight)

1. **Full-game dashboard "Game Center"** (moneyline / score / total / run-line /
   team totals): blocked on a team-odds ingest + market-implied generator — see
   `docs/SIMTHEGAME_PARITY_MATRIX_2026-07-09.md`. Not faked; the artifact declares
   the unsupported modules honestly.
2. **Interactive Generate → dashboard flow** could not be exercised in-browser this
   pass (the preview harness serves `next dev`, which 500s on `output:export`
   dynamic game-detail routes; the static build is verified by file + tests). A full
   click-through belongs on a real static-served browser session.
3. **Legacy board archive pages** (`/board`, `/projections`, `/events`) — demote /
   redirect candidates per `docs/INTERNAL_LEGACY_ROUTE_AUDIT_2026-07-09.md` (owner-gated).
