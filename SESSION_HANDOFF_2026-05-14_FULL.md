# GameTimePicks — Session Handoff (2026-05-14)

Full working context for resuming work in a fresh Claude Code chat without re-reading the prior transcript.

---

## 1. Current repo state

- **Branch:** `main`
- **`git status --short`:** clean (empty)
- **Production HEAD SHA:** `c8d6d32` — `feat(ui): cohesive product makeover for core surfaces (#23)`

### Latest 12 commits
```
c8d6d32 feat(ui): cohesive product makeover for core surfaces (#23)
980a480 feat(ui): redesign homepage with trending slate tabs (#22)
7b54e2e feat(ui): establish premium vault shell foundation (#21)
42d1a30 auto: Phase 10 daily refresh (2026-05-14T19:19Z) [skip ci]
e24c0d1 fix(pipeline): preserve existing recent10 when attach fetch fails (#20)
6864eea data: restore May 13 recent10 and apply guardrails
6a8db7b auto: Phase 10 daily refresh (2026-05-14T18:27Z) [skip ci]
47a439c fix(test): align enrich_board recent10 mock with guardrails (#19)
4d428d3 feat(model): wire confidence guardrails + R5 suspicious-edge cap (#18)
8a21198 feat(parlay-lab): redesign candidate cards and reduce disclaimer surface (#17)
1317d0e feat(board): polish off-day, refresh-pending, and props-pending states (#16)
96f78e1 chore(ui): public copy sweep — calm, non-technical empty-state language (#15)
```

### Vercel production deploy
Both production projects were `pending` at handoff time for `c8d6d32`. Should be `success` by the time the next chat reads this.

- **`Vercel – gametime-picks`** (with dash) — **canonical**, owns custom domain `gametimepicks.yashwantbalaji.com`
- **`Vercel – gametimepicks`** (no dash) — **duplicate**, SSO-gated, no public domain. Still fires checks on every PR. Operator must manually disconnect its GitHub integration in the Vercel dashboard (Settings → Git → Disconnect) to stop the duplicate. Not blocking any work; just noise on PR check lists.

---

## 2. Operating rules / safety rules

