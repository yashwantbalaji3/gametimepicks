# GameTimePicks Handoff — 2026-05-28

> Detailed end-to-end handoff so a fresh Claude Code session can
> continue without reading the prior chat transcript. Written
> 2026-05-28 ~13:30 ET by Claude Opus 4.7 (1M context) at the end
> of a long multi-PR session.

---

## 1. Current repo / production state

| Item | Value |
|---|---|
| Local `main` SHA | `9d44510` |
| `origin/main` SHA | `9d44510` (in sync) |
| Production SHA | `9d44510` (verified — `/parlay-lab` slate strip reads "Thu · May 28") |
| Working tree | **clean** (no tracked modifications) |
| Current branch | `main` |
| Canonical Vercel URL | https://gametime-picks.vercel.app |
| Deprecated alias | https://gametimepicks.vercel.app (kept alive but not the canonical) |
| Current date/time context | 2026-05-28 (Thursday) — `currentEtDate()` returns `"2026-05-28"` |

### Open PRs (all stale / unrelated — do NOT touch unless user asks)

| # | Title | Branch | Note |
|---|---|---|---|
| 1 | Hide admin operator status from public board | `fix/hide-admin-status-on-board` | Pre-existing from May 8 |
| 2 | Fix auto-refresh workflow YAML syntax | `fix/auto-refresh-yaml` | Pre-existing from May 8 |
| 4 | Remove public operator leaks from board badge and home callout | `fix/public-status-leaks` | Pre-existing from May 12 |
| 5 | Stop dry-run auto-refresh from clobbering real-prop boards | `fix/dry-run-clobber-guard` | Pre-existing from May 12 |

All four predate this session's work by ~3 weeks and the user has not asked about them. Leave alone.

### Untracked local files to IGNORE

The repo root has ~45 `SESSION_HANDOFF_*.md` / `SESSION_PROGRESS_*.md` / `SESSION_PLAN_*.md` / `POSTMORTEM_*.md` markdown files (always shown by `git status` as `??`), plus a `.claude/` directory, an `app/.claude/` directory, and `gametime-picks-logo.png`. These are stable; do not commit, do not delete, do not stage them.

This handoff file itself (`HANDOFF_2026-05-28_GAMETIMEPICKS.md`) is the only intentional addition to the repo root.

---

## 2. Business / product context

**GameTimePicks** is an educational sports-prop analytics web app. The product:

- Computes daily player-prop **projections** for NBA and MLB games
- Builds **suggested parlay slips** in three safer lanes (Conservative / Balanced / Star Power) + a hidden-by-default Longshot/Aggressive lane
- Allows users to **build their own custom parlays** from the same leg pool, with an informational A/B/C/D/F grade
- **Publicly tracks** the suggested parlays' performance — every official suggested slip is saved before games and graded after
- Surfaces a **daily projection-level audit** distinct from the parlay-level track record

### Currently supported sports
- **NBA** (active)
- **MLB** (active)

### Historically supported but currently DISABLED
- **Cricket / IPL** — removed in PR #113. Stays out.
- **WNBA** — deferred. Do not activate.
- **NHL** — provider pending; sport tab shows as "pending" only.
- **World Cup** — schedule/info pages exist but not actively projected.

### Public parlay tracking era
- **Starts 2026-05-27.** Pre-era slips (5/25, 5/26) stay on disk as internal archive but are filtered out by `app/src/lib/parlay-results.ts` so they never appear on public surfaces.
- **May 26 "retrospective replay"** was an explicit one-shot experiment; removed entirely (data files + loader + UI component deleted). Do not restore.
- **Projection audits** are allowed to show prior dates because they track per-prop accuracy, not parlay W/L.

### User's current product feedback (anchor for next work)
The user wants a polished, professional sports-analytics product — not a developer dashboard. Six concrete UX problems remain on `/parlay-lab` as of `9d44510`; see §8 + `docs/PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md` §3.

---

