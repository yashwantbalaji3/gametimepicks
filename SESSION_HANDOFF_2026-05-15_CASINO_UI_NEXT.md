# GameTimePicks Session Handoff — 2026-05-15 Casino UI Continuation

> Generated 2026-05-15 12:00 EDT. **This file is the source of truth** for the
> next Claude Code conversation. The prior chat is closing; do not assume the
> next session can see any earlier transcript.

---

## 1. Current repo state

- **Working directory:** `~/Downloads/gametimepicks`
- **Current branch:** `feature/product-polish-star-navigation`
- **HEAD SHA:** `d8bdd5f` — `feat(ui): improve star discovery, parlay navigation, and results experience`
- **main HEAD SHA:** `ad2d69d` — `fix(ui): mobile QA polish — disclaimer banner + anchor scroll offset (#31)`

### `git status --short` (clean except expected untracked docs)
```
?? SESSION_HANDOFF_2026-05-14_FULL.md
?? SESSION_PROGRESS_2026-05-14_3HR_AUTOWORK.md
?? SESSION_PROGRESS_PRODUCT_POLISH.md
?? SESSION_PROGRESS_VISUAL_POLISH.md
?? SESSION_HANDOFF_2026-05-15_CASINO_UI_NEXT.md  (this file)
```

### Latest 25 commits
```
d8bdd5f feat(ui): improve star discovery, parlay navigation, and results experience  ← PR #32 HEAD
ad2d69d fix(ui): mobile QA polish — disclaimer banner + anchor scroll offset (#31)  ← main HEAD
4307231 feat(ui): bring secondary pages into the sportsbook brand system (#30)
84ca5db feat(ui): sportsbook brand + neon visual polish (#29)
2477082 feat(ui): add "how to read these projections" educational disclosure on /board (#28)
db0349f feat(ui): polish Parlay Lab Build mode internals (#27)
16acb48 feat(ui): redesign board player cards for premium scanability (#26)
052fcde fix(pipeline): increase NBA provider timeout for schedule reliability (#25)
9db9030 data: generate May 15 prop projections from controlled paid Odds API run
70ed835 fix(pipeline): keep schedule endpoint_history JSON-serializable (#24)
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
2823dca feat(parlay-lab): show human-readable game labels in builder (#14)
7451e76 fix(workflow): stop burning CI seconds on balldontlie free-tier 401s (#13)
5cdb488 Fix duplicate balldontlie env keys in daily refresh workflow
```

### Open PRs

| # | Title | Branch | mergeState | Files |
|---|---|---|---|---|
| **32** | feat(ui): star discovery, parlay navigation, and results experience | `feature/product-polish-star-navigation` | **CLEAN** | 6 |
| 5 | Stop dry-run auto-refresh from clobbering real-prop boards | `fix/dry-run-clobber-guard` | UNKNOWN (stale) | 1 |
| 4 | Remove public operator leaks from board badge and home callout | `fix/public-status-leaks` | UNKNOWN (stale) | 2 |
| 2 | Fix auto-refresh workflow YAML syntax | `fix/auto-refresh-yaml` | UNKNOWN (stale) | 2 |
| 1 | Hide admin operator status from public board | `fix/hide-admin-status-on-board` | UNKNOWN (stale) | 1 |

Treat #1, #2, #4, #5 as **pre-existing legacy PRs**; the operator has not been working on them. Leave them alone.

### PR #32 status (the active one)

- **State:** OPEN
- **mergeStateStatus:** CLEAN
- **Mergeable:** yes
- **Commits:** 1 (`d8bdd5f`)
- **Files changed:** 6 (all UI):
  - `app/src/app/page.tsx`
  - `app/src/app/results/page.tsx`
  - `app/src/components/empty-results-card.tsx`
  - `app/src/components/parlay-builder-client.tsx`
  - `app/src/components/vault-board.tsx`
  - `app/src/components/vault-player-card.tsx`
- **All 3 Vercel checks PASS** (`Vercel – gametime-picks`, `Vercel – gametimepicks`, `Vercel Preview Comments`)
- **PR URL:** https://github.com/yashwantbalaji3/gametimepicks/pull/32

### Preview URLs (most recent PR #32 deploy)

- **Canonical (with-dash project):** https://gametime-picks-git-featu-9e0ff4-yashwantbalaji33-7164s-projects.vercel.app
- **Duplicate (no-dash, SSO-gated):** https://gametimepicks-git-featur-deb384-yashwantbalaji33-7164s-projects.vercel.app

### Production URL

