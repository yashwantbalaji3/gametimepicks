# GameTimePicks Session Handoff — 2026-05-16 → MLB Expansion

> **Generated 2026-05-16.** Source of truth for the next Claude Code conversation.
> Previous session is closing; the next session has zero memory of prior chats.
> Read this entire file before doing anything else.

---

## 1. Current repo state

- **Working directory:** `~/Downloads/gametimepicks`
- **Current branch:** `feature/may17-slate-parlay-quality` (PR #39 branch)
- **Branch HEAD:** `0ab760f` — `fix(slate): remove phantom MIN/SAS Game 7 + Game 7 caveat + methodology mobile`
- **PR #39 base:** `main` (currently at `9990269` — PR #38 squash)
- **Working tree:** clean except untracked session docs + root `gametime-picks-logo.png`

### `git status --short` (clean except expected untracked)

```
?? SESSION_HANDOFF_2026-05-14_FULL.md
?? SESSION_HANDOFF_2026-05-15_CASINO_UI_NEXT.md
?? SESSION_HANDOFF_2026-05-16_MLB_NEXT.md  ← this file (do not commit)
?? SESSION_PROGRESS_2026-05-14_3HR_AUTOWORK.md
?? SESSION_PROGRESS_MAY17_GAME7_REVIEW.md
?? SESSION_PROGRESS_NEXT_SLATE_PARLAY.md
?? SESSION_PROGRESS_PLAYOFF_CONTEXT_PLAYER_IMAGES.md
?? SESSION_PROGRESS_PRODUCT_POLISH.md
?? SESSION_PROGRESS_RESULTS_LOGO_2026-05-15.md
?? SESSION_PROGRESS_RESULTS_SETTLEMENT.md
?? SESSION_PROGRESS_VISUAL_POLISH.md
?? SESSION_QA_UI_POLISH_2026-05-15.md
?? gametime-picks-logo.png
```

The session docs and root logo are intentionally untracked — do not commit them.
Canonical logo asset lives at `app/public/brand/gametime-picks-logo.png`.

### Latest 12 commits (on PR #39 branch)

```
0ab760f fix(slate): remove phantom MIN/SAS Game 7 + Game 7 caveat + methodology mobile  ← PR #39 HEAD
b3edf28 feat(slate): prepare May 17 Game 7 slate + parlay quality modes
9990269 feat(results): settle May 15 props against final box scores (#38)   ← main HEAD
6615829 auto-refresh: 2026-05-15 19:10 ET (props-only)
05d009d feat(ui): integrate logo and improve pending results experience (#37)
56cb53a feat(ui): playoff context + player spotlight visuals (#35)
8946a00 feat(ui): add final QA-driven casino polish (#34)
bd18ede feat(ui): casino UI overhaul — aurora halo, rim-LED cards, anatomy + awaiting panels (#33)
8baddd8 feat(ui): improve star discovery, parlay navigation, and results experience (#32)
ad2d69d fix(ui): mobile QA polish — disclaimer banner + anchor scroll offset (#31)
4307231 feat(ui): bring secondary pages into the sportsbook brand system (#30)
84ca5db feat(ui): sportsbook brand + neon visual polish (#29)
```

### Open PRs

| # | Title | Branch | mergeState | Notes |
|---|---|---|---|---|
| **39** | feat(slate): prepare May 17 Game 7 slate + parlay quality modes | `feature/may17-slate-parlay-quality` | **CLEAN** | Ready for visual review + merge |
| 5 | Stop dry-run auto-refresh from clobbering real-prop boards | `fix/dry-run-clobber-guard` | UNKNOWN (stale legacy) | Leave alone |
| 4 | Remove public operator leaks from board badge and home callout | `fix/public-status-leaks` | UNKNOWN (stale legacy) | Leave alone |
| 2 | Fix auto-refresh workflow YAML syntax | `fix/auto-refresh-yaml` | UNKNOWN (stale legacy) | Leave alone |
| 1 | Hide admin operator status from public board | `fix/hide-admin-status-on-board` | UNKNOWN (stale legacy) | Leave alone |

### Production

- **Custom domain:** https://gametimepicks.yashwantbalaji.com (currently serving `9990269` until PR #39 merges)
- **Canonical Vercel project:** `gametime-picks` (with dash)
- **Duplicate Vercel project:** `gametimepicks` (no dash, posts duplicate checks — operator-side cleanup task; not blocking)

---

## 2. Merged state through PR #38 (already on `main`)

### Recent merged milestones (newest first)

| PR | SHA | What shipped |
|---|---|---|
| **#38** | `9990269` | **May 15 settlement — first real graded Results.** 80W / 65L / 0P on 145 decisive picks = **55.2% hit rate**. Per-game scorecards, Clean-vs-R5 guardrail audit, honest parlay disclosure (no fake hits). Driven by `pipeline/settle_results.py` + `pipeline/export_results.py` (audited). |
| **#37** | `05d009d` | Real **GameTime Picks logo** (`app/public/brand/gametime-picks-logo.png`) wired into nav/footer via BrandMark with CSS fallback. Results awaiting-settlement table + calibration roadmap (pre-settlement framing). |
| **#35** | `56cb53a` | **Playoff context utility** (`getPlayoffContext` decodes NBA stats playoff game IDs → "Eastern Conf Semis · Game 6 · DET @ CLE"). **PlayerAvatar** loading from official NBA CDN with onError CSS fallback. **Parlay Lab recent-form dossier** (sparkline + market chips + last-5/last-10 averages). |
| **#34** | `8946a00` | Final QA polish: premium `.gtp-cta-primary` shine button, full-width CTA band, headliner sweep + corner brackets, candidate-ticket treatment, calibration sigil. |
| **#33** | `bd18ede` | Casino UI overhaul: aurora halo behind status board, rim-LED player cards, anatomy callout, awaiting-settlement panel, magenta + cyan accent tokens. |
| **#32** | `8baddd8` | Star discovery — Anthony Edwards visible in Parlay Lab picker, Featured composite sort on board grid leads with stars, Results "Calibration room" upgrade, homepage "What's on the floor" tiles. |
| **#31** | `ad2d69d` | Mobile QA polish — disclaimer banner short variant, anchor `scroll-mt`. |
| **#30** | `4307231` | Brought Methodology + Responsible Use into sportsbook brand system. |
| **#29** | `84ca5db` | Established sportsbook brand + neon visual polish (BrandMark, light rail, neon corners, ticker). |

### Live production state (after #38 / before #39)

- 145 decisive picks settled on May 15 · **55.2% hit rate** · 80W / 65L / 0P
- Cuts: Clean 57.0% vs R5 anomaly 48.4% · DET@CLE 61.6% · SAS@MIN 48.6%
- Medium confidence 64.7% > High 55.7% > Low 48.4%
- Player photos live (NBA CDN with initials fallback)
- Playoff round + Game-number chips on every game-card surface
- Parlay Lab recent-form dossier with sparkline + market chips
- Real GameTime Picks logo in nav + footer
- Results Model Audit hero with per-game scorecards + Clean-vs-R5 guardrail audit

---

## 3. PR #39 details (currently OPEN — review and merge first)

- **URL:** https://github.com/yashwantbalaji3/gametimepicks/pull/39
- **Branch:** `feature/may17-slate-parlay-quality`
- **Base:** `main`
- **State:** OPEN
- **mergeStateStatus:** CLEAN
- **Commits (2):** `b3edf28` (May 17 board + parlay quality modes) + `0ab760f` (phantom MIN/SAS removal + Game 7 caveat + methodology mobile fix)
- **Files changed:** 15
- **Preview URL:** https://gametime-picks-git-featu-90667a-yashwantbalaji33-7164s-projects.vercel.app
- **All 3 Vercel checks:** PASS
  - `Vercel – gametime-picks` (canonical) ✓
  - `Vercel – gametimepicks` (duplicate, redundant) ✓
  - `Vercel Preview Comments` ✓

### File list

```
app/public/data/board.json
app/public/data/boards/2026-05-17.json
app/public/data/meta.json
app/public/data/odds_props.json
app/public/data/players.json
app/public/data/schedule.json
app/public/data/slate.json
app/src/app/board/page.tsx
app/src/app/methodology/page.tsx
app/src/app/page.tsx
app/src/app/parlay-lab/page.tsx
app/src/components/parlay-builder-client.tsx
app/src/lib/parlay-builder.ts
pipeline/parlay_builder_test.py
pipeline/validation/leans_log.jsonl
```

### What changed (in order)

1. **May 17 board generated** via the smallest possible paid Odds API run (3 credits / 1 event × 3 markets × 1 region — **452 → 449 credits remaining**). Process: dry-run first (FREE) → real run → free `enrich_board` + `attach_recent10`.
2. **CLE @ DET Game 7 kept** — game ID `0042500207`, 72 audited scored leans (42 High / 7 Medium / 20 Low / 3 insufficient_data, 13 R5 anomalies).
3. **Phantom MIN @ SAS Game 7 removed** after verification:
   - `BoxScoreTraditionalV2(0042500236)` confirmed **SAS 139 / MIN 109** in Game 6
   - `BoxScoreSummaryV2` series-state frame: SAS was already `SERIES_LEADER` entering Game 6 (3-2)
   - Conclusion: series ended **SAS 4 / MIN 2**, no Game 7
   - Surgical edit: removed only the MIN @ SAS `games[]` entry from May 17 board + 3 mirror files. Zero leans removed (phantom had 0 loaded leans).
4. **Parlay quality modes** in `app/src/lib/parlay-builder.ts`:
   - Conservative + Balanced now have `excludeAnomalies: true` + `maxAnomalyLegs: 0` — never carry an R5 capped-extreme-edge leg
   - Aggressive has `excludeAnomalies: false` + `maxAnomalyLegs: 1` (design intent; dormant because R5 caps to Low)
   - New `hasAnomalyLegs` field on `ParlayCandidate`
   - Mode descriptors rewritten: "Lower-variance mix" / "Star-forward mix" / "Wider-edge mix" — no betting hype
   - CandidateCard surfaces an explicit warn-tone "Includes model-anomaly leg — confidence capped at Low" chip
5. **Active-slate routing (page-level off-day promotion)**: when "today" exists but has no games AND a future date in the window has loaded leans, promote that future date as the default landing. Applied in homepage + board + parlay-lab.
6. **Game 7 caveat + model-audit link** in Parlay Lab Context Desk — acknowledges rotation/usage volatility, links to /results.
7. **Methodology mobile fix**: `Formula` component `overflow-hidden` → `overflow-x-auto` + mobile font reduction so derivation lines no longer clip on 390px viewports.
8. **Tests**: `pipeline/parlay_builder_test.py` mirrors new rules + 6 new assertions. **39 assertions PASS**.
9. **May 15 Results UNTOUCHED** — no edits to `app/public/data/results/*` or `app/public/data/boards/2026-05-15.json`.

### Verification at last push

- `cd app && npm run typecheck` → PASS
- `cd app && npm run build` → PASS (sizes flat — `/` 6.92 kB · `/board` 20.2 kB · `/parlay-lab` 14.6 kB · `/results` 2.87 kB)
- `python3 -m pipeline.parlay_builder_test` → 39 assertions PASS
- `python3 -m pipeline.settle_test` → 66 assertions PASS
- `python3 -m pipeline.export_results_test` → 38 assertions PASS
- `python3 pipeline/public_copy_test.py` → PASS
- Forbidden-copy grep (`safe bet|lock|guaranteed|best bet|free money|can't miss|cant miss|no room for error`) → clean

### Visual review checklist for PR #39

- [ ] `/board?date=2026-05-15` still shows the May 15 graded slate untouched
- [ ] `/board?date=2026-05-17` defaults to the CLE @ DET Game 7 view
- [ ] No MIN @ SAS phantom game appears anywhere on the May 17 board
- [ ] Headliner rail shows CLE/DET stars only (MIN/SAS stars are gated by team-on-slate)
- [ ] `/parlay-lab` promotes May 17 as the default slate
- [ ] **Anthony Edwards / Wembanyama / etc. are NOT in the player picker** (their teams are not on May 17 — correct behavior)
- [ ] Cade Cunningham / Donovan Mitchell / James Harden / Mobley / Allen / Duren / Thompson / Tobias Harris ARE in the player picker
- [ ] Conservative + Balanced candidate cards never display the "Includes model-anomaly leg" chip
- [ ] Aggressive candidate cards may show it (currently dormant; would surface when an Aggressive R5 anomaly ever passed the confidence gate)
- [ ] Parlay Lab Context Desk shows the Game 7 caveat + "see latest model audit →" link
- [ ] **`/methodology` on mobile (390px)** — projection formula scrolls horizontally instead of being clipped
- [ ] `/results` Model Audit hero still shows 55.2% hit rate from May 15
- [ ] No forbidden copy anywhere on the preview

### Merge prompt for PR #39 (copy verbatim)

```
Merge approved for PR #39.

Before merging, reconfirm:
- PR #39 is CLEAN and MERGEABLE
- all checks are green
- scope is May 17 slate prep + parlay quality + Game 7 fixes
- no May 15 results changes
- no projection/scoring math changes
- no workflow changes
- no package changes
- SESSION_*.md files are not committed

Then run:
gh pr merge 39 --squash --delete-branch

After merge:
git checkout main
git pull origin main
git fetch --prune origin
git status --short
git log --oneline -16

Poll Vercel production deploy for the canonical gametime-picks project.

Report:
- squash merge SHA
- current branch/status
- latest 16 commits
- production deploy state
- canonical Vercel deploy URL
- live custom domain reminder
- rollback command

Do not start another PR.
Do not start MLB work yet.
```

---

## 4. May 15 lessons learned (must inform future work)

Mined from `app/public/data/results/comparison_report_2026-05-15.json` + cross-referenced with `app/public/data/boards/2026-05-15.json` for risk flags:

| Cut | n | Hit rate | Note |
|---|---|---|---|
| **Medium confidence** | 17 | **64.7%** | Outperformed High on this slate |
| High confidence | 97 | 55.7% | Solid but not dominant |
| Low confidence | 31 | 48.4% | Includes R5 anomalies |
| **Clean leans (no R5)** | 114 | **57.0%** | Justifies R5 exclusion in Conservative/Balanced |
| R5 model anomaly | 31 | 48.4% | Behaved like a coin flip — guardrail working as designed |
| Edge 10-15% | 18 | **72.2%** | Sweet spot on this slate |
| Edge 25%+ | 31 | 48.4% | R5 territory — coin flip |
| Under (overall) | 34 | 67.6% | Single-slate anomaly; do not encode |
| Over (overall) | 111 | 51.4% | Single-slate anomaly; do not encode |
| Wembanyama | 6 | **0.0%** | Star projection ≠ outcome |
| Donovan Mitchell | 5 | **0.0%** | Star projection ≠ outcome |
| Tobias Harris | 6 | **100%** | DET role player crushed |
| Jarrett Allen | 6 | **100%** | CLE big crushed |

**Lessons to apply (already encoded in PR #39 where appropriate):**
- ✅ Avoid R5/model-anomaly legs in Conservative + Balanced parlays
- ✅ Don't blindly sort by largest edge (25%+ underperformed)
- ✅ Star name alone does not mean reliable
- ✅ Game 7 rotations/usage can be volatile (caveat added)
- ✅ Keep public language educational + risk-aware ("Lower-variance mix" not "safe bet")

**Lessons explicitly NOT yet encoded (avoid overfitting one slate):**
- Under-bias 67.6% vs Over 51.4% — single-slate signal, do not filter
- Low-variance recent10 underperforming — counterintuitive, single-slate
- Star de-prioritization — needs more graded slates

---

## 5. Product / UX current state (NBA)

### Live features

**Homepage `/`**
- Hero with marquee status board + tipoff line · "What's on the floor" 4-tile feature row · Anatomy of a projection callout (pinned to a real loaded star lean) · Trending tabs (Projections / Parlays / Upcoming) · CTA band · neon stat panels · odds ticker rail · 3-step explainer · newsletter

**Board `/board?date=...`**
- Sportsbook status-board strip · Featured Headliners rail (anchor-link tiles to full cards) · Featured-order chip · Filter console with `.gtp-console-chrome` · Full player cards with NBA CDN headshots + rim-LED hover + playoff game chip · "How to read these projections" disclosure

**Parlay Lab `/parlay-lab`**
- Hero · **Context Desk** with status pills (Playoff context ✓ / Last-10 recent form ✓ / Model anomaly guardrails ✓ / NBA headshots ✓ / Latest slate graded ✓ / Injury notes · soon / Series record · soon / Live tipoff countdown · soon) + Game 7 caveat + model-audit link
- Build mode + Analyze mode tabs · Slate selector · Risk profile cards (Conservative / Balanced / Aggressive — with the new "Lower-variance / Star-forward / Wider-edge" descriptions) · Player picker (Selected Players mode shows all loaded stars with star prioritization) · Selected-player dossier (avatar + matchup + playoff chip + market chips + recent10 sparkline + last-5/last-10 averages) · Candidate cards with combined-odds chip + same-game chip + new "Includes model-anomaly leg" chip

**Results `/results`**
- **Model Audit hero** ("55.2%" big-display + lifetime W/L line) · honesty banner only when small-sample · KPI strip (settled/wins/losses/pushes) · **Per-game scorecards** with playoff chip + hit rate + best call + biggest miss · **Anomaly guardrail panel** (Clean 57.0% vs R5 48.4%) · per-market/confidence/game breakdown · largest-misses + best-calls call lists · **Parlay Results Disclosure** (honest "candidate snapshots not persisted yet" — never claims parlay hits)

**Methodology `/methodology`**
- 5 numbered formula blocks · data sources panel · status states · limitations · news-overrides explanation · **PR #39 fix:** mobile formula horizontal scroll

**Responsible Use `/responsible-use`**
- Helplines (1-800-GAMBLER, NCPG) · serious tone · NO casino glow (deliberate)

### Logo / branding
- Real PNG: `app/public/brand/gametime-picks-logo.png` (1659×948, ~2.5 MB)
- Rendered via `BrandMark` component with `onError` CSS fallback
- Used in nav (lockup, 42px) and footer (compact, 30px)
- `BrandMark` accepts `ambient` prop (footer monogram breathes; nav steady)

### Critical components + files

| Concern | File |
|---|---|
| Playoff context decoder | `app/src/components/playoff-context.ts` |
| Player headshot avatar | `app/src/components/player-avatar.tsx` |
| Parlay candidate builder logic | `app/src/lib/parlay-builder.ts` |
| Parlay Lab client | `app/src/components/parlay-builder-client.tsx` |
| Player dossier | `app/src/components/player-recent-form-panel.tsx` |
| Active-slate selector | `app/src/lib/active-slate.ts` |
| Results page | `app/src/app/results/page.tsx` |
| Anomaly guardrail panel | `app/src/components/anomaly-guardrail-panel.tsx` |
| Per-game scorecard | `app/src/components/per-game-scorecard.tsx` |
| Parlay results disclosure (no fake hits) | `app/src/components/parlay-results-disclosure.tsx` |
| Awaiting-settlement table | `app/src/components/awaiting-settlement-table.tsx` |
| Calibration roadmap | `app/src/components/calibration-roadmap.tsx` |
| Casino-UI CSS primitives | `app/src/app/globals.css` (~2000 lines) |

### Pipeline architecture (NBA)

| Concern | File |
|---|---|
| Board generation | `pipeline/generate_daily_board.py` |
| Enrichment / scoring | `pipeline/enrich_board.py`, `pipeline/score_model.py` |
| Recent10 attachment | `pipeline/attach_recent10.py` |
| Confidence guardrails (incl. R5 cap) | `pipeline/confidence_guardrails.py` |
| Settlement | `pipeline/settle_results.py` (nba_api auto + manual overrides) |
| Sanitized export | `pipeline/export_results.py` |
| Public-copy gate | `pipeline/public_copy_test.py` |

### After PR #39 merges + Sunday Game 7 finalizes

Run to grade the May 17 slate (free nba_api — no paid credits):

```bash
python3 -m pipeline.settle_results --date 2026-05-17
python3 -m pipeline.export_results
```

This will:
- Append 60-72 settled rows to `app/public/data/results/settled_leans.jsonl`
- Update `app/public/data/results/lifetime_summary.json` (combined May 15 + May 17 hit rate)
- Write `app/public/data/results/comparison_report_2026-05-17.json`
- Push lifetime sample past the 25-pick statistical floor

### Parlay candidate persistence — **still not implemented**

The Results page disclosure explains this honestly. Future PR should:
1. Snapshot the default-slate candidate sets at board-generation time → `app/public/data/parlays/YYYY-MM-DD.json`
2. Grade snapshots post-settlement
3. Surface parlay hit rate on Results

Until then, we cannot claim parlay hits without inventing slips.

---

## 6. Hard operating rules (STANDING)

### Absolute prohibitions

- **Do NOT fabricate** schedules, projections, odds, results, injuries, news, or parlays
- **Do NOT run paid Odds API** without explicit operator approval AND a credit-cost estimate
- **Do NOT trigger workflows** (`gh workflow run`) unless explicitly approved
- **Do NOT print secrets** (no echoing of `ODDS_API_KEY`, `BALLDONTLIE_API_KEY`, or `.env` values)
- **Do NOT hand-edit** `app/public/data/boards/*` or `app/public/data/results/*` except when removing a clearly unnecessary/cancelled game from a freshly generated slate after verification
- **Do NOT touch** `.github/workflows/*` or `package*.json` unless explicitly scoped
- **Do NOT change** projection/scoring math without explicit approval AND tests
- **Do NOT alter** historical May 15 results unless a clear bug is proven

### Public-copy prohibitions (gated by `pipeline/public_copy_test.py`)

Never use in user-facing copy:
- "safe bet" / "safebet"
- "lock" / "locks"
- "guaranteed"
- "best bet"
- "free money"
- "can't miss" / "cant miss"
- "no room for error"
- "provider failed" / "provider error" / "odds provider" / "schedule provider"
- "trends_pending" (internal pipeline term)

### Compliant public language to USE instead

- "lower-variance mix" (Conservative)
- "star-forward mix" (Balanced)
- "wider-edge mix" (Aggressive)
- "clean leans"
- "model audit"
- "calibration"
- "model anomaly" / "R5 guardrail"
- "educational analytics — not betting advice"
- "risk-aware" / "lower variance" / "higher variance"

### Required behavior

- Preserve **educational / responsible-use framing**
- Preserve **accessibility** (keyboard nav, aria attributes, focus rings, color contrast)
- Preserve **reduced-motion support** (every keyframe paired with `@media (prefers-reduced-motion: reduce)`)
- Preserve **mobile usability** (test at 390px / 768px in source review)
- Preserve **Responsible Use page tone** — must stay somber, no casino glow
- **Trust current project data over old real-world memory** (e.g. if data says James Harden is on CLE, that's authoritative)

### Session document hygiene

- `SESSION_*.md` progress/handoff docs should remain **untracked** unless the operator explicitly asks
- Root `gametime-picks-logo.png` may remain untracked (canonical asset is `app/public/brand/gametime-picks-logo.png`)
- Some old uploads may have expired; rely on repo SESSION docs for context, not on external uploads

### Pipeline change discipline

- Avoid pipeline changes unless first diagnosed and the change is clearly safe, small, and free
- Test file (`_test.py`) updates are OK when contract changes warrant them
- Bridge scripts that orchestrate existing audited pipeline functions are OK as one-off runs without committing the bridge

---

## 7. MLB EXPANSION PLAN (the next big work)

After PR #39 merges, the next major direction is **MLB expansion**.

### User's MLB direction (verbatim intent)

- Add MLB props to the site
- **Exclude home runs from the main projection model** — they're too high-variance for standard confidence tiers
- Create a separate **Home Run Picks / Power Board** area for HR-style markets
- Explore free data and APIs first; minimize paid spend
- **Categorize UI by sport** (NBA / MLB sections)
- Eventually support **Multi-Sport Parlay Lab** (NBA-only, MLB-only, Multi-sport modes)

### Easiest MLB MVP markets (start here)

1. **Pitcher strikeouts** — most stable signal; ample free data
2. **Batter hits** — common, well-modeled
3. **Batter total bases** — secondary
4. **Batter hits + runs + RBIs (HRR)** — composite stat, well-published
5. **Walks** — only if free data is easy

### Home Run market (SEPARATE)

- Live in its own **Power Board** route — not the main projection board
- High-variance; should use a **power profile**, not standard High/Medium/Low confidence
- Inputs to research: barrel rate, hard-hit rate, exit velocity, launch angle, pitcher HR allowed, park factor, handedness splits, weather, batting-order position
- Markets to consider only after Power Board MVP: HR Yes/No, 1+ HR, 2+ HR

### Free data sources to research

**Schedule + box scores (highest priority — like nba_api):**
- `MLB-StatsAPI` (Python wrapper around MLB Stats API):
  - Free official MLB Stats API
  - Endpoints: schedule, rosters, probable pitchers, player game logs, box scores, standings
  - Use for: daily schedule, in-game/settlement box scores, season stats
- `pybaseball` (Python library):
  - Wraps Baseball Savant / Statcast / Fangraphs
  - Hard-hit rate, barrel rate, exit velocity, launch angle, xwOBA, xSLG
  - Pitcher profiles (whiff rate, called-strike rate, K-rate, opponent batting splits)
  - Use for: projection inputs + Power Board
- **ESPN MLB free endpoints** (already used in NBA path):
  - Scoreboard, injuries, news, probable pitchers (when published)
  - Use for: probable pitcher confirmation, injury/news context

**Paid (only if approved):**
- The Odds API `baseball_mlb` keys:
  - Pitcher strikeouts (`pitcher_strikeouts`)
  - Batter hits (`batter_hits`)
  - Batter total bases (`batter_total_bases`)
  - Batter HRR (`batter_hits_runs_rbis`)
  - HR market kept SEPARATE if ever approved
  - Same credit-cost math as NBA: events × markets × regions
- Same 452 credits remaining as of 2026-05-16 (after the 3-credit May 17 NBA run)

### Recommended UI architecture

**Keep NBA stable.** Add MLB as a sibling section, not a replacement.

**Proposed nav structure:**

```
Home  ·  NBA  ·  MLB  ·  Parlay Lab  ·  Results  ·  Methodology  ·  Responsible Use
```

NBA submenu (drop-down or section header):
- Board
- Headliners
- Player props

MLB submenu (drop-down or section header):
- Board
- Power Board (HR-only)
- Probable pitchers

**Proposed routes (safer than overwriting existing):**

```
/                       — multi-sport homepage
/nba                    — NBA hub (or just nav under NBA)
/nba/board              — current /board renamed (with redirect from /board)
/mlb                    — MLB hub
/mlb/board              — MLB main projection board (no HR)
/mlb/power              — Home Run Power Board (separate)
/mlb/results            — MLB settlement page (or merged with /results via tabs)
/parlay-lab             — multi-sport (NBA-only / MLB-only / Multi)
/results                — multi-sport (NBA / MLB tabs)
/methodology            — multi-sport (NBA / MLB sections)
/responsible-use        — unchanged
```

**Migration discipline:**
- Do NOT break `/board`, `/parlay-lab`, `/results` — add redirects to new sport-aware paths
- Existing components (`PlayerAvatar`, `getPlayoffContext`, etc.) are NBA-flavored — abstract them gradually, don't refactor everything in one PR
- Parlay Lab multi-sport requires persisted candidate snapshots (still a future PR — see §5)

### Recommended MLB PR roadmap

| PR | Title | Scope |
|---|---|---|
| **MLB-0** | docs(mlb): research + architecture proposal | Research-only PR. Documents free data sources, proposed routes, proposed schema for MLB board JSON, sport-categorized component plan, MLB confidence tiers, Power Board separation rationale. **No code changes.** |
| **MLB-1** | feat(mlb): free schedule + landing page | `/mlb` route with free MLB-StatsAPI schedule fetch (no paid API). Empty board state. Sport-categorized nav. Redirect plumbing in place. |
| **MLB-2** | feat(mlb): pitcher strikeouts MVP | First real MLB market. Uses free pybaseball/Statcast for projection inputs. ONE paid Odds API call for one game's K lines (~3 credits, ask first). |
| **MLB-3** | feat(mlb): batter hits / total bases / HRR | Add the remaining MVP markets. Same paid pattern (smallest run). |
| **MLB-4** | feat(mlb): settlement + Results page | Adapt `pipeline/settle_results.py` to grade MLB markets. Add MLB tab to `/results`. |
| **MLB-5** | feat(mlb): Home Run Power Board | Separate route. Power profile (not High/Med/Low). Barrel rate / xSLG / pitcher HR allowed inputs. |
| **MLB-6** | feat(parlay-lab): multi-sport modes | NBA-only / MLB-only / Multi-sport modes. **Requires persisted candidate snapshots first.** |

### MLB hard rules (inherit + new)

- All NBA hard rules apply
- **HR markets stay separate** from main projection model — do not let HR variance pollute conservative/balanced parlay rules
- **No paid MLB API calls without explicit approval** and a credit estimate
- **MLB projection math** is a fresh model — do not copy NBA scoring weights blindly; pitcher-strikeout dynamics differ
- **Pitcher confirmation** is critical — projection only valid when probable pitcher is confirmed
- **Weather + park factor** for HR Power Board must come from free authoritative source (NWS / MLB Stats API) — never fabricate

---

## 8. First prompt for the next Claude Code session

> Copy-paste this verbatim into the next conversation.

---

**Read `SESSION_HANDOFF_2026-05-16_MLB_NEXT.md` in full before doing anything.**

You are continuing GameTimePicks. The previous Claude Code conversation closed and you have no memory of it. The handoff file in the working directory root is the source of truth.

## Phase 0 — Reorient

Run:

```
cd ~/Downloads/gametimepicks
git status --short
git branch --show-current
git log --oneline -16
gh pr view 39 --json number,state,headRefName,mergeStateStatus,changedFiles,commits -q '{n: .number, state: .state, head: .headRefName, mergeState: .mergeStateStatus, files: .changedFiles, commits: [.commits[] | .oid[0:7]]}'
gh pr checks 39 2>&1 | head -10
```

Confirm: PR #39 still OPEN / CLEAN with 2 commits (`b3edf28`, `0ab760f`) and all 3 Vercel checks pass; branch is `feature/may17-slate-parlay-quality`; main HEAD includes `9990269`.

If PR #39 has been merged in the meantime, switch to main, `git pull`, and treat its commits as already shipped.

## Phase 1 — PR #39 first

If PR #39 is **still open**:
1. Open the preview URL: https://gametime-picks-git-featu-90667a-yashwantbalaji33-7164s-projects.vercel.app
2. Walk the visual review checklist in §3 of the handoff
3. Report findings — DO NOT auto-merge
4. Wait for operator approval to merge

When the operator approves PR #39 merge, follow the merge-prompt block in §3 of the handoff verbatim.

If PR #39 has **already been merged**: skip Phase 1.

## Phase 2 — Start MLB expansion as an audit/research PR

After PR #39 is merged, start MLB-0 (research/architecture only, no code-heavy implementation).

Create a new branch:

```
git checkout main
git pull origin main
git checkout -b feature/mlb-0-research
```

Do the research described in §7 of the handoff:

1. Verify free MLB data sources (MLB-StatsAPI, pybaseball, Baseball Savant, ESPN MLB) are accessible from this environment
2. Inspect existing pipeline for any MLB plumbing (almost certainly none)
3. Propose:
   - Sport-categorized nav + route architecture (do not break NBA paths)
   - MLB board JSON schema (mirror NBA but add probable-pitcher field)
   - MLB confidence tiers (may need to differ from NBA — strikeouts are smoother than usage stats)
   - Power Board separation rationale + HR-specific inputs
   - Free vs paid API split
   - MLB MVP market priority order (start with pitcher strikeouts)
   - Component reuse plan (which NBA components abstract cleanly, which need sport-aware refactor)
4. Document in a new untracked progress log `SESSION_PROGRESS_MLB_0_RESEARCH.md`

**Hard rules:**
- DO NOT run paid Odds API
- DO NOT implement code-heavy features in this PR — only research + a written proposal
- DO NOT modify NBA UI/data
- DO NOT touch `.github/workflows/*` or `package*.json`
- DO NOT add npm dependencies
- DO NOT fabricate MLB data, schedules, or game IDs
- DO NOT use forbidden public copy (see handoff §6)
- All free data probes should be one-shot read-only commands you can document

## Phase 3 — Report and stop

Open MLB-0 as a docs-only PR with the proposal. Then stop and wait for operator approval before implementing MLB-1.

Final report should cover:
- PR #39 status (open / merged with SHA)
- MLB-0 PR link
- Free data source verification results
- Proposed architecture
- Recommended MVP scope
- Open questions for the operator

Do NOT start MLB-1 implementation without explicit approval.

---

End of suggested prompt.

---

## 9. Quick verification checklist (for the new session)

After reading this handoff, the new session should be able to answer:

- ✅ What branch am I on? → `feature/may17-slate-parlay-quality` (or `main` if PR #39 was merged)
- ✅ What's the open PR? → PR #39
- ✅ What is PR #39 about? → May 17 Game 7 board + parlay quality + Methodology mobile fix + phantom MIN/SAS removal
- ✅ What's the May 15 hit rate? → 55.2% on 145 decisive picks (Clean 57.0% / R5 48.4%)
- ✅ Why no parlay hit-rate reporting yet? → Candidate snapshots not persisted (future PR)
- ✅ What's the next major direction? → MLB expansion (sport-categorized UI, free data sources, HR Power Board separation)
- ✅ Can I run the paid Odds API? → Only with explicit approval + credit-cost estimate
- ✅ Can I fabricate data? → No — ever
- ✅ What language is forbidden in public copy? → "safe bet", "lock", "guaranteed", "best bet", "free money", "can't miss", "no room for error"
- ✅ What's the canonical logo path? → `app/public/brand/gametime-picks-logo.png`
- ✅ Where are settlement scripts? → `pipeline/settle_results.py` + `pipeline/export_results.py`
- ✅ Where's the parlay candidate logic? → `app/src/lib/parlay-builder.ts`

---

## 10. Final notes

- **Tests stay green** in current state: 39 parlay assertions / 66 settlement / 38 export / public_copy / typecheck / build all PASS
- **No fabricated data** anywhere — every audit was performed against real nba_api / Odds API / box-score data
- **Operator-approved paid spend total this branch:** 3 credits (May 17 board fetch)
- **Quota remaining:** ~449 credits on the Odds API (out of 500/month)
- **Vercel duplicate project (`gametimepicks` no-dash)** still posts redundant checks on every PR — operator-side cleanup task; not blocking
- **The `auto-refresh` workflow has been cancelling itself** (concurrency-group interaction) — flagged for a future pipeline PR; not in current scope
- **Pre-existing legacy PRs #1 / #2 / #4 / #5 are stale** — leave them alone unless the operator points to one
- **ChatGPT conversation context expires.** This handoff is the canonical source of state for the next Claude Code conversation. Do not assume the new conversation can see anything from the prior session.