## 3. Absolute hard rules

### Do NOT
- Fabricate projections, results, odds, props, parlays, hit rates, or stats
- Manually edit settled outcomes
- Use final outcomes to alter today's suggestions
- Reintroduce the May 26 retrospective replay
- Reintroduce May 25/May 26 public parlay hit rates
- Mix replay data into official public tracking
- Bring cricket back
- Activate WNBA
- Expose or print the Odds API key (only via `${{ secrets.ODDS_API_KEY }}` in workflows)
- Commit secrets to the repo
- Scrape sportsbook sites
- Add fake sportsbook deep links or affiliate links
- Copy FanDuel/DraftKings exact branding, layout, color scheme, copy, logos, or user flow
- Make betting-certainty claims
- Start consuming the confirming-signals policy in the optimizer (file exists but `consume-confirmed-policy-in-optimizer` is gated — explicit user approval required)
- Merge a PR without passing the full 13-point gate (tests + build + browser desktop+mobile + banned-copy + cricket/WNBA/IPL + secret-exposure + pre-era leak + replay + production verify)

### Banned copy list (case-insensitive, word-boundary)
- `lock`
- `guaranteed`
- `free money`
- `risk-free` (and `risk free`)
- `can't miss` (and `cant miss`)
- `easy win`
- `easy money`
- `no-brainer` (and `no brainer`)
- `sure thing`
- `sharp money`

### Allowed
- Use existing NBA/MLB pipeline scripts
- Use paid Odds API via the existing workflow + credit guard (default `MIN_REMAINING=300`)
- Redesign UI aggressively (the dark theme is the current direction)
- Run settlement/grading scripts for completed slates
- Remove dead code
- Add tests
- Auto-merge a PR only when ALL 13 gates pass

---

## 4. Major completed PR timeline

Numbers and titles below are pulled from `git log` and `gh pr list --state merged` on `9d44510`. Where the prompt template differs from history, history is the source of truth.