1. **Inspect before editing.** Read actual files; never assume paths, class names, line numbers, or function signatures from prior conversation memory.
2. **One feature branch per logical PR.** Never mix unrelated changes.
3. **No paid Odds API without explicit approval.** The Odds API Business tier ($99/mo) is required for player props; do not trigger any path that calls `/odds` or `/events` without an explicit user OK.
4. **No force push.** Never `git push --force` or `--force-with-lease` to any branch.
5. **No secrets printed.** Never echo `ODDS_API_KEY`, `BALLDONTLIE_API_KEY`, Vercel tokens, or any `.env` value. When debugging auth, print only length / first-4 / last-4 / HTTP code.
6. **No `app/public/data/*` edits without explicit approval.** Board JSON, slate.json, meta.json, results/* are operator-driven data.
7. **No `pipeline/*` or `.github/workflows/*` edits inside UI PRs.** Strict UI/data separation.
8. **Show diff + verification before commit.** Always `git diff --stat` + relevant tests pass before committing.
9. **Stop on unexpected state.** Dirty tree, build failure, unexpected dataMode, test failure → stop and report, do not patch on top of failure.
10. **No giant speculative patches.** Read first, write smallest change, verify, then expand.
11. **Keep PR scope narrow and reversible.** If scope explodes mid-PR, stop and propose splitting.

---

## 3. Major data / model / pipeline work completed

| PR / commit | Change | Why |
|---|---|---|
| **PR #13** `7451e76` | Workflow stabilization | Removed `BALLDONTLIE_API_KEY` + `ENABLE_BALLDONTLIE_FALLBACK` env from both refresh workflows; flipped `pipeline/config.py` defaults so `NBA_DATA_PROVIDER="nba_api"` and `ENABLE_BALLDONTLIE_FALLBACK="false"`. Eliminates ~13s/player free-tier 401 noise on every CI run. |
| **PR #18** `4d428d3` | Model trust guardrails | Wired the previously-dormant `confidence_guardrails` module into `enrich_board.py` and `generate_daily_board.py`. Added R5 `suspicious_edge_cap`: any `\|edgePct\| ≥ 25` caps confidence to Low + `riskFlags: ["suspicious_edge"]`. UI renders a "model anomaly" amber chip on those leans. |
| **PR #19** `47a439c` | Test fix | After PR #18 wired guardrails, the existing `enrich_board_test` mock had `AST: []` for recent10 → R1 (no logs) was incorrectly downgrading the test AST lean. Updated mock to populate PTS/REB/AST realistically. |
| `6864eea` (direct to main) | May 13 data restoration | Restored `2026-05-13.json` recent10 arrays from the last-known-good commit (`47a439c`), then applied `python3 -m pipeline.confidence_guardrails --date 2026-05-13 --apply`. Resulting board has 20 R5_suspicious_edge stamps on the implausible 25%+ edge leans (Cade, Duren, Jenkins, Merrill, Tobias Harris, Jarrett Allen). |
| **PR #20** `e24c0d1` | Preserve recent10 on attach failure | `attach_recent10.py` was destructively `del`-ing `recent10` keys when `fetch_player_game_logs` returned `[]` (no_logs / fetch_error / zero_id / dry_run / import_error). Removed the destructive `else` branch; existing arrays now survive transient fetch failures. Added 6 regression tests in `pipeline/attach_recent10_test.py` (no pandas/numpy/nba_api imports — mocks the seam). |
| Daily-refresh success post-PR #20 | `42d1a30` | Manually triggered `daily-refresh.yml` after merging PR #20. Workflow committed only timestamp updates (~6 lines per file vs the prior 842-line catastrophic wipe). May 13 recent10 + R5 stamps survived end-to-end. Proves the fix works in CI. |

---

## 4. Important data facts as of now

### May 13 (latest scored slate)
- **76 leans, 76 scored**
- Confidence distribution: **High 42 / Medium 5 / Low 29**
- recent10 length distribution: **70 length-10, 6 length-8, 0 None**
- **20 R5_suspicious_edge / suspicious_edge flags** — UI renders "model anomaly" badge on these
- Top model anomalies: Cade Cunningham PTS Under 26.5 (+41.8%), Jalen Duren PTS Over 12.5 (+46.7%), Daniss Jenkins AST Over 2.5 (+44.4%), Sam Merrill PTS Over 5.5 (+37.1%), Tobias Harris (multiple), Jarrett Allen (multiple)

### Other dates
- **May 14 (today)** — off-day, dataMode=`ScheduleUnavailable`, 0 games, 0 leans. UI shows premium "Today's slate is refreshing" state via the redesigned `NoGamesToday` (PR #23).
- **May 15 (Friday)** — `ScheduleLiveOddsUnavailable`, 2 games (SA @ MIN, DET @ CLE), 0 leans. **No sportsbook prop lines have loaded.** Projections cannot be honestly displayed until lines exist. UI shows "Tipoff TBD" via `formatTipoffLabel` (PR #16). Getting May 15 projections requires the paid Odds API — **do not run without explicit approval.**
- **May 16 (Saturday)** — off-day, same state as May 14.
- **May 17 (Sunday)** — **NO BOARD FILE EXISTS.** Has games per upstream schedule; nothing has called `generate_daily_board.py --date 2026-05-17`. Out of scope for the next PR.
- **May 18** — also missing.

### Known future data work (NOT in scope for the next PR)
- Bump `HTTP_TIMEOUT_SECONDS` in `pipeline/config.py` from `12` → `25`. The May 14/16 boards' `ScheduleUnavailable` label comes from stats.nba.com `Read timed out (12s)` failures on the May 12 pipeline run.
- Schedule-only board generation step in `automation_refresh.sh` so missing future board files (May 17/18) get created without burning Odds API credits.
- Vercel duplicate-project cleanup — operator needs to disconnect the `gametimepicks` (no-dash) project's GitHub integration via the Vercel dashboard.
- Investigate the `auto-refresh.yml` cron runs that were repeatedly `cancelled` (vs the manually-triggered `daily-refresh.yml` which succeeded). Probably workflow concurrency interacting with long-running runs.

---

## 5. UI/UX work completed

| PR | Commit | Scope |
|---|---|---|
| **PR #14** | `2823dca` | Parlay Lab human-readable game labels. Threaded `gamesByGameId` from `parlay-lab/page.tsx` through to `uniqueGamesFromLeans()` so chips render `CLE @ DET · 8:00 PM ET` instead of `401871337`. Fallback chain ends at `"Game ${gid}"` — never a bare numeric ID. |
| **PR #15** | `96f78e1` | Public copy sweep. Removed `provider failed`, `provider error`, `odds provider`, `schedule provider`, `manual verified`, raw `failureReason` rendering. Added `pipeline/public_copy_test.py` (self-contained, no pandas; strips comments via string-aware state machine). |
| **PR #16** | `1317d0e` | Board off-day / props-pending state polish. Added `formatTipoffLabel(tipoff)` helper in `lib/freshness.ts` — masks upstream `"12:00 AM ET"` placeholder as `"Tipoff TBD"`. Added next-slate pointer chip to `NoGamesToday`. Added status dot to `SlateTabs` subtitles. Deduplicated stacked `PropsComingSoon + ScheduleStrip + PropsUnavailable` on May 15. |
| **PR #17** | `8a21198` | Parlay Lab candidate card redesign + disclaimer compression. 3-zone candidate hierarchy (header / legs / footnotes), fixed `{team} · {team} @ {opponent}` typo, dropped "pid missing" jargon, renamed "no recent10" to "limited recent form". Compressed `/parlay-lab` "How this works" from 5 to 3 bullets. |
| **PR #21** | `7b54e2e` | UI shell foundation. Promoted vault navy/gold palette as canonical chrome (body backdrop, `live-dot`, `::selection` re-skinned). Added 5 new primitives: `.vault-shell`, `.vault-quiet-label`, `.vault-pill`, `.vault-ambient-orbit`, `.vault-edge-fade`. Nav: dropped mobile `v0.4` chip, switched active state to gold underline. Disclaimer banner: premium gradient strip. Footer: 3-col → 2-col + quiet status row. |
| **PR #22** | `980a480` | Homepage redesign with Trending tabs. New `homepage-trending-tabs.tsx` client component with 3 ARIA-compliant tabs (Projections / Parlays / Upcoming). Server-side data prep finds latest scored board + upcoming slate. KPI tiles fall back to latest scored slate stats on off-days. Intelligent hero CTA re-routes to latest scored board when today is empty. |
| **PR #23** | `c8d6d32` | Cohesive product makeover for core surfaces. Wider 1440px shells. New display typography ramp (`vault-display-h1/h2/h3`). New `vault-deluxe-card` surface. New `vault-data-orbit` hero backdrop. Premium redesign of `NoGamesToday` off-day state. `<details>` disclosure for Parlay Lab "How this works". Larger nav (h-16), footer typography. Trending `LeanRow` upgraded to `vault-deluxe-card`. |

---

## 6. Current UI facts / remaining product issues

### What's polished and shipped
- Wider shells (1440px) with layered `vault-data-orbit` + `vault-ambient-orbit` hero backdrops across `/`, `/board`, `/parlay-lab`
- Display typography ramp (`vault-display-h1/h2/h3`) replacing the broadcast 44/72 jump
- Premium chrome: nav (h-16, refined GP mark + gold underline active state), footer (2-col + quiet status row), disclaimer (calm gradient strip)
- Homepage **Trending tabs**:
  - **Projections** — top 6 clean leans + 4 anomaly watchlist from May 13 (latest scored board)
  - **Parlays** — routes to `/parlay-lab` without fabricating slips; lists archive availability honestly
  - **Upcoming** — May 15 schedule cards with "Tipoff TBD" placeholders; clearly notes props-not-loaded
- Off-day / refresh-pending state: premium designed state with ambient backdrop + pulsing-gold next-slate chip
- Public copy: all rendered text avoids `provider failed`, `odds provider`, `schedule provider`, etc. — enforced by `public_copy_test.py`
- Model trust UI: "model anomaly" chip renders on R5-flagged leans

### Remaining biggest UI issues (NOT yet addressed)
1. **`vault-player-card.tsx`** — the densest unfinished surface. Player card grid on `/board` still feels like an internal data tool. Hierarchy of player/matchup/market/line/projection/edge/confidence needs premium treatment.
2. **`vault-filters.tsx`** — 530-line filter chip strip likely still feels internal.
3. **`vault-board.tsx`** — grid layout works but could use polish (section heading, card grid breathing).
4. **`parlay-builder-client.tsx`** — 722 lines. Build mode control sidebar + `CandidateCard` internals were lightly polished in PR #17/#23 chrome but the core dense surfaces still need a deeper dedicated pass.
5. **Mobile-specific QA** — all `vault-display-*` typography uses `clamp()`, so it scales, but no mobile-first deep dive has happened.
6. **May 15 projections** — cannot be displayed honestly because no sportsbook prop lines have loaded. Requires paid Odds API (operator decision) or a schedule-only generation path (separate PR).

---

## 7. New CSS/UI primitives available

All defined in `app/src/app/globals.css`. Every animation/transition is wrapped in `@media (prefers-reduced-motion: reduce) { ... }` opt-outs.

| Primitive | Purpose |
|---|---|
| `.vault-shell` | Anchor class on `<body>` for canonical chrome (PR #21) |
| `.vault-page-shell` | Wider 1440px page container utility (PR #23). Use on top-level `<div>` of route pages. |
| `.vault-data-orbit` | Premium hero backdrop graphic. Slow rotating gold conic gradient + soft radial dots. Parent needs `position: relative; overflow: hidden;`. (PR #23) |
| `.vault-ambient-orbit` | Lighter ambient gold drift backdrop for less-prominent sections. (PR #21) |
| `.vault-deluxe-card` | Premium card surface — gold-edge gradient `::before`, soft hover lift, refined border. Replaces flat `.surface` cards where premium feel matters. (PR #23) |
| `.vault-display-h1` | Hero headline: `clamp(40px, 7vw, 76px)`, line-height 0.97, weight 600 (PR #23) |
| `.vault-display-h2` | Section/page heading: `clamp(30px, 4.5vw, 48px)` (PR #23) |
| `.vault-display-h3` | Module heading: `clamp(22px, 3vw, 32px)` (PR #23) |
| `.vault-section-heading` | Sentence-case 22px section title — alternative to tiny mono eyebrows (PR #23) |
| `.vault-quiet-label` | Sentence-case 11px mute-tone alternative to `.eyebrow` for softer captions. Existing `.eyebrow` stays for legacy. (PR #21) |
| `.vault-pill` | Reusable status pill. Pass `--pill-fg` / `--pill-bg` / `--pill-border` to express semantics. (PR #21) |
| `.vault-edge-fade` | Top/bottom soft-fade gradient cap for inset sections. (PR #21) |
| `.vault-glow-hover` | Soft glow + 1px translateY hover transition (pre-existing, PR #21 era) |
| `.vault-rise` | One-shot fade-up animation on first paint (pre-existing) |
| `.vault-pulse` | Slow opacity+scale pulse for status dots (pre-existing) |
| `.vault-tab-active` | Gold-glow underline for selected tabs (pre-existing) |

---

## 8. Recommended next PR

### Branch
`feature/board-card-redesign`

### Allowed scope
- `app/src/components/vault-player-card.tsx` (primary target — 454 lines)
- `app/src/components/vault-board.tsx` (only if needed for grid/heading polish — 335 lines)
- `app/src/components/vault-filters.tsx` (only if needed — 530 lines; consider deferring to a separate PR if scope explodes)

### Do NOT touch in this PR
- `pipeline/*`
- `app/public/data/*`
- `.github/workflows/*`
- `app/src/lib/*` (read-only)
- `parlay-builder-client.tsx`
- `parlay-lab-mode-tabs.tsx`
- `board-with-tabs.tsx`
- `package*.json`

### Goal
Redesign the dense board / player-card surface so it feels premium and easy to scan.

Specifically for `vault-player-card.tsx`:
- Clearer hierarchy: **player name** + matchup → market label → line + projection + edge + confidence
- Use new `.vault-deluxe-card` surface (replace inline styling)
- Stronger visual encoding for projection vs line (consider a small horizontal bar / dot indicator)
- Edge tag scale: cap visually at ±25-30% so the headline doesn't read like "+46% guaranteed money"
- `_originalConfidence` + `suspicious_edge` riskFlags must render the "model anomaly" badge in a way that's visible but not alarming (pair with calmer color tone)
- recent10 sparkline more readable (it currently exists; verify it's prominent enough)
- Less tiny mono text — use `.vault-quiet-label` for captions where appropriate
- Preserve all filtering / data props and the `MarketRow` / `MarketRowView` data flow

### Constraints
- **Display-only changes.** Do not alter the data the card receives.
- **No new dependencies.** Use existing CSS primitives and tokens.
- **Preserve filter callouts.** The component currently reads riskFlags and renders chips — keep that behavior.
- **Preserve accessibility.** Existing aria-expanded/aria-controls on the "Show last 10 trends" disclosure should stay.

---

## 9. Verification checklist for the next PR

```bash
# Build + type
cd app && npm run typecheck
cd app && npm run build
cd ..

# Public copy guard
python3 pipeline/public_copy_test.py

# Forbidden marketing/copy grep — must return EMPTY for rendered code
grep -rnE "lock|guaranteed|best bet|no room for error|provider failed|provider error|odds provider|schedule provider|trends_pending" app/src 2>/dev/null | head -120

# Scope check
git status --short
git diff --stat
```

**Expected scope:**
- Only the allowed UI files modified
- No `app/public/data/*` changes
- No `pipeline/*` changes
- No `.github/workflows/*` changes
- No `package*.json` changes
- No `app/src/lib/*` changes

---

## 10. Stop conditions

Stop immediately, report findings, and wait for direction if any of these occur:

- Dirty working tree at PR start
- Any `app/public/data/*` change appears in `git status` during a UI PR
- Any `pipeline/*` / `.github/workflows/*` / `package*.json` change during a UI PR
- `npm run typecheck` or `npm run build` fails
- `python3 pipeline/public_copy_test.py` fails
- Accidental scoring / parlay / model logic change
- Uncertainty about repo state after a context reset (re-verify via `git status` + `git log --oneline -10`)
- Context window getting too full (proactively suggest pausing or summarizing)
- Any path that would trigger paid Odds API or balldontlie paid endpoints
- Encountering `_guardrail`, `_originalConfidence`, `riskFlags`, or `recent10` fields in unexpected places (these are data integrity signals)

---

## 11. Suggested first prompt for the next Claude Code chat

Paste this verbatim into the new chat:

> Read SESSION_HANDOFF_2026-05-14_FULL.md first. Then verify repo state with git status, branch, and latest commits. Do not edit yet. Report your understanding of the current state and the recommended next PR. Wait for approval before creating a branch.

---

*Handoff generated 2026-05-14. Repo HEAD: `c8d6d32`. Working tree clean.*
