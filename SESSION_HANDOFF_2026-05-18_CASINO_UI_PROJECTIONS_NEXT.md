# Session handoff — 2026-05-18 · Casino UI + May 18 projections

> Generated 2026-05-18 ~03:00 AM ET. Read this whole file before any work.
> Untracked (do not commit). Working directory: `~/Downloads/gametimepicks`.

---

## 1. Current repo / branch / PR state

- **Current branch:** `feature/may18-projections-casino-card-overhaul`
- **Current HEAD SHA:** `189a91498e1fe4b4b8052ee4ef6017fc0a02ae63` (`189a914`)
- **Current `origin/main` HEAD:** `1b042fc3319c104dffd9a178dbcc7efedd816293` (`1b042fc` — PR #54 squash merge)
- **Working tree:** clean except expected untracked SESSION_*.md, `.claude/`, root `gametime-picks-logo.png`, `pipeline/cache/*`.

### Open PRs

- **PR #55** — `feature/may18-projections-casino-card-overhaul`
  - State: **OPEN · CLEAN · MERGEABLE · NOT MERGED**
  - HEAD: `189a914`
  - URL: https://github.com/yashwantbalaji3/gametimepicks/pull/55
  - Commits (in order):
    1. `a210d41a64943ae235e763b753761a5376237eff` — NBA 3-tile scoreboard
    2. `189a91498e1fe4b4b8052ee4ef6017fc0a02ae63` — MLB tiles + homepage sports rail + parlay chip glow
  - Vercel checks: **3/3 PASS**
    - `Vercel – gametime-picks` (canonical) PASS — https://vercel.com/yashwantbalaji33-7164s-projects/gametime-picks/FUXJVmCXnvbNC4qRvEgKpgLVrXdD
    - `Vercel – gametimepicks` (duplicate, no-dash) PASS
    - `Vercel Preview Comments` PASS
  - Changed files (5):
    - `app/src/app/page.tsx`
    - `app/src/components/homepage-sports-rail.tsx` (new)
    - `app/src/components/mlb/mlb-lean-row.tsx`
    - `app/src/components/parlay-builder-client.tsx`
    - `app/src/components/vault-player-card.tsx`

### Stale legacy PRs (leave alone — pre-existing, unrelated)

- PR #5 — `fix/dry-run-clobber-guard`
- PR #4 — `fix/public-status-leaks`
- PR #2 — `fix/auto-refresh-yaml`
- PR #1 — `fix/hide-admin-status-on-board`

### Untracked file hygiene

Keep these untracked (operator convention):
- `SESSION_HANDOFF_*.md`
- `SESSION_PROGRESS_*.md`
- `.claude/`
- root `gametime-picks-logo.png` (canonical asset lives at `app/public/brand/gametime-picks-logo.png`)
- `pipeline/cache/*`

---

## 2. Recent production history / merged PR timeline

Latest 10 commits on `main`:

```
1b042fc feat(results): centralize model audit by sport and date (#54)
34d95e2 fix(parlay+results): eliminate stale archived games + settle NBA May 17 Game 7 (#53)
34af27f feat(ui): unify sport lobby action grids across NBA/MLB/NHL/IPL (#52)
ae3e8da feat(ui): collapse all sport Power Boards into a shared compact shell (#51)
1f50b2d feat(ui): revamp casino navigation and sport page experience (#50)
cef082c feat(ui): add sport board date routing for upcoming slates (#49)
1f01880 feat(data): refresh next-week sport schedules and upcoming-slate UI (#48)
9bac786 feat(model): cross-sport projection audit and guardrail improvements (#47)
1f4f856 auto-refresh: 2026-05-17 18:58 ET (props-only)
a5c7b4b feat(ui): add NHL and IPL sport shells (#46)
```

### Important merged PRs and what they shipped

| PR | Squash SHA | What |
|---|---|---|
| #45 | `37e57c1` | Aligned NBA and MLB sport sections; unified Results audit |
| #46 | `a5c7b4b` | Added NHL + IPL sport shells |
| #47 | `9bac786` | Cross-sport projection audit + guardrail improvements (MLB R5 lowered to 20pp; `contextTag`) |
| #48 | `1f01880` | Refreshed next-week sport schedules + upcoming-slate UI |
| #49 | `cef082c` | Date-routed sport boards (`/<sport>/board/[date]`) |
| #50 | `1f50b2d` | Centered logo + unified sport tabs |
| #51 | `ae3e8da` | Compact shared Power Boards |
| #52 | `34af27f` | Sport lobby action grids (Model Board / Power / Parlays / Results) |
| #53 | `34d95e2` | **Parlay Lab stale-game fix + NBA May 17 Game 7 settled** |
| #54 | `1b042fc` | **Centralized Results audit hub by sport and date** |
| #55 | OPEN — `a210d41` then `189a914` | NBA 3-tile scoreboard + MLB tiles + homepage sports rail + parlay chip glow |

---

## 3. Current user priorities

The user is unhappy with the site's polish level. Verbatim themes from recent messages:

1. **Casino/sportsbook product feel.** Wants futuristic, premium, neon/casino vibes. Less text-heavy panels.
2. **Projection-first cards.** LINE / PROJECTION / EDGE should pop. Reasons collapse to bullets.
3. **Easy app-like navigation.** FanDuel/DraftKings/Fanatics flow with GameTimePicks branding.
4. **Data verified multiple times before display.** Stale games are unacceptable on active surfaces.
5. **May 18 projections** should be live where sportsbook lines exist; otherwise show honest "lines pending / projections arriving soon."
6. **Centralized Results.** Already done in PR #54 — preserve this structure.
7. **Overall model accuracy displayed honestly.** Use approved copy ("calibration trend", "improving sample"); no overclaims.
8. **Future multi-sport parlays** are the differentiator — but only after candidate-slip snapshot persistence.
9. **No more tiny one-component PRs.** User said this explicitly after PR #55's first commit was too small. PR #55 now has 5 changed files; next session should keep scope meaningful.

---

## 4. Data correctness status

### Parlay Lab stale LAL/OKC root cause + fix (PR #53)

- **Root cause:** `app/src/app/parlay-lab/page.tsx` looped through every NBA board file on disk (May 4 → May 17) and unconditionally fed all leans + all games into the picker. First-round boards include matchups like LAL @ OKC that are long-eliminated.
- **Fix shipped in PR #53:** restrict the data load to `activeSlate.upcomingAndTodayDates`. Archived dates cannot leak into the active picker. **Verified at runtime** on `/parlay-lab` — zero NBA team abbreviation leaks.

### NBA May 17 Game 7 settled (PR #53)

- ESPN: **CLE 125 @ DET 94, `completed=true`**.
- Settlement result: **41-20 on 61 decisive (67.2% hit rate)**.
- Pipeline fix shipped: `pipeline/settle_results.py` now hydrates `lean`/`side`/`projection`/`confidence`/`edgePct`/`riskFlags` from the board file when the leans_log entry was written before enrichment (May 17 entries had `confidence: trends_pending`).

### NBA lifetime audit

- **121-85 on 206 decisive · 58.7%**
- Across two settled dates: May 15 and May 17.

### MLB May 16 audit

- **144-128 on 272 decisive · 52.94%**
- One settled date: May 16.

### Combined cross-sport hit rate (shown on `/results`)

- **NBA 121-85 + MLB 144-128 = 265-213 on 478 decisive · ~55.4%**

### MLB May 17

- Board is schedule-only (`propsAvailable=false`, 0 leans). Nothing to settle.

### NHL / IPL

- Both are schedule-only shells. No projections. No settled rows. Excluded from overall hit rate until they have settled decisive rows.

### Invariants

- **Pending games must never count as losses.**
- **Sports with no settled rows must not appear in overall hit rate.**
- **Parlays must not appear in overall hit rate until candidate-slip snapshots exist.**
- **Pushes excluded from hit-rate denominator.**

---

## 5. May 18 projection status and paid-credit blocker

It is currently early May 18, 2026 (ET). Schedules (from free APIs):

| Sport | May 18 |
|---|---|
| NBA | SAS @ OKC (Scheduled, Western Conf Finals Game 1) |
| MLB | 14 games |
| NHL | MTL @ BUF (Scheduled) |
| IPL | CSK v SRH (Scheduled) |

### Paid-fetch blocker

**Claude's shell does NOT have `ODDS_API_KEY`.** Paid Odds API runs cannot be invoked from this session. The next session should check `echo $ODDS_API_KEY` first; if absent, **STOP and tell the operator the commands below**. Do not skip the cost-floor check.

### Exact commands operator/next session must run in an env with the key

```bash
# NBA May 18 SAS @ OKC — Western Conf Finals Game 1
# Cost: ~3 credits  (1 event × 3 markets × 1 region)
# Post-run balance: ~365 / 500 monthly (well above 300 safe floor)
python -m pipeline.generate_daily_board --date 2026-05-18

# MLB May 18 full slate (~14 games)
# Cost: ~42 credits  (14 events × 3 markets × 1 region)
# Post-run balance: ~326 / 500 monthly (still above 300 floor)
# Per prior instructions: MLB needs operator approval even when safe.
python -m pipeline.mlb.generate_mlb_board --date 2026-05-18

# NHL May 18 MTL @ BUF — BLOCKED
# Cost would be ~2 credits, but pipeline/nhl/ projection MVP does
# not exist yet. Paid odds alone would not produce leans.

# IPL — BLOCKED on per-player stats provider decision.
```

### Credit context

- Remaining credits last estimated **~368 / 500 monthly**.
- NBA + MLB May 18 combined: ~45 credits → ~323 post-run (above 300 floor).
- Monthly recommended cadence:
  - MLB ~4 days/week (~180/mo) + playoff-only NBA (~40/mo) + playoff-only NHL (~36/mo) = **~256 credits/month**.
  - Full daily all-sport coverage exceeds the 500/mo free budget.

### What ships automatically once paid fetches run

- The new 3-tile **LINE / PROJECTION / EDGE** scoreboard renders automatically on `/nba/board` and `/mlb/board` the moment a board JSON exists for the active date. No further UI work required.

---

## 6. PR #55 details

### `a210d41` — NBA projection card 3-tile scoreboard

`app/src/components/vault-player-card.tsx`. Refactored per-market hero from a 2-column "Sportsbook line / Model projection" + small EdgeTag chip into a unified 3-tile sportsbook scoreboard:

```
┌─────────┬───────────────┬─────────┐
│  LINE   │  PROJECTION   │  EDGE   │
│  26.5   │     27.4      │ +9.2%   │
└─────────┴───────────────┴─────────┘
```

- New `ScoreboardTile` subcomponent.
- Each tile: `rgba(7, 11, 26, 0.55)` neon-bordered surface, `minHeight: 56`, mono uppercase eyebrow, big tabular value at `clamp(20px, 3vw, 26px)`, gold glow textShadow on PROJECTION/EDGE.
- EDGE color switches to `--vault-warn` when R5/suspicious-edge caps the lean.
- Edge magnitude capped visually at 50pp.

### `189a914` — MLB tiles + homepage sports rail + parlay chip glow

- **MLB `StatTile` rewritten** (`mlb-lean-row.tsx`) to match NBA `ScoreboardTile` visual weight: same dimensions, same eyebrow, same value sizing, same gold glow. MLB-specific accent semantics preserved (gold = projection, success-green = positive EDGE, warn-amber = R5 cap).
- **`HomepageSportsRail`** (new `app/src/components/homepage-sports-rail.tsx`) wired into `/`. Renders 4 sport cards (NBA/MLB/NHL/IPL) with live-status chips, matchup line, lifetime audit summary, primary CTA. Underneath: ticket-style Model Audit + Parlay Lab CTA pair. Pure server component; all status strings derived from on-disk data.
- **Parlay Lab selected-player chips** got a premium glow on selection: gold gradient background, soft gold border, inset 1px gold ring, 12px outer gold glow, gold-bright text, 600 weight.
- **Paid-fetch commands documented** in the commit message + the SESSION_PROGRESS log.

### Routes verified at 390×812 mobile

- `/` — sports rail renders 4 sport cards + 2 ticket CTAs · no overflow
- `/mlb/board/2026-05-16` — **327 LINE/PROJECTION/EDGE tile grids** render · no overflow
- `/parlay-lab` — renders without console errors
- `/mlb` — renders cleanly
- `/results` — combined 55.4% overall hit rate displayed

### Tests passed (all)

- `pipeline/public_copy_test.py`
- `pipeline.context_tag_test` (18 assertions)
- `pipeline.parlay_builder_test` (39 assertions)
- `pipeline.settle_test` (66 assertions)
- `pipeline.export_results_test` (38 assertions)
- `pipeline.mlb.settle_mlb_results_test`
- `pipeline.mlb.export_mlb_results_test`
- `pipeline.mlb.mlb_model_test` (13 assertions)
- `npm run typecheck` · `npm run build` (35 routes static-exported)

### Honest framing

PR #55 is **meaningful multi-surface UI work** but **NOT the full casino rebuild** the user keeps asking for. The next session must avoid shipping another tiny one-component PR.

---

## 7. Results architecture after PR #54

**Centralized hub at `/results`. Sport subtabs no longer contain Results.**

### Routes

- `/results` — hub (overall accuracy, sport cards, calibration trend tile row, links into date-level audit)
- `/results/nba` — NBA audit (re-exports `/nba/results` body)
- `/results/mlb` — MLB audit (re-exports `/mlb/results` body)
- `/results/nhl` — NHL pending shell
- `/results/ipl` — IPL pending shell
- `/results/date/2026-05-15` — pre-rendered NBA May 15 audit
- `/results/date/2026-05-16` — pre-rendered MLB May 16 audit
- `/results/date/2026-05-17` — pre-rendered NBA May 17 audit
- `/results/parlays` — placeholder for parlay-slip audit (pending persistence)

### Legacy URLs preserved

- `/nba/results`, `/mlb/results`, `/nhl/results`, `/ipl/results` still work — page bodies re-exported. No 404s.

### What `/results` shows

- **Hero:** overall combined accuracy %, total decisive picks, total wins/losses/pushes
- **Sport sub-tabs strip** (Overview · NBA · MLB · NHL · IPL · Parlays)
- **Per-sport summary cards** (NBA + MLB; NHL/IPL excluded from overall until they settle)
- **Calibration trend tile row** — last 10 settled slates, each tile links to `/results/date/<date>`. Honest copy: "Early sample — tracking calibration as more slates settle." No improvement claims.
- **"How the overall hit rate is computed"** disclosure
- **Model lessons card** (from PR #47)

**Preserve this structure.** Sport subtabs should remain Overview · Model Board · Power Board · Parlays only. Do not re-add a Results subtab anywhere.

---

## 8. UI / product status by surface

### Homepage `/`

- PR #55 added `<HomepageSportsRail>` (4 sport cards + 2 ticket CTAs).
- Still needs deeper command-center polish — bigger hero, animated odds-board texture, less paragraph text. Many older sections remain (Trending tabs, "What's on the floor", Anatomy callout, MLB section, etc.).

### NBA Board `/board`, `/nba/board`, `/nba/board/[date]`

- PR #55 adds the 3-tile scoreboard hero on each player card's market row.
- Needs an active NBA board for visual verification of live tiles. The May 17 slate is past; the May 18 SAS @ OKC slate needs a paid fetch.
- Headliner rail + filter console still usable but could be more sportsbook-like.

### MLB Board `/mlb/board`, `/mlb/board/[date]`

- PR #55 upgrades the existing 3-tile StatTile to match NBA visual weight.
- May 16 board (272 settled leans) renders the upgraded layout cleanly (327 grids verified at 390px).
- Filter console + scan mode still mobile-friendly.
- Schedule-only date pages (May 17/18/19/...) show polished "lines pending" cards.

### Parlay Lab `/parlay-lab`, `/nba/parlays`

- Stale archived-game leak fixed in PR #53.
- PR #55 adds the premium selected-chip glow.
- Still needs: full ticket-slip card redesign for candidate cards, plus the candidate-snapshot persistence layer.

### Results `/results/*`

- Centralized and date-scoped from PR #54. Structure is correct.
- Calibration trend tile row in place.
- Could still use visual polish (bigger scoreboard hero, more obvious date cards) but no structural changes needed.

### Power Boards (`/nba/power`, `/mlb/power`, `/nhl/power`, `/ipl/power`)

- Compact shared shell from PR #51. Single premium "high-variance watch" card with planned-inputs chips.
- Honest pending state. Not yet active with real high-variance signals.

### NHL / IPL boards (`/nhl/*`, `/ipl/*`)

- Schedule-first shells. No projection pipelines.
- NHL: needs `pipeline/nhl/` with free `api-web.nhle.com` ingestion + a simple shots/saves model + paid Odds API for lines.
- IPL: blocked on paid per-player stats provider decision (Cricbuzz / SportRadar / RapidAPI cricket).

---

## 9. Critical blockers / next major work (priority order)

1. **Visual review of PR #55, then merge** — sign off if clean; otherwise push more commits onto the same branch (not a new PR).
2. **Run NBA May 18 paid fetch** in an environment with `ODDS_API_KEY` (~3 credits, leaves ~365).
3. **Run MLB May 18 paid fetch** with explicit operator approval (~42 credits, leaves ~326).
4. **If new board JSONs land in `app/public/data/boards/...`**, commit them to the same open branch if PR #55 is still open, or open a focused data PR after merge.
5. **Full homepage command-center redesign** — bigger hero, animated odds-board texture, replace any remaining text-heavy paragraphs with chips.
6. **Full Parlay Lab ticket-slip redesign** — candidate cards as premium sportsbook tickets, glowing combined-odds chip, mode strip clearer.
7. **Candidate-slip snapshot persistence** (see §10).
8. **NHL projection MVP** — free skater + goalie log loader from `api-web.nhle.com`, simple shots/saves model, then one approved ~2-credit paid odds run.
9. **IPL per-player stats provider decision** — paid Cricbuzz/SportRadar/RapidAPI evaluation.
10. **Global casino animation layer** — neon rails, ticket edges, scoreboard chip pulses, reduced-motion safe, no new dependencies.

---

## 10. Candidate-slip snapshot persistence plan

**Required before any parlay hit-rate claim.** Currently every parlay surface honestly says snapshots are pending.

### What needs to persist

For every generated candidate slip, before the games start:

```ts
interface CandidateSlipSnapshot {
  sport: "NBA" | "MLB" | "NHL" | "IPL" | "multi";
  date: string;            // YYYY-MM-DD ET
  slateId: string;         // stable hash for the day's slate
  generatedAt: string;     // ISO 8601 UTC, BEFORE first game
  profile: "conservative" | "balanced" | "aggressive";
  legs: ParlayLegSnapshot[];
  combinedOddsAmerican: number | null;
  hasSameGameLegs: boolean;
  hasSameTeamLegs: boolean;
  hasAnomalyLegs: boolean;
  rationale: string[];
  modelMeta: {
    modelVersion: string;
    confidenceMix: Record<string, number>;
    edgeBand: string;
  };
}

interface ParlayLegSnapshot {
  sport: "NBA" | "MLB" | "NHL" | "IPL";
  gameId: string | number;
  playerId: number | string | null;
  playerName: string;
  team: string;
  opponent: string;
  market: string;
  side: "Over" | "Under";
  line: number;
  odds: number;
  bookmaker: string;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  riskFlags: string[];
}
```

### File layout (planned)

```
app/public/data/parlays/nba/<date>.json
app/public/data/parlays/mlb/<date>.json
app/public/data/parlays/nhl/<date>.json     (later)
app/public/data/parlays/ipl/<date>.json     (later)
app/public/data/parlays/multisport/<date>.json   (latest)
```

### Pipeline additions (future PRs)

- `pipeline/snapshot_parlays.py` — write per-sport slip files BEFORE first game.
- `pipeline/settle_parlays.py` — grade slips after settlement, per leg + per slip.
- `pipeline/export_parlay_results.py` — write public audit JSON.

### Audit surface

- `/results/parlays` upgrades from placeholder to real audit once persisted slips exist + first slate is graded.

**Until this exists, NO parlay hit rates anywhere on the site.** All current "slip persistence pending" copy is the correct honest framing.

---

## 11. Operating rules for next session

- **No fabrication.** No fake schedules, odds, projections, results, parlays, injuries, moneylines, totals.
- **No paid API call without cost estimate + safe-floor check.** Floor is 300 credits unless operator explicitly approves lower.
- **No workflow triggers** (`gh workflow run` etc.).
- **No package.json / package-lock.json edits.**
- **No printed secrets** (no `cat .env`, no `echo $ODDS_API_KEY`).
- **No pending games counted as losses.**
- **Forbidden public copy:** "safe bet", "lock", "guaranteed", "best bet", "free money", "can't miss", "no room for error".
- **Approved public copy:** "clean leans", "lower-variance", "risk-aware", "educational candidates", "candidate slips", "model audit", "Power Board", "high-variance watch", "lower-correlation construction", "lines pending", "projections arriving soon", "live slate", "model edge", "projection card", "calibration trend".
- **Keep SESSION_*.md, `.claude/`, root logo, `pipeline/cache/*` untracked.**
- **Always run typecheck + build + pipeline tests before commit.**
- **Always verify mobile at 390×812** for any UI change.
- **Preserve centralized Results architecture from PR #54.** Sport subtabs are Overview · Model Board · Power Board · Parlays. Do NOT re-add Results to sport subtabs.

---

## 12. Recommended first prompt for next Claude Code session

Copy this verbatim:

---

**Read `SESSION_HANDOFF_2026-05-18_CASINO_UI_PROJECTIONS_NEXT.md` in `~/Downloads/gametimepicks` first. Then verify state without making any code changes.**

You are continuing GameTimePicks. The previous Claude Code conversation closed at context limit. The handoff file is the source of truth.

## Phase 0 — Verify repo + PR #55 state

```bash
cd ~/Downloads/gametimepicks
git status --short
git branch --show-current
git log --oneline -10
gh pr view 55 --json number,state,headRefOid,mergeStateStatus -q '.'
gh pr checks 55 | head -10
```

Confirm:
- Branch is `feature/may18-projections-casino-card-overhaul`
- HEAD is `189a914`
- main is at `1b042fc` (PR #54 squash)
- PR #55 is OPEN / CLEAN / MERGEABLE with 3 Vercel checks PASS
- Working tree clean except expected untracked docs/cache/logo

If PR #55 has been merged in the meantime, switch to `main`, pull, treat its commits as shipped, and skip Phase 1.

## Phase 1 — Visual review of PR #55

Open the preview URL from the `Vercel – gametime-picks` check and walk these routes at desktop + 390×812 mobile:

- `/` (homepage — verify the new `HomepageSportsRail` between trending tabs and "What's on the floor")
- `/mlb/board/2026-05-16` (verify 327 upgraded LINE/PROJECTION/EDGE tile grids)
- `/parlay-lab` (verify selected-player chip glow)
- `/nba/board` (will show off-day until a May 18 paid fetch runs)
- `/results` (verify combined 55.4% overall + calibration trend tile row)

Report findings. **Do not auto-merge.** Wait for operator approval.

## Phase 2 — Decide on May 18 paid fetches

Run `echo $ODDS_API_KEY` (do not print the value — just check existence). If the key is set in your env:

- **NBA May 18 paid fetch** (~3 credits, post-run ~365/500): run `python -m pipeline.generate_daily_board --date 2026-05-18`. Verify the resulting board file at `app/public/data/boards/2026-05-18.json`.
- **MLB May 18** (~42 credits, post-run ~326/500): only after operator approval per the safe-floor rule. Run `python -m pipeline.mlb.generate_mlb_board --date 2026-05-18`.

If the key is NOT set, STOP and report the exact commands to the operator. Do not try to work around the missing key.

If new board JSONs are written and PR #55 is still open, **commit them to the same branch** (`feature/may18-projections-casino-card-overhaul`). Do not open a new PR for data refresh while PR #55 is open.

## Phase 3 — Next focused PR (only after PR #55 merges)

Pick ONE of these from §9 of the handoff and ship a meaningful PR (avoid tiny one-component PRs):

A. **Full homepage command-center redesign** — bigger hero, animated odds-board texture, replace remaining text-heavy paragraphs with chips, polish the Trending tabs region.

B. **Full Parlay Lab ticket-slip redesign** — candidate cards as premium sportsbook tickets, combined-odds chip styling, clearer sport-mode strip.

C. **Results visual polish** — bigger scoreboard hero, more obvious date cards, mobile table readability. Do NOT change Results structure or move hit-rate emphasis outside Results.

Whichever option is chosen, follow §11 operating rules. Run tests + build + mobile verify before commit. Open a PR with a clear title; do not auto-merge.

End of suggested prompt.

---

## 13. Verification checklist for next session

### Pipeline tests

```bash
cd ~/Downloads/gametimepicks
python3 pipeline/public_copy_test.py
python3 -m pipeline.parlay_builder_test
python3 -m pipeline.settle_test
python3 -m pipeline.export_results_test
python3 -m pipeline.mlb.settle_mlb_results_test
python3 -m pipeline.mlb.export_mlb_results_test
python3 -m pipeline.context_tag_test
python3 -m pipeline.mlb.mlb_model_test
cd app && npm run typecheck
cd app && npm run build
cd ..
```

### Forbidden-copy grep (must return EMPTY for rendered code)

```bash
grep -rnE "safe bet|\block\b|\blocks\b|\bguaranteed\b|\bbest bet\b|free money|can'?t miss|cant miss|no room for error|provider failed|provider error|odds provider|schedule provider|trends_pending" app/src 2>/dev/null | grep -v "//\|node_modules\|\.next" | head -10
```

### Mobile (390×812) routes to verify

- `/`
- `/nba`
- `/nba/board`
- `/mlb`
- `/mlb/board`
- `/mlb/board/2026-05-16`
- `/mlb/board/2026-05-18`
- `/parlay-lab`
- `/results`
- `/results/date/2026-05-17`

Check for each:
- No horizontal overflow (`document.documentElement.scrollWidth === window.innerWidth`)
- No console errors
- Sport tabs at the top correctly reflect Overview / Model Board / Power Board / Parlays (no Results subtab)
- New 3-tile LINE/PROJECTION/EDGE scoreboard renders when leans exist
- Pending states are clearly framed (no "dead" panels)

---

## 14. Final notes

- **PR #55 is meaningful but still not the full casino rebuild.** Five files changed across NBA cards, MLB cards, homepage, and parlay chips — but the user has been explicit that they want more aggressive end-to-end overhauls per PR.
- **Next session: avoid another tiny one-component PR.** Pick a meaningful slice (homepage, parlay slips, or coordinated data + UI refresh) and ship something substantive.
- **Correctness/trust is critical after the LAL/OKC stale leak.** Always verify no archived games leak into active surfaces.
- **If forced to choose between data correctness and UI polish — choose data correctness first, then UI.** The user has zero tolerance for fabricated or stale data.
- **Vercel CDN can occasionally serve a stale build** (seen during PR #52/#54 propagation). After any merge, the operator may need to re-trigger Vercel manually if the custom domain doesn't refresh within ~3 minutes.
- **Auto-refresh workflow** has been running multiple times per day; it occasionally fires while you're working and produces tiny commits on `main`. If you see one, `git pull --rebase` and continue.
- **Operator-side tasks pending:** disconnect duplicate Vercel project (`gametimepicks` no-dash) GitHub integration if the duplicate-checks noise becomes a problem.

End of handoff.