| # | Title | Merge SHA | What changed |
|---|---|---|---|
| 114 | (per template — verify with git log; may be `chore/projections-parlay-filters-cleanup` or similar) | n/a in current 30-day log | Projections / parlay filters / recent form / results audit cleanup. Pre-this-session. |
| 115 | Custom parlay generator + DNP guard + methodology docs | n/a in current 30-day log | Generates 1-5 custom slips from the same leg pool. Pre-this-session. |
| 116 | recentGames metadata + newest-first drawer fix | n/a | Pre-this-session. |
| 117 | Daily audit automation | n/a | Pre-this-session. |
| 118 | Audit signal policy | n/a | Pre-this-session. Writes `app/public/data/audit/policy.json` with confirming-days window. |
| 119 | Remove cricket JSON from morning projections | n/a | Pre-this-session. |
| 120 | Wire `snapshot_optimizer` into morning projections | n/a | Pre-this-session. Without this, no morning auto-generation of suggested parlays. |
| 121 | Cap `attach_recent10` wall-time | n/a | Pre-this-session. `ATTACH_RECENT10_TIMEOUT=8m`. |
| 122 | May 26 retrospective replay (later removed) | `d6c0e35` | Pre-this-session. Removed by PR #131. |
| 123 | Prop expansion + UI audit docs | `0c66e03` | Pre-this-session. |
| 124 | Date clarity / status header foundation | `19e03ad` | Pre-this-session. `DateStatusHeader` component. |
| 125 | Slip clarity / date chips on each card | `1ce4839` | Pre-this-session. Added `aria-label="Slip context"` chip row. |
| 126 | Reset public parlay tracking from May 27 | `1c9c3a5` | Pre-this-session. `--gtp-*` token foundation (light values, since-superseded). |
| 127 | Diversify MLB suggested slip markets | `175e17e` | Pre-this-session. Per-profile market allowlists + market-recurrence penalty. |
| 128 | Sportsbook-style navigation foundation | `ac05e87` | Pre-this-session. Desktop sports rail + mobile bottom nav. |
| 129 | Premium gold theme pilot | `ab794ab` | Pre-this-session. Cream `data-theme="premium-gold"` (later reverted). |
| 130 | Custom parlay grading scale | `493bc32` | Pre-this-session. A/B/C/D/F grade card. |
| 131 | Settle May 27 MLB slate + no pre-era leak loader fix | `2d0ea27` | This-session. **18 files**, settled 9W·21L·30.0%. |
| 132 | UI rebuild direction doc | `a04c8ed` | This-session. `docs/UI_REBUILD_DIRECTION_2026-05-28.md`. |
| 133 | Hybrid / dark theme rebuild | `a8c2520` | This-session. Removed premium-gold pilot from `<html>` root; introduced `.gtp-canvas` light scope. |
| 134 | Parlay Lab readability bump | `f759552` | This-session. Chip font 9→11px, contrast lifts. |
| 135 | Results page cleanup / canvas | `e628e1e` | This-session. `/results` rendered on `.gtp-canvas` (later reverted). |
| 136 | Design system reset / unified dark | `b019009` | This-session. Reverted hybrid/cream pilot. Body unified dark; `--gtp-card: #161E3E` charcoal. Nav 155→58px. |
| 137 | Slate strip collapse / first slip above fold | `83643ae` | This-session. Replaced 120px DateStatusHeader card on `/parlay-lab` with 45px `<SlateStrip>`. First slip Y: 998→629. |
| 138 | Workflow `skip_nba` / `skip_mlb` inputs | `a9c427d` | This-session. Adds dispatch-time switches to route around upstream NBA stats API outages. |
| 139 | Parlay Lab product audit doc | `e7a888e` | This-session. `docs/PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md` (155 lines). Side effect: first non-`[skip ci]` commit since auto-data, triggered Vercel rebuild. |
| 140 | Page prefers today's optimizer over legacy fallback | `9d44510` | This-session. Loader-priority fix so `/parlay-lab` renders today's slate when the morning workflow only writes the new optimizer format. |