- **Custom domain on canonical project:** https://gametimepicks.yashwantbalaji.com
- Currently serves `ad2d69d` (PR #31). Will serve PR #32's commit once it merges.

---

## 2. Operating rules / safety constraints

### Absolute prohibitions
- **Do NOT run paid Odds API** under any circumstance unless the operator explicitly approves a single controlled call.
- **Do NOT trigger GitHub workflows** via `gh workflow run` or any equivalent.
- **Do NOT print secrets** — never echo `ODDS_API_KEY`, `BALLDONTLIE_API_KEY`, or any `.env` value.
- **Do NOT fabricate** sportsbook lines, projections, parlays, player stats, schedules, odds, injuries, news, or results.
- **Do NOT hand-edit `app/public/data/*`** for any reason (the May 15 board was generated through one controlled run; respect that).
- **Do NOT touch `.github/workflows/*`** for UI work.
- **Do NOT touch `package.json` / `package-lock.json`** unless explicitly required (no new dependencies).
- **Do NOT touch `app/src/lib/*`** unless read-only (lib holds data-shape/grouping/filter/active-slate logic — UI-only work doesn't need it).
- **Do NOT touch `pipeline/*`** for UI work. Read-only inspection is fine.

### Public-copy prohibitions (enforced by `pipeline/public_copy_test.py`)
Never use these phrases in user-facing copy:
- "lock"
- "guaranteed"
- "best bet"
- "free money"
- "can't miss" / "cant miss"
- "no room for error"
- "provider failed", "provider error", "odds provider", "schedule provider"
- "trends_pending" (internal pipeline term — never user-facing)

### Required behavior
- Preserve **educational / responsible-use framing** throughout.
- Preserve **accessibility:** keyboard nav, aria attributes, focus rings, color contrast.
- Preserve **reduced-motion support:** every keyframed animation paired with `@media (prefers-reduced-motion: reduce)`.
- Preserve **responsible-use page tone** — it must stay somber. No casino glow there.
- **Trust current project data over old real-world memory.** If `app/public/data/boards/2026-05-15.json` says James Harden is on CLE in this project, that's authoritative.
- If a command fails unexpectedly, stop and diagnose before continuing.
- If `git status` shows data/pipeline/workflow/package/lib changes during a UI PR, stop and report.

### Merge policy
- The operator has previously allowed merging UI-only PRs autonomously if **all** conditions are met:
  - all checks green
  - mergeStateStatus CLEAN
  - scope is strictly UI (no data/pipeline/lib/workflow/package files)
  - result is clearly an improvement
- For PR #32 specifically: the operator's most recent brief said "**If checks pass, report PR ready for visual review.**" — i.e. *do not* auto-merge PR #32; leave it for the operator's visual review.
- For brand-new PRs after #32: same autonomy as past sessions (merge if clearly UI-only + green + clean).

---

## 3. Product / data status

### Slate status (live data as of 2026-05-15 12:00 EDT)

| Date | dataMode | oddsProviderStatus | Games | Leans | Scored | Conf High/Med/Low | R5 anomalies |
|---|---|---|---|---|---|---|---|
| 2026-05-13 | Live | ok_with_props | 1 (CLE @ DET 8:00 PM ET) | 76 | 76 | 42 / 5 / 29 | 20 |
| 2026-05-14 | ScheduleUnavailable | not_configured | 0 | 0 | 0 | — | 0 |
| **2026-05-15** | **Live** | **ok_with_props** | **2 (DET @ CLE 7:00 pm ET, SAS @ MIN 9:30 pm ET)** | **163** | **163** | **97 / 17 / 49** | **31** |
| 2026-05-16 | ScheduleUnavailable | not_configured | 0 | 0 | 0 | — | 0 |
| 2026-05-17 | MISSING (file not on disk) | — | — | — | — | — | — |
| 2026-05-18 | MISSING (file not on disk) | — | — | — | — | — | — |

**May 15 is the live main slate.** All UI work should treat May 15 as today.

### May 15 — star player status (all PRESENT)

| Player | Team | Best clean lean | Notes |
|---|---|---|---|
| **Anthony Edwards** | MIN vs SAS | AST Under 4.5 — High **+8.8%** | REB Under 5.5 is R5 anomaly (+26%) |
| **Victor Wembanyama** | SAS vs MIN | AST Over 3.5 — High **+17.5%**; PTS Over 26.5 High +15.7% | clean across the board |
| **Donovan Mitchell** | CLE vs DET | AST Over 3.5 — High **+22.7%** (DK) / Low +25.6% (FD) | |
| **Cade Cunningham** | DET vs CLE | REB Under 5.5 — High **+14%** | PTS Under 27.5 is R5 anomaly (+37.6%) |
| **James Harden** | **CLE** vs DET | PTS Over 19.5 — High **+12.2%** | **Operator standing rule: treat as CLE. Do not "correct" this based on old real-world memory.** |
| **Jalen Duren** | DET vs CLE | PTS Over 10.5 — Low +43.6% (R5 anomaly) | |
| **Rudy Gobert** | MIN vs SAS | REB Over 8.5 — Low +39.6% (R5 anomaly) | |
| **Julius Randle** | MIN vs SAS | PTS Over 16.5 — Low +33.6% (R5 anomaly); AST Over 3.5 High +10.7% | |
| **Evan Mobley** | CLE vs DET | REB Over 8.5 — High **+18%**; PTS Over 14.5 High +12.2% | clean |
| **Jarrett Allen** | CLE vs DET | REB Over 6.5 — High **+17.1%** | PTS Over 12.5 is R5 anomaly |

Also present and worth knowing: De'Aaron Fox (SAS), Stephon Castle (SAS), Daniss Jenkins (DET), Tobias Harris (DET), Naz Reid (MIN), Mike Conley (MIN), Dennis Schroder (team `?` — pipeline resolver miss but **do not touch pipeline**).

### Results data status
- `app/public/data/results/lifetime_summary.json` → `totalSettled: 0`, `wins: 0`, `losses: 0`, `decisive: 0`
- `app/public/data/results/available_dates.json` → `dates: []`
- `app/public/data/results/settled_leans.jsonl` → 0 lines
- Conclusion: **no settled outcomes exist yet.** The Results page is *correctly* empty. UI work must keep it honest — never fabricate.

### Anthony Edwards / Parlay Lab status (per PR #32)
- **Was the bug:** Parlay Lab Selected Players picker used `topCorePlayerKeysPerTeam` ranking by `projectionSum`. Edwards's PTS market is No-Play on May 15 (proj 26.33 ≈ line 26.5), so his projection sum (~14.7 across AST+REB) was below MIN's top-3 (Randle 22, Gobert 23+, Naz Reid). He was filtered out of the picker.
- **PR #32 fix:**
  - Picker now lists **every loaded player** (not just core-3-per-team)
  - Star-priority sort pins big names to the top
  - New player search input
  - Auto-enable bench inclusion in candidate generation when user has hand-picked players, so selected non-core stars actually produce candidates
- **Status: needs visual confirmation on the PR #32 preview.** Source-level evidence is in `app/src/components/parlay-builder-client.tsx`.

### Anthony Edwards / Board ordering status (per PR #32)
- **Was the issue:** main grid sorted by `maxAbsEdge desc` → role players with anomaly edges dominated the top
- **PR #32 fix:** UI-level "Featured" reorder of cards by composite score:
  - star priority (curated 12-name list)
  - confidence weight
  - projection magnitude
  - edge capped at 20% so a 43% R5 never leapfrogs a clean 12% High
  - anomaly deboost
- Headliner Rail tiles pin star summaries above the grid; full cards in the grid are reordered with this composite

### Results page (per PR #32)
- Hero rebranded to **"The grading lab"** with eyebrow "Calibration room · early validation"
- `EmptyResultsCard` upgraded with a 4-step workflow timeline (Game completes → Box score verified → Projection graded → Calibration updated)
- Two real CTAs: "View the live model board" (auto-routes to latest scored slate via `findLatestScoredBoardDate()`) and "Read the methodology"
- Still honest: 0 settled outcomes shown until data exists

### Homepage engagement (per PR #32)
- New **"What's on the floor"** 4-tile feature row between Trending tabs and the 3-step explainer
- Tiles route to: Board (Star spotlight), Methodology (Model anomaly guardrails — warn-tone), Parlay Lab (Open the console), Results (Calibration room)
- Each tile shows real-number badges from data already in scope

---

## 4. Recent completed work history

| PR | SHA | Purpose | Key files | UI impact |
|---|---|---|---|---|
| **#13** | `7451e76` | Workflow stabilization (CI no longer wastes ~13s/player on balldontlie 401s) | `.github/workflows/*`, `pipeline/config.py` | none |
| **#14** | `2823dca` | Parlay Lab — human-readable game labels | `app/src/components/parlay-builder-client.tsx`, `app/src/lib/parlay-builder.ts` | "DET @ CLE · 8:00 PM ET" instead of `401871337` |
| **#15** | `96f78e1` | Public copy sweep — remove "provider failed" etc. | `app/src` | calmer language |
| **#16** | `1317d0e` | Off-day / refresh-pending / props-pending states polished | `app/src/components/no-games-today.tsx`, etc. | "Tipoff TBD" instead of placeholder |
| **#17** | `8a21198` | Parlay Lab candidate-card redesign | `parlay-builder-client.tsx` | 3-zone header / legs / footnotes |
| **#18** | `4d428d3` | Confidence guardrails (R1–R5) wired into pipeline | `pipeline/*` | suspicious_edge auto-caps at Low |
| **#19** | `47a439c` | Test fix after #18 | `pipeline/enrich_board_test.py` | tests pass |
| **#20** | `e24c0d1` | `attach_recent10` no longer destructively wipes recent10 on fetch failure | `pipeline/attach_recent10.py` | data resilience |
| **#24** | `70ed835` | Schedule provider serialization fix (board write no longer crashes on cache-miss) | `pipeline/providers/nba_api_provider.py` + test | unblocked May 15 paid run |
| **direct** | `9db9030` | May 15 data committed (one controlled paid Odds API call: 6 credits) | `app/public/data/boards/2026-05-15.json`, `pipeline/validation/leans_log.jsonl` | 163 real props now live |
| **#25** | `052fcde` | `HTTP_TIMEOUT_SECONDS` 12 → 25 | `pipeline/config.py` | fewer schedule timeouts |
| **#26** | `16acb48` | Board player-card redesign | `vault-player-card.tsx` | projection-vs-line meter, calmer edge tag, bullet structure |
| **#27** | `db0349f` | Parlay Lab Build mode polish | `parlay-builder-client.tsx`, `parlay-lab-mode-tabs.tsx` | numbered section pills, sentence-case copy |
| **#28** | `2477082` | "How to read these projections" disclosure on /board | `app/src/app/board/page.tsx` | educational footer |
| **#29** | `84ca5db` | Sportsbook brand + neon visual polish (4 commits squashed) | `globals.css` + 12 components | BrandMark, LED rail, neon corner brackets, casino-glow card, sportsbook status board, ticker, neon stat panels, vegas section shell, Featured Headliners (compact rail), bullet reasoning, Parlay console eyebrow, nav illuminated active state, trending dedupe, anchor scroll-to-card |
| **#30** | `4307231` | Secondary pages into the brand system | `methodology/page.tsx`, `responsible-use/page.tsx`, `empty-results-card.tsx` | deluxe-card surfaces; Responsible Use stays somber |
| **#31** | `ad2d69d` | Mobile QA polish | `disclaimer-banner.tsx`, `vault-player-card.tsx` | mobile compliance copy, anchor scroll-mt |
| **#32 OPEN** | `d8bdd5f` | Star discovery + Parlay Lab fix + Results calibration room + Homepage tiles | 6 UI files | see §3 for detail |

### Brand / visual primitives currently in `globals.css` (~1564 lines, 144+ classes)
- **Surfaces:** `.surface`, `.vault-card-elevated`, `.vault-deluxe-card` (premium gold-edge), `.vault-glass`
- **Hero overlays:** `.vault-data-orbit` (rotating conic gradient), `.vault-ambient-orbit`, `.vault-hero-grid`, `.gtp-line-scan` (LED scanline)
- **Brand chrome:** `.gtp-monogram`, `.gtp-neon-wordmark` (`.gtp-word-strong`, `.gtp-word-soft`), `.sportsbook-light-rail`, `.gtp-vegas-marquee`, `.gtp-house-rules`
- **Cards / chips:** `.casino-glow-card`, `.vault-pill`, `.vault-chip-active`, `.gtp-source-chip`, `.gtp-headliner-tile`, `.gtp-live-chip`, `.gtp-method-numeral`
- **Composed:** `.gtp-status-board` + `.gtp-led-row`, `.gtp-ticker-rail` + `.gtp-ticker-track` + `.gtp-ticker-cell`, `.gtp-stat-panel`, `.gtp-vegas-shell`, `.gtp-info-row`
- **Disclosure:** `.gtp-disclosure-trigger` (focus halo)
- **Reasoning:** `.gtp-reason-list` + `.gtp-reason-eyebrow` + `.gtp-reason-label`
- **Brackets / dots:** `.neon-corner-bracket` + `.gtp-bracket-{tl,tr,bl,br}`, `.gtp-slate-dot-{live,empty}`, `.gtp-nav-bullet`
- **Animation:** `.vault-pulse`, `.vault-rise`, `.vault-glow-hover`, `.vault-tab-active`, `.gtp-neon-pulse`, `.live-dot`
- **Tokens:** `--vault-gold`, `--vault-gold-bright`, `--vault-gold-dim`, `--vault-warn`, `--vault-success`, `--vault-text`, `--vault-text-mute`, `--vault-text-faint`, `--gtp-neon-cyan`, `--gtp-edge-light`, `--gtp-deep-navy`

### Presentational components currently in `app/src/components/`
38 components incl. all of the above primitives wired up. The 4 newest are:
- `featured-headliners.tsx` (compact star tile rail with anchor links)
- `sportsbook-status-board.tsx` (homepage hero + board status strip)
- `odds-ticker-rail.tsx` (homepage marquee)
- `vegas-section-shell.tsx` (panelled section wrapper)
- `brand-mark.tsx`, `sportsbook-light-rail.tsx`, `neon-corner-bracket.tsx`, `neon-stat-panel.tsx` (utility shells)

---

## 5. Current known user complaints / product gaps

Direct paraphrase from the most recent operator briefs:

1. **UI is improved but still not aggressive enough visually.** Even after PR #29/#30/#31/#32, the operator wants a stronger **Vegas casino / sportsbook lounge** feeling — more neon, more motion, more cinematic depth.
2. **Homepage needs more reasons to keep users engaged longer.** PR #32 added a 4-tile feature row but more is welcome (richer hero, ticker richness, animated panels, neon stat rows).
3. **Results page must remain useful even without settled outcomes.** PR #32 added the workflow timeline + calibration-room framing, but the page can keep growing (more educational content, what-comes-next teasers).
4. **Parlay Lab must be easy and futuristic.** PR #32 fixed the player-discovery bug. The console feel is partway there but could be richer (selected chip glows, candidate slip premium treatment, smoother transitions).
5. **Board ordering for crowd appeal.** PR #32 added Featured composite sort to default view. Could expose the sort visibly in the filter dropdown (e.g. "Featured" as a real option).
6. **Anthony Edwards must be visible in Parlay Lab.** PR #32 source has the fix; **needs visual confirmation on the preview.**
7. **Reasoning bullets clean.** PR #32 split out a dedicated Edge bullet and polished wording. Still iterable.
8. **No broken buttons, easy navigation.** Confirmed clean on prior PRs; new work should preserve.
9. **Treat current project data as authoritative.** Don't "fix" James Harden away from CLE.
10. **Responsible / educational framing preserved.** Every iteration has held this; keep it.

---

## 6. Visual direction for next session

Operator-stated aesthetic targets, verbatim where useful:

**Should feel like:**
- premium Vegas sportsbook lounge
- casino floor lighting
- LED odds-board wall
- dark glass panels
- neon rim lights
- sportsbook command center
- animated ambient lights
- cinematic depth
- glowing signage
- futuristic NBA analytics lounge
- premium and responsible

**Should NOT feel like:**
- bland / dashboard-like
- cheap or spammy
- crypto-casino
- GitHub README
- spreadsheet
- plain SaaS template
- reckless gambling site

**Palette:**
- Gold base (already established: `--vault-gold`, `--vault-gold-bright`)
- Tasteful electric accents: cyan / magenta / electric blue (use sparingly — `--gtp-neon-cyan` already exists; magenta token not yet)
- Deep navy surfaces (`--vault-panel`, `--vault-panel-elevated`)
- Cream text (`--vault-text`)
- Warn-amber (`--vault-warn`) for anomalies / cautions

**Motion:**
- Slow, premium glow — never seizure-y flashing
- Every keyframed animation **must** have `@media (prefers-reduced-motion: reduce)` fallback
- Marquee / ticker speeds: minutes-long loops (current `gtp-ticker-scroll` is 48s — good baseline)

**Brand voice:**
- Sentence-case throughout where possible (mono uppercase only for eyebrows + small chips)
- No betting hype language (see forbidden-copy list in §2)
- Educational analytics, not picks service

---

## 7. Recommended next work

### Decision tree

| State of PR #32 | Action |
|---|---|
| **OPEN, CLEAN, checks green** ← current state | Two options: (a) merge PR #32 first (operator's last brief said "report PR ready for visual review" — so prefer waiting for the operator unless they've now approved merge), then branch off main for fresh work; (b) continue on `feature/product-polish-star-navigation` only for targeted review fixes |
| **MERGED before next session starts** | Create new branch `feature/casino-ui-final-overhaul` from main |
| **Not mergeable (UNSTABLE / CONFLICTING)** | Investigate + fix conflicts before any new work |

**Recommended next branch name for fresh work:** `feature/casino-ui-final-overhaul`

### Recommended work sequence

1. **Visually review production + the PR #32 preview**
   - Production: https://gametimepicks.yashwantbalaji.com
   - PR #32 preview: https://gametime-picks-git-featu-9e0ff4-yashwantbalaji33-7164s-projects.vercel.app
   - Confirm Anthony Edwards in Parlay Lab → Selected Players
   - Confirm star ordering on `/board?date=2026-05-15` (Anthony Edwards / Wembanyama / Cade / Mitchell etc. lead the grid)
   - Confirm Results "Calibration room" reads well
2. **Route-by-route audit** at desktop + mobile (390px / 768px / 1440px / 1728px):
   - `/`
   - `/board` (defaults to active slate)
   - `/board?date=2026-05-15`
   - `/board?date=2026-05-13`
   - `/parlay-lab`
   - `/results`
   - `/methodology`
   - `/responsible-use`
3. **Aggressive casino/futuristic visual overhaul** of remaining surfaces. Candidates:
   - Hero command-center backdrop animations
   - Stronger LED-board energy on the board grid
   - Premium chip / glow treatments for selected filter state
   - Smoother route transitions
   - Magenta / cyan accent layer (sparingly) for live indicators
   - Neon perimeter on the Parlay Lab candidate column
4. **Homepage engagement** — additional sections after the "What's on the floor" row. Ideas:
   - Tonight's top High-confidence projection ribbon (one cell per market)
   - "Anatomy of a model card" demo card with annotations
   - Latest results teaser when data exists; honest waiting state when not
5. **Board/Parlay/Results polish iteration** — keep the existing components but raise the depth/lighting
6. **Mobile QA fixes** found during the route audit
7. **Open PR**, run checks, **stop for visual review** before merge unless the operator has explicitly pre-approved auto-merge

### Files that are safe to edit (UI scope)
- `app/src/app/globals.css`
- `app/src/components/nav.tsx`
- `app/src/components/footer.tsx`
- `app/src/components/disclaimer-banner.tsx`
- `app/src/app/page.tsx`
- `app/src/app/board/page.tsx`
- `app/src/app/parlay-lab/page.tsx`
- `app/src/app/results/page.tsx`
- `app/src/app/methodology/page.tsx`
- `app/src/app/responsible-use/page.tsx`
- `app/src/components/vault-player-card.tsx`
- `app/src/components/vault-board.tsx`
- `app/src/components/vault-filters.tsx`
- `app/src/components/featured-headliners.tsx`
- `app/src/components/parlay-builder-client.tsx`
- `app/src/components/parlay-lab-mode-tabs.tsx`
- `app/src/components/homepage-trending-tabs.tsx`
- `app/src/components/slate-tabs.tsx`
- `app/src/components/empty-results-card.tsx`
- `app/src/components/results-breakdown.tsx`
- `app/src/components/sportsbook-status-board.tsx`
- `app/src/components/odds-ticker-rail.tsx`
- `app/src/components/vegas-section-shell.tsx`
- `app/src/components/neon-stat-panel.tsx`
- `app/src/components/neon-corner-bracket.tsx`
- `app/src/components/sportsbook-light-rail.tsx`
- `app/src/components/brand-mark.tsx`
- Any new presentational components

### Files that are OFF-LIMITS for UI work
- `pipeline/*` (read-only OK)
- `app/public/data/*` (never touch)
- `.github/workflows/*`
- `app/src/lib/*` (read-only OK; logic-bearing)
- `package.json`, `package-lock.json`
- `.env`, anything containing secrets

---

## 8. Suggested first prompt for the next Claude Code conversation

> Copy-paste this verbatim into the next conversation:

---

**Read `SESSION_HANDOFF_2026-05-15_CASINO_UI_NEXT.md` first.**

You are continuing GameTimePicks. The previous Claude Code conversation closed and you have no memory of it. The handoff file is the source of truth — read it fully before doing anything else.

## Phase 0 — reorient

Run:

```
cd ~/Downloads/gametimepicks
git status --short
git branch --show-current
git log --oneline -15
gh pr view 32 --json number,state,headRefName,mergeStateStatus,changedFiles,commits -q '{n: .number, state: .state, head: .headRefName, mergeState: .mergeStateStatus, files: .changedFiles, commits: [.commits[] | .oid[0:7]]}'
gh pr checks 32 2>&1 | head -10
```

Confirm: branch `feature/product-polish-star-navigation` exists locally with HEAD `d8bdd5f`; main is at `ad2d69d`; PR #32 is OPEN and CLEAN with 6 changed files; both Vercel deploys pass.

If PR #32 has been merged in the meantime, switch to main, `git pull`, and treat its commits as already shipped.

## Phase 1 — visually review the live product

Use WebFetch on:
- **PR #32 preview (canonical):** https://gametime-picks-git-featu-9e0ff4-yashwantbalaji33-7164s-projects.vercel.app
- **Production:** https://gametimepicks.yashwantbalaji.com

Specifically check (these are the operator's recurring concerns):
1. `/parlay-lab` → "Selected players" mode → is Anthony Edwards visible as a chip? PR #32 should have fixed this. Confirm or report blocker.
2. `/board?date=2026-05-15` → headliner rail tiles at top; main grid below should now lead with **star/high-volume** cards (Edwards / Wembanyama / Cade / Mitchell etc.), not buried under role-player anomalies.
3. `/results` → does it read as a "Calibration room" with a 4-step workflow timeline? Honest about no settled data.
4. `/` → is the "What's on the floor" 4-tile section between Trending tabs and the explainer cards visible with real number badges?

Write findings before editing.

## Phase 2 — decide branch

If PR #32 is **still open** and the operator's prior instruction stands ("report PR ready for visual review"), **do not auto-merge it**. Instead create a new branch from main for fresh work:

```
git checkout main
git pull origin main
git checkout -b feature/casino-ui-final-overhaul
```

If PR #32 has been **merged** already, branch the same way from the new main.

If PR #32 is **broken** (not mergeable, checks red), fix it first on its own branch.

## Phase 3 — the deep iteration

Spend 2–3 hours. The goal is to push **dramatically** past the current state of casino / sportsbook polish. Operator vision: "premium Vegas sportsbook lounge / NBA analytics command center — futuristic, neon, glowing signage, LED rails, dark glass, animated ambient lights, cinematic depth, responsible-use preserved."

Concrete areas to push:

**Homepage `/`**
- Strengthen the hero further: stronger animated command-center backdrop, possibly a layered cyan/magenta accent ring around the status board
- After "What's on the floor" tiles, consider an "Anatomy of a projection" demo using a real loaded May 15 card (Wembanyama works well — clean High +15.7%)
- Polish the odds ticker — ensure it never feels like a stock ticker, more like a neon marquee
- Footer brand mark could pulse subtly

**Board `/board?date=2026-05-15`**
- Make the SportsbookStatusBoard strip feel like a real LED odds wall — more depth, internal ambient lighting
- Featured composite sort is already applied to the grid; expose it as a real visible label so users know why the order is what it is
- Player card hover should feel cinematic — currently uses casino-glow-card; consider an extra rim pulse on focus
- The filter "console" panel could get more neon depth

**Parlay Lab `/parlay-lab`**
- **First confirm Anthony Edwards is now in Selected Players.** If broken on the preview, fix.
- Selected-chip glow could be stronger when a player is picked
- Candidate cards: the combined-odds chip is the visual centerpiece — give it more sportsbook-board treatment
- Empty state when no candidates match: already polished from PR #32; small refinements possible

**Results `/results`**
- The Calibration room is solid; consider adding an honest "Slate awaiting settlement" panel pointing at the May 15 board with the loaded projection count

**Mobile** (390 / 768 / 1440 / 1728 px)
- Run through the full route list. The disclaimer banner, nav lockup, headliner tile grid, parlay sidebar are the most likely break points.

## Phase 4 — safety constraints (non-negotiable)

- Do NOT run paid Odds API
- Do NOT trigger workflows
- Do NOT print secrets
- Do NOT fabricate data, lines, odds, projections, schedules, parlays, results, or injuries
- Do NOT touch `app/public/data/*`, `pipeline/*` (read-only OK), `.github/workflows/*`, `package*.json`, `app/src/lib/*` (read-only OK)
- Do NOT use forbidden public copy: "lock", "guaranteed", "best bet", "free money", "can't miss", "no room for error"
- Treat current project data as authoritative — James Harden on CLE is current data, not a bug
- Preserve responsible-use somber tone; no casino glow there
- Preserve reduced-motion and keyboard a11y on every animation/control

## Phase 5 — verify

Before committing, run:

```
cd app && npm run typecheck
cd app && npm run build
cd ..
python3 pipeline/public_copy_test.py
grep -rnE "lock|guaranteed|best bet|free money|can't miss|cant miss|no room for error|provider failed|provider error|odds provider|schedule provider|trends_pending" app/src 2>/dev/null | grep -vE "rounded-(full|md|lg|2xl|3xl|6px)|game_logs|provider\.is|\.gtp-brand-lockup|gtp-disclosure|gtp-headliner|<Block|Block title|brand lockup" | head -20
git status --short
git diff --stat
git diff --name-only
```

Expected: typecheck PASS, build PASS, public_copy_test PASS, forbidden-copy grep returns only CSS class names + Block component names + comments. Scope: only UI files.

## Phase 6 — open PR

If clean, commit with a descriptive message that lists every UI change, push, open PR, poll Vercel checks. **Do not auto-merge** unless the operator has explicitly pre-approved. Leave the PR open for visual review and report.

Commit signature footer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Phase 7 — final report

When done, write a concise final report covering: branch, commit SHA, PR number + URL, files changed, tests run, preview URL, what specifically improved per route, remaining rough spots, rollback command. The operator wants to be able to act on it without re-reading the conversation.

---

End of suggested prompt.

---

## 9. Verification checklist for next PR

Mandatory before commit:
- [ ] `cd app && npm run typecheck` → PASS
- [ ] `cd app && npm run build` → PASS, route sizes within reason (current baselines: `/` 6.49 kB · `/board` 18.8 kB · `/parlay-lab` 10.4 kB · `/results` 2.87 kB · `/methodology` 140 B · `/responsible-use` 141 B · `/trends` 175 B)
- [ ] `python3 pipeline/public_copy_test.py` → PASS
- [ ] Forbidden-copy grep clean (allow only CSS class names, comments, component identifiers)
- [ ] `git status --short` shows **only** UI files + untracked progress/handoff docs
- [ ] `git diff --name-only` excludes `app/public/data/*`, `pipeline/*`, `.github/workflows/*`, `app/src/lib/*`, `package*.json`

Visual / UX checklist:
- [ ] `/parlay-lab` Selected Players includes Anthony Edwards (PR #32 fix)
- [ ] `/board?date=2026-05-15` grid leads with star players (PR #32 Featured sort)
- [ ] Headliner rail tiles anchor-scroll to the corresponding full card in the grid
- [ ] `/results` "Calibration room" workflow timeline renders
- [ ] Homepage "What's on the floor" 4-tile row renders with real-number badges
- [ ] Every route renders at 390px without horizontal scroll or clipped chrome
- [ ] Disclaimer banner readable on mobile (short version on `<sm`)
- [ ] Nav brand lockup fits on 390px
- [ ] Reduced-motion preference disables animations
- [ ] Responsible Use page tone preserved (no casino glow)

---

## 10. Rollback commands

### If you need to revert a future UI PR after merge
```
git revert <commit-sha>
```

### If you want to abandon an open branch and PR
```
gh pr close <PR_NUMBER>
git checkout main
git branch -D <branch-name>
git push origin --delete <branch-name>
```

### If you want to revert PR #32 specifically (only if merged)
```
git revert d8bdd5f
```

### If you want to revert the brand stack (PR #29 + #30 + #31 + #32) back to PR #28
```
git revert d8bdd5f ad2d69d 4307231 84ca5db
```

---

## 11. Final notes

- **Untracked progress/handoff docs** (`SESSION_HANDOFF_*.md`, `SESSION_PROGRESS_*.md`) **should not be committed** unless the operator explicitly asks. They live in the working tree as a session-to-session knowledge transfer device.
- **Vercel duplicate project (`gametimepicks` no-dash)** still exists and posts duplicate checks on every PR. Operator-side cleanup task; not blocking.
- **`auto-refresh` workflow has been cancelling repeatedly** (concurrency-group interaction). Not in UI scope; flagged for a future pipeline PR.
- **The May 15 paid Odds API run cost 6 credits** (out of 500/month). 452 credits remained as of the last check. The operator has not authorized another paid run.
- **ChatGPT conversation context expires.** This handoff is the canonical source of state for the next Claude Code conversation. Do not assume the new conversation can see anything from the prior session.
- **The operator is okay with the next Claude spending time thinking/planning before editing.** Quality and depth are valued over speed. Do not stop after a superficial pass.
- **Pre-existing legacy PRs #1 / #2 / #4 / #5 are stale**. Leave them alone unless the operator points to one.
- **Dennis Schroder appears with team `?`** in the May 15 board — this is a pipeline player-resolver miss, but pipeline edits are out of scope for UI work. Note it; don't fix it.