Auto-commits visible in `git log`:
- `df0eb79` — `auto: morning projections 2026-05-28 12:59 ET [skip ci]` (today's MLB-only re-run output)
- `95b7f47` — `auto: nightly settle 2026-05-28 06:43 ET [skip ci]` (this morning's settle of May 27)

> **Note:** `[skip ci]` auto-commits do NOT trigger Vercel rebuilds. Any data refresh needs to be paired with a real code/doc commit (or a manual Vercel redeploy) to surface in the static HTML.

---

## 5. Current data state

### May 27 — settled, public-live
- **MLB projections**: 354 decisive · 174W · 180L → **49.15%** projection-level hit rate
- **Public parlays**: 32 unique slips → **9W · 21L · 0 pushes · 2 pending · 30.0% hit rate on 30 decisive**
- **By profile** (post-era only):
  - Conservative: 6W · 1L · 1 pending → **85.7%**
  - Balanced: 0W · 8L → 0.0%
  - Star Power: 3W · 4L · 1 pending → 42.9%
  - Aggressive: 0W · 8L → 0.0%
- **By sport bucket**: MLB-only 9W · 21L · 30.0%. NBA / Mixed empty (no NBA games on 5/27).
- **Audit signal policy**: 3/3 confirming days reached; `longshotKeepCollapsed` confirmed=`False` (policy file written, NOT consumed by the optimizer).
- All visible on `/results` production page. No pre-era 5/25 / 5/26 leak.

### May 28 — live
- **MLB board** (`app/public/data/mlb/boards/2026-05-28.json`): 6 games, 259 leans. Markets: `batter_hits: 107`, `batter_hits_runs_rbis: 107`, `batter_total_bases: 32`, `pitcher_strikeouts: 13`. Generated 12:59 ET today.
- **NBA board** (`app/public/data/boards/2026-05-28.json`): 1 game, 91 leans. Generated 2026-05-27 19:17 UTC (yesterday's morning run). Today's NBA pipeline was skipped via `skip_nba=true` due to `stats.nba.com` timeouts.
- **Optimizer** (`app/public/data/parlays/optimizer/2026-05-28.json`): **64 total slips**, sourcePools `{nbaCount: 91, mlbCount: 259}`, legPool 163.
  - Profile distribution: Conservative 16 · Balanced 16 · Aggressive 16 · Star Power 16
  - Sport buckets: **MLB-only 32 · All 32** (Mixed empty — only 1 NBA game means optimizer can't satisfy multi-sport profile constraints)
  - Visible-slip market mix: **71.9% hits / 24.0% total_bases / 4.2% H+R+RBI** (PR #127 diversity logic working — similar to 5/27)
- **Optimizer-graded for 5/28**: does NOT exist (games haven't finished yet — settle/grade runs tonight).
- **Daily audit for 5/28**: does NOT exist (depends on grading).
- **Auto-commit `df0eb79`** confirmed in `git log`.

### What `/parlay-lab` should display on production
- Slate strip: **"Thu · May 28 · 64 slips · NBA 0 · MLB 32 · Mixed 0 · TODAY"**
- 15 visible suggested slip cards (3 lanes × ~5 visible cards) with `aria-label="Slip context"` chips
- Today's optimizer is in use (verified post-PR #140)

### What `/results` should display on production
- Hero "Suggested parlay results."
- Fresh-era status block "Public parlay tracking era · Fresh tracking era · starts 2026-05-27 · NEW ERA"
- DailyAuditBanner: "DAILY MODEL AUDIT · 2026-05-27 · 9W · 21L · 2 pending · 30.0% hit rate (32 slips)"
- Lifetime + by-profile + by-sport tiles all showing May-27-only post-era data
- Per-date section for 2026-05-27 with winning slips · missed slips · pending breakdown
- **Zero** pre-era 5/25 8W·42L · 16.0% or 5/26 references
- Audit-pointer card with NBA audit / MLB audit pills

---

## 6. Data / pipeline operational notes

### Workflows
| Workflow | File | Schedule | Purpose |
|---|---|---|---|
| Morning projections | `.github/workflows/morning-projections.yml` | `30 13 * * *` (UTC; ≈ 09:30 ET) | Refresh NBA + MLB boards + run snapshot_optimizer. Paid Odds API calls. |
| Nightly settle | `.github/workflows/nightly-settle.yml` | Nightly | Settle previous day's MLB + NBA results, grade optimizer, write daily audit. Free public APIs only. |

### Workflow dispatch inputs (after PR #138)
```
projections_date: YYYY-MM-DD (default today in ET)
dry_run:          true|false (default false)
max_per_run:      "75" (credits, default)
min_remaining:    "300" (default credit floor)
skip_nba:         true|false (NEW — route around stats.nba.com outages)
skip_mlb:         true|false (NEW — rare; only when MLB pipeline wedges)
```

### Odds API secret
- Stored as `secrets.ODDS_API_KEY` in GitHub Actions repo secrets AND in Vercel project envs
- **Never** echoed to logs, **never** committed to the repo
- The current key was rotated previously; assume the value in secrets is the correct rotated key
- **Paid plan**: 20,000 credits/month
- **Credit guard default**: `MIN_REMAINING=300`. The script refuses paid calls if balance would drop below this. Do not lower without justification.

### Known reliability issue (May 28 episode)
- `pipeline/fetch_nba_data.py` hits `stats.nba.com` for player game-logs. Today every player request timed out at the 25s socket timeout. Workflow `26587755167` exceeded the 25-min GH Actions ceiling and was cancelled. Re-dispatch with `skip_nba=true` (workflow `26589421961`) succeeded MLB-only.
- If future morning runs cancel from the same root cause, dispatch with `skip_nba=true` to publish MLB while NBA falls back to the most recent prior board (with its honest `generatedAt` timestamp).

### Other ops invariants
- Settlement uses **free public APIs only** (MLB Stats API, ESPN summary, nba_api). Zero Odds API credits.
- `snapshot_optimizer` is wired into morning projections as step 6/6 of `automation_projections.sh` (PR #120).
- **Never manually edit settlement outcomes.** Re-run the orchestrator if state needs to be refreshed; it's idempotent.
- **Never disable cricket re-introduction or WNBA activation** in pipeline code unless explicitly approved.

---

## 7. Key files

### Data files
```
app/public/data/boards/YYYY-MM-DD.json                      # NBA board per date
app/public/data/mlb/boards/YYYY-MM-DD.json                  # MLB board per date
app/public/data/parlays/optimizer/YYYY-MM-DD.json           # pre-game optimizer snapshot
app/public/data/parlays/optimizer-graded/YYYY-MM-DD.json    # post-settle graded slips
app/public/data/parlays/optimizer-summary.json              # lifetime + by-date aggregate (filtered at loader)
app/public/data/audit/daily/YYYY-MM-DD.json                 # daily projection-level audit
app/public/data/audit/policy.json                           # confirming-signal policy state
app/public/data/audit/model_audit.json                      # cross-sport audit aggregate
app/public/data/mlb/results/settled_leans.jsonl             # MLB settled-leans store
app/public/data/mlb/results/lifetime_summary.json
app/public/data/mlb/results/available_dates.json
pipeline/validation/mlb_settled_leans.jsonl                 # raw settlement source-of-truth
```

### Pipeline files
```
scripts/automation_projections.sh    # morning orchestrator
scripts/automation_settle.sh         # nightly settle orchestrator
pipeline/parlay_optimizer.py         # optimizer + profile rules
pipeline/snapshot_optimizer.py       # writes per-date optimizer JSON
pipeline/grade_optimizer.py          # post-settle grader
pipeline/audit_daily.py              # projection-level daily audit
pipeline/audit_signal_policy.py      # confirming-signal policy writer
pipeline/recent10_extractor.py       # recent-10 stat helper
pipeline/attach_recent10.py          # attach recent-form metadata to leans
pipeline/fetch_nba_data.py           # NBA fetcher (this is the one that's been timing out)
pipeline/mlb/                        # MLB pipeline modules
```

### App / UI files
```
app/src/app/parlay-lab/page.tsx                       # /parlay-lab server component (post-PR #140)
app/src/app/results/page.tsx                          # /results
app/src/app/projections/page.tsx                      # /projections
app/src/app/layout.tsx                                # root layout (mounts nav, ticker, rail, bottom nav)
app/src/app/globals.css                               # theme tokens (refined dark default; .gtp-canvas light scope)
app/src/components/parlay-lab-builder.tsx             # main builder client component
app/src/components/parlay-ticket-card.tsx             # slip card
app/src/components/custom-parlay-builder.tsx          # manual builder
app/src/components/custom-parlay-generator.tsx        # auto-pick custom slips
app/src/components/custom-parlay-grade-card.tsx       # A/B/C/D/F grade card (PR #130)
app/src/components/date-status-header.tsx             # legacy big date card (still used by /results /projections)
app/src/components/nav.tsx                            # top nav (collapsed in PR #136)
app/src/components/disclaimer-banner.tsx              # compressed in PR #136
app/src/components/desktop-sports-rail.tsx            # left rail
app/src/components/mobile-bottom-nav.tsx              # mobile bottom nav
app/src/components/market-ticker.tsx                  # ticker strip
app/src/lib/parlay-optimizer.ts                       # TS twin of pipeline types
app/src/lib/parlay-results.ts                         # optimizer-graded loader (era-filtered)
app/src/lib/public-parlay-era.ts                      # PUBLIC_PARLAY_RESULTS_START_DATE = "2026-05-27"
app/src/lib/slate-label.ts                            # per-card slate chip helper (PR #125)
app/src/lib/date-status.ts                            # date-formatting helpers
app/src/lib/custom-parlay-grade.ts                    # A/B/C/D/F scoring helper
app/src/lib/custom-parlay-generator.ts                # auto-generator
app/src/lib/data-parlays.ts                           # legacy snapshot loader (used as fallback only)
```

### Docs
```
docs/PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md           # NEW — anchor for next 3-4 PRs
docs/UI_REBUILD_DIRECTION_2026-05-28.md               # design direction (PR #132)
docs/PROP_EXPANSION_NEXT_STEPS.md                     # prop expansion plan
docs/PARLAY_METHODOLOGY.md                            # methodology doc
docs/UI_UX_AUDIT_2026-05-27.md                        # earlier audit (superseded)
```

---

## 8. Current UI state and user feedback

### What's already shipped this session
- ✅ Unified dark theme (no more cream/dark donut) — PR #136
- ✅ Nav stack collapsed 155 → 58 px on desktop — PR #136
- ✅ `--gtp-card` default flipped to elevated charcoal `#161E3E` — PR #136
- ✅ DateStatusHeader on `/parlay-lab` replaced by 45 px `<SlateStrip>` — PR #137
- ✅ First slip card lands at y=629 (above 800 px fold) — PR #137
- ✅ Today's slate (May 28) now rendering — PR #140
- ✅ Contrast: all sampled elements ≥ AA (chip slate 7.74:1, eyebrow 12.39:1, card text 12.5:1)

### Remaining UX problems (from `docs/PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md` §3)

1. **Filter card looks like raw form controls.** "All teams" and "All players" render as Tailwind-defaulted `<select>` controls inside a 150 px-tall card.
2. **Section eyebrow + slate strip overlap in meaning.** Both surface the same date + status.
3. **Leg rows are dense and repeat truncated text.** "Calibration watch" chip on every leg; "View fo…" truncation at narrow widths.
4. **Sport rail is too thin to be useful.** 64 px wide, glyphs-only.
5. **Three competing custom/manual sections at the bottom.** Custom Builder + Custom Generator + their eyebrows blend with the official lane grid.
6. **Mobile-specific issues.** Slate strip wraps to 99 px (4 lines); filter card wraps to ~200 px.

### What the user has said repeatedly
- Site is technically functional but feels "developer-y," not premium
- Wants polished, readable, GameTimePicks-native product
- Will not accept incremental small style patches if the page still feels messy
- Approves aggressive UI redesigns within the hard rules
- The original dark theme baseline was acceptable; the cream pilot was the regression. The current refined-dark is the right baseline; next work is *layout* polish, not theme switching.

---

## 9. Remaining recommended PRs

The audit doc maps cleanly to a 4-PR sequence. Each PR is self-contained and sized to land under the 13-point auto-merge gate.

### Next PR A — Parlay Lab filter + rail polish
**Branch suggestion:** `feature/parlay-lab-filter-rail-polish`

**Goals**
- Replace raw `<select>` Team / Player controls with a compact 48 px horizontal filter toolbar
- Sport pills `[ All | NBA | MLB | Mixed ]` as primary controls with strong active state
- Team and Player become a single `+ Filter` disclosure — default collapsed, opens an inline panel only when used
- Sport rail: widen to 76-88 px with text labels below the glyph + clearer active accent (OR remove if the toolbar carries sport navigation cleanly)
- Mobile filter row: max 1 visible filter input by default; collapse Team/Player behind a `Filter` chip
- Keep keyboard focus visible; preserve `aria-label` for native selects if kept

### Next PR B — Slip card + leg row redesign
**Branch suggestion:** `feature/parlay-slip-card-redesign`

**Goals**
- Two-line leg row layout:
  - Line 1: `★ James Wood    WSH @ STL    -173`
  - Line 2: `Hits Over 0.5 · DraftKings    View form →`
- Player · team @ opponent · book odds (right-aligned) on line 1
- Market + side/line · book · per-leg drawer link on line 2
- Remove repeated "Calibration watch" chip; promote to a dot indicator next to the market label
- Replace truncated "View fo…" with a clean `Form →` chip
- Make market types easy to identify: Hits, Total Bases, H+R+RBI, Pitcher Ks, NBA PTS/REB/AST
- Status chip clearly visible: official / custom / pending / win / loss
- Improve odds emphasis (slightly larger font, right-aligned, bold)
- Mobile: full-width cards, single column, no horizontal overflow

### Next PR C — Official / custom / manual section restructure
**Branch suggestion:** `feature/parlay-lab-section-restructure`

**Goals**
- Drop the duplicated date from the "OFFICIAL SUGGESTED PARLAYS" section eyebrow (date already in slate strip)
- Wrap Custom Generator + Manual Builder in a single `<aside class="opt-in">` with ONE explanatory eyebrow ("Not officially tracked — exploratory tools")
- Manual builder collapsed by default on mobile (`<details>`)
- Reduce duplicate disclaimers — the global DisclaimerBanner + page subcopy already cover the message
- Keep the educational / not-betting-advice tone in copy

### Next PR D — Results / Projections slate-strip polish
**Branch suggestion:** `feature/results-projections-slate-strip-polish`

**Goals**
- Apply the `<SlateStrip>` pattern from PR #137 to `/results` and `/projections`
- Reduce bulky `DateStatusHeader` usage on those routes
- Keep projection audits visually SEPARATE from public parlay results on `/results`
- Verify on production that May 27 results still surface; no pre-era leak

### Next PR E — Sportsbook comparison / betslip panel (LATER, after UI polish)
**Branch suggestion:** `feature/sportsbook-comparison` (only after PR A-D)

**Goals**
- Read-only odds comparison across books (data already in `oddsForSide` per leg)
- NO fake links, NO scraping, NO affiliate/deep links unless real and explicitly approved by the user
- Consider whether this is a column inside the slip card OR a separate `/compare` route

---

## 10. Prompt for next Claude Code session

```text
Read HANDOFF_2026-05-28_GAMETIMEPICKS.md at the repo root before doing anything else. It captures the full state of this session.

Then:

1. Sync main and report:
   - local main SHA
   - origin/main SHA
   - production SHA (verify via `curl -sL https://gametime-picks.vercel.app/parlay-lab/ | grep -oE 'Thu · May 28|Wed · May 27' | head -1`)
   - working tree status
   - any open PRs

2. Verify production data endpoints are still live:
   - /data/parlays/optimizer/2026-05-28.json → HTTP 200
   - /data/mlb/boards/2026-05-28.json → HTTP 200
   - /data/parlays/optimizer-graded/2026-05-27.json → HTTP 200
   - /data/audit/policy.json → HTTP 200

3. Verify production page state:
   - /parlay-lab slate strip reads "Thu · May 28" (post-PR #140)
   - /results shows May 27: 9W·21L·30.0% + Conservative 85.7% + "Fresh tracking era"
   - No pre-era 16.0% / 8W·42L leak
   - No banned copy
   - No cricket / WNBA / IPL

4. Continue with Next PR A from §9 of the handoff doc — Parlay Lab filter + rail polish.

Hard constraints (do NOT violate):
- Do not redo work already merged through #140.
- Do not create no-op PRs.
- Do not modify settlement, grading, pipeline, or data files.
- Do not bring cricket back, do not activate WNBA.
- Do not use banned copy: lock, guaranteed, free money, risk-free, can't miss, easy win, easy money, no-brainer, sure thing, sharp money.
- Do not expose ODDS_API_KEY.
- Do not copy FanDuel/DraftKings exact branding/layout.

For each PR you create:
- Branch under feature/* or fix/* matching the goal
- Run `npx tsx --test app/src/lib/*.test.mjs`, `npx tsc --noEmit`, `npm run build`
- Browser-verify desktop 1280px and mobile 375px
- Open PR with detailed body
- Auto-merge ONLY when all 13 gates pass (scope · tests · build · browser desktop+mobile · banned copy · cricket/WNBA/IPL · secrets · pre-era leak · replay · production verify)
- Verify production after merge before starting the next PR

If a gate fails, STOP and report. Do not continue.
```

---

## 11. Verification commands

### Local repo / build
```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git status --short
git rev-parse HEAD                                       # expect 9d44510...
git rev-parse origin/main
git log --oneline -10
gh pr list                                               # expect 4 stale pre-existing PRs only
gh run list --workflow morning-projections.yml --limit 5
gh run list --workflow nightly-settle.yml --limit 5

# Build + test gate
cd app
npx tsx --test src/lib/*.test.mjs                         # 244 tests
npx tsc --noEmit
rm -rf .next && npm run build
cd ..
pytest pipeline/parlay_optimizer_test.py \
       pipeline/grade_optimizer_test.py \
       pipeline/audit_daily_test.py \
       pipeline/audit_signal_policy_test.py
```

### Production data endpoints
```bash
curl -sI https://gametime-picks.vercel.app/data/parlays/optimizer/2026-05-28.json     | head -1
curl -sI https://gametime-picks.vercel.app/data/mlb/boards/2026-05-28.json            | head -1
curl -sI https://gametime-picks.vercel.app/data/parlays/optimizer-graded/2026-05-27.json | head -1
curl -sI https://gametime-picks.vercel.app/data/audit/policy.json                     | head -1
curl -sI https://gametime-picks.vercel.app/data/parlays/optimizer-summary.json        | head -1
```

### Production page content checks
```bash
# /parlay-lab — should show Thu · May 28 + 15 slip context chips
curl -sL https://gametime-picks.vercel.app/parlay-lab/ \
  | grep -E "Thu · May 28|Wed · May 27|Slip context"

# /results — should show May 27 30.0% + Conservative 85.7% + Fresh tracking era
# AND must NOT contain 16.0% (pre-era 5/25 leak)
curl -sL https://gametime-picks.vercel.app/results/ \
  | grep -E "30\.0%|85\.7%|Fresh tracking era|16\.0%"

# Banned copy scan (should return zero matches)
for path in /parlay-lab /results /projections; do
  echo "== $path =="
  curl -sL "https://gametime-picks.vercel.app${path}/" \
    | grep -ioE '\b(guaranteed|risk[- ]?free|free money|easy money|sure thing|cricket|wnba|ipl)\b' \
    | sort -u
done
```

### Workflow dispatch (paid Odds API — use with care)
```bash
# Today's projections (default credit guard MIN_REMAINING=300)
gh workflow run morning-projections.yml -f projections_date=$(TZ=America/New_York date +%Y-%m-%d)

# MLB-only when NBA stats API is down
gh workflow run morning-projections.yml \
  -f projections_date=$(TZ=America/New_York date +%Y-%m-%d) \
  -f skip_nba=true

# Dry-run cost estimate (no paid calls)
gh workflow run morning-projections.yml \
  -f projections_date=$(TZ=America/New_York date +%Y-%m-%d) \
  -f dry_run=true
```

### Settlement (free public APIs only — zero credits)
```bash
SETTLE_DATE=YYYY-MM-DD SKIP_NBA=1 ./scripts/automation_settle.sh
# or just ./scripts/automation_settle.sh for both sports on yesterday
```

---

## 12. Final notes

- Production is **healthy** as of this handoff — `/parlay-lab` shows today's slate, `/results` shows May 27, all gates passed.
- This session shipped **3 merged PRs** (#138 ops, #139 audit doc, #140 loader fix) plus the auto-data commit `df0eb79`.
- **No new development should begin** until the user resumes in a fresh session.
- **No PR open at handoff time**.
- Hand off to the next session via the prompt in §10 above.

End of handoff.
