# GameTimePicks — Master Handoff (Project + Session) — 2026-06-01

> **Purpose:** a single, self-contained brief a brand-new Claude Code session can
> read to understand the whole project, the operating rules, and everything done
> in the recent sessions. Read §6 (Hard Rules) and §9 (Gotchas) before touching
> anything.

---

## 0. Orientation (read first)

- **Repo (the only one — never use an empty workspace, never clone if it exists):**
  ```bash
  cd /Users/yashwantbalaji/Downloads/gametimepicks
  ```
- **Current main SHA:** `6753630`
- **Production URL:** https://gametimepicks.yashwantbalaji.com (Vercel project **`gametimepicks`**)
- **What this is:** an **educational, honest** sports player-prop analytics site. It
  compares a statistical model's projections to bookmaker lines for NBA + MLB
  props, builds "suggested parlays," tracks results transparently, and offers a
  **paper-only** Bank Builder. It is **not** betting advice; it never takes money.
- **Today in the data:** active pregame slate = **2026-06-01** (MLB-only — no NBA
  games that day); latest **settled** slate = **2026-05-30**. Public-era tracking
  starts **2026-05-27** (May 25/26 are pre-era and filtered out everywhere).

---

## 1. TL;DR — current state

- Main `6753630`, working tree clean (only ~52 untracked root working-notes files
  — **leave them untracked**, they are scratch).
- Frontend: **562 lib tests pass**, `tsc` clean, `npm run build` green.
- The homepage is now a **Command Center dashboard** (left rail + status bar +
  featured slip + builder + sidebar modules + an additive guided "New here?"
  beginner finder). All brand gold/vault theme.
- **Open PRs:** preview concept branches **#213 / #214 / #215** (draft, "DO NOT
  MERGE" — design references only); stale operator PRs **#1 / #2 / #4 / #5**
  (obsolete — every fix already exists on main; safe to close).
- The June-1 `morning-projections` run **succeeded** (a previous run had timed out;
  see §10) — the site has a live June-1 pregame slate.

---

## 2. Repo, environment, how to run

**Stack:** Next.js 14 **static export** (`output: "export"`, `trailingSlash: true`),
App Router (`app/src/app`), React 18, TypeScript, Tailwind + heavy CSS-variable
theming. Build emits to `app/out/`. Data is committed JSON under
`app/public/data/`. A Python pipeline (`pipeline/`) generates + settles that data.

**Frontend (run from `app/`):**
```bash
cd app
npx tsx --test src/lib/*.test.mjs   # 562 lib tests (the real test suite)
npx tsc --noEmit                    # typecheck
npm run build                       # static export to out/
npm run dev                         # dev server (port 3000)
```
**Pipeline (Python; venv at `pipeline/.venv`, Python 3.9.12):**
```bash
pipeline/.venv/bin/python -m pipeline.settle_test     # Suite-style test runner
pipeline/.venv/bin/python -m pytest pipeline/<file>_test.py   # pytest-style files
# Full settlement for ONE date (the official path):
SETTLE_DATE=2026-05-30 bash scripts/automation_settle.sh
```
> There is **no unified `pytest pipeline`** that passes — the repo mixes two test
> styles: **Suite-style** files (run via `python -m pipeline.<name>_test`, they
> `sys.exit()` at import so pytest chokes on them) and **pytest-style** files
> (run individually with pytest from the venv). Don't run `pytest pipeline` whole.

**Browser verification:** use the Claude Preview MCP. `.claude/launch.json` defines
config **`gtp-dev`** (npm run dev, port 3000). Pattern: `preview_start` → navigate
via `preview_eval(window.location.href=...)` → read/screenshot.

---

## 3. Architecture & tech stack

- **Routes** (`app/src/app/`): `/` (home dashboard), `/projections`, `/parlay-lab`,
  `/results`, `/bank-builder`, `/events`, `/about`, plus legacy/sport routes
  (`/nba`, `/mlb`, `/nhl`, `/board`, `/world-cup`, `/methodology`,
  `/responsible-use`, `/results/model-audit`). `/ipl`, `/world-cup`, cricket are
  **unwired** from user-facing surfaces (kept in code, not linked).
- **Global shell:** `app/src/app/layout.tsx` renders `CommandRail` (desktop left
  rail) + the production `Nav` (mobile only) + `SlateStatusBar` + `Footer` +
  `MobileBottomNav` + `DisclaimerBanner`.
- **Theme:** ~369 CSS variables in `app/src/app/globals.css` (`--vault-*` dark
  navy+gold "vault/casino" theme is primary; `--gtp-*` are surface/card tokens).
  Fonts: Geist (display) + JetBrains Mono. The whole site is token-driven, so a
  palette can be changed by overriding tokens.
- **Data loaders** (`app/src/lib/`): `data-parlays.ts`
  (`getSuggestedParlaysForDate`, `getLatestOptimizerSnapshot`,
  `getOptimizerSnapshotForDate`), `parlay-results.ts` (`getOptimizerSummary`,
  `getOptimizerGradedDates`, `getOptimizerGradedForDate`), `data.ts`/`data-mlb.ts`
  (boards, lifetime summaries), `parlay-suggested.ts` (slip filtering helpers +
  `ParlaySlip` type), `parlay-risk-sections.ts` (`classifyOddsSection`,
  `combinedAmericanOddsFromLegs`, `RiskSectionKey`), `freshness.ts`
  (`currentEtDate`), `public-parlay-era.ts` (`PUBLIC_PARLAY_RESULTS_START_DATE`).

---

## 4. Data model & date semantics

All data is committed JSON under `app/public/data/`. Per-date files are
`YYYY-MM-DD.json` (string sort = chronological).

- `parlays/optimizer/<date>.json` — the **pregame optimizer pool** (120 slips):
  `buckets[profile][sport]`, `sourcePools`, `legPool`,
  `publicRiskSections[section][lane]` where section ∈ {low,medium,high,longshot},
  lane ∈ {all,nba,mlb,multi}. This is the **active / forward-looking** slate.
- `parlays/snapshots/<date>.json` — the **suggested-parlays snapshot** (saved
  pregame; what `/`, `/parlay-lab`, Bank Builder browse).
- `parlays/optimizer-graded/<date>.json` — graded optimizer slips with per-leg
  `result`/`finalStat`/`settlementSource`. **Latest here = latest SETTLED slate.**
- `parlays/optimizer-summary.json` — `byDate` lifetime record (what `/results`
  hero + home ticker render). **Public-era filtered at read time** (excludes
  05-25/05-26).
- `results/` + `mlb/results/` — settled single-leg leans + comparison reports.
- `boards/<date>.json` (NBA), `mlb/boards/<date>.json` — per-game projections.
- **Risk bands:** Low `<+300` & 2-3 legs; Medium `+300..+599` & 3-4 legs; High
  `+600..+999` & 4-5 legs; Longshot `≥+1000` & 5-6 legs.
- **"active slate" vs "latest settled":** active = latest `optimizer/` date
  (forward-looking, may be pregame). Latest settled = **max** date in
  `optimizer-graded/` (use a sort, not array order). The status bar + UI label
  slates honestly as today / latest / settled / pregame.

---

## 5. The automated pipeline (GitHub Actions)

| Workflow | Cron (UTC) | ET | Does |
|---|---|---|---|
| `nightly-settle` | `0 7 * * *` | 3:00 AM | Settles **yesterday** (NBA via `settle_results`, MLB via `settle_mlb_results`), exports, grades optimizer/parlays/curated, runs daily audit + signal policy, commits. Orchestrator: `scripts/automation_settle.sh` (honors `SETTLE_DATE`). |
| `morning-projections` | `30 13 * * *` | 9:30 AM | Generates **today's** projections/boards/optimizer. **Can time out** if `nba_api` is blocked from CI (see §10). |
| `auto-refresh` | every 2h | — | Props refresh; **dry-run by default** (`ODDS_DRY_RUN=true`) → skips board generation; many runs show "cancelled" (concurrency/timeout) — harmless. |
| `daily-refresh` | `0 13 * * *` | 9:00 AM | Daily refresh. |

- Settlement uses **free public APIs only** (MLB Stats API; NBA via ESPN +
  `nba_api`). No paid calls. In-progress games are refused at the source layer →
  partial settlement; a later run finishes them. Re-runs are **idempotent**.
- The official settlement path is the **pipeline scripts** (never hand-edit
  outcomes). To re-settle one date locally: `SETTLE_DATE=<date> bash
  scripts/automation_settle.sh` (uses `pipeline/.venv`).

---

## 6. HARD RULES / GUARDRAILS (verbatim — these are non-negotiable)

Do **NOT**:
- settle a slate before **every** game is officially final; never settle a future
  date; never **backfill May 31** (it has no slate — a `morning-projections` run
  timed out that day; leave it empty).
- fabricate outcomes, projections, odds, stats, schedules, parlays, hit rates,
  recent games, recent10, or learning signals; never manually edit outcomes.
- use same-slate final results to alter same-slate pregame suggestions.
- restore the May-26 "replay"; leak May-25 / May-26 public hit rates (the
  16.0%-era numbers); the public era starts **2026-05-27**.
- bring **cricket or IPL** back to user-facing surfaces.
- add **WNBA / UFC / FIFA** projections, parlays, optimizer legs, or grading — they
  are **schedule-only** on `/events` (dates/matchups/venues only, "NO ODDS · NO
  PROJECTIONS").
- expose the Odds API key or any secret; scrape sportsbooks; add fake sportsbook
  links; copy FanDuel/DraftKings UI/branding.
- claim active AI / deep learning / ML unless actually implemented + evaluated
  (the site says "statistical model").
- consume the audit **policy.json** in the optimizer without explicit operator
  approval (it is observational/"tracking, not consumed"; verified no optimizer
  code reads it).
- change data / pipeline / optimizer / settlement / **generated data files** for a
  UI task.
- use **banned betting copy**: `lock`, `guaranteed`, `free money`, `risk-free`,
  `can't miss` / `cant miss`, `easy win`, `easy money`, `no-brainer` / `no brainer`,
  `sure thing`, `sharp money`. Also avoid user-facing **"safe"/"safety"** (CSS
  `safe-area-inset-bottom` is an acceptable false positive). Negations that
  contain a banned word ("no card is a sure thing", "we do not take real money")
  are fine.
- **Bank Builder** must stay **paper-trading / educational only** (no real-money
  advice). **Events** stay schedule-only.

When blocked, stop and give a precise blocker report + exact next action. Only
stage deliverable files per PR (leave the ~52 untracked root notes alone).

---

## 7. CI / Vercel / merge process

- Each PR deploys to **two** Vercel projects: the real **`gametimepicks`**
  (production gate) and a duplicate **`gametime-picks`** (legacy). Checks:
  `Vercel – gametimepicks`, `Vercel – gametime-picks`, `Vercel Preview Comments`.
- **Merge gate:** real `Vercel – gametimepicks` = SUCCESS **and**
  `mergeStateStatus` = CLEAN → squash-merge + sync main. `mergeStateStatus` can
  flip to `UNKNOWN/UNSTABLE` transiently — re-poll until CLEAN.
  - If only the **duplicate** `gametime-picks` is red (rate limit), merge is
    allowed — document the exception.
  - If the **real** `gametimepicks` is red: do **not** merge; one paced retry max;
    else stop + report.
- **Gate-wait pattern** (run a background bash loop):
  ```bash
  for i in $(seq 1 70); do
    PROD=$(gh pr view <N> --json statusCheckRollup --jq '[.statusCheckRollup[]|select((.name//.context)=="Vercel – gametimepicks")|(.state//.status)][0]')
    MS=$(gh pr view <N> --json mergeStateStatus --jq .mergeStateStatus)
    [ "$PROD" = SUCCESS ] && [ "$MS" = CLEAN ] && break
    case "$PROD" in FAILURE|ERROR) break;; esac
    sleep 20
  done
  ```
- **Preview URLs:** the public openable ones are the **`gametime-picks-…`** aliases
  (200). The `gametimepicks-…` aliases are **Deployment-Protected → 401** (valid;
  need Vercel sign-in). **404** = a stale/truncated alias (don't trust it; use the
  PR's Vercel "Visit Preview"). See `docs/UI_STRUCTURAL_CONCEPT_PREVIEWS_*` notes.
- Branch first (never commit on `main`). End commit messages with the
  `Co-Authored-By: Claude …` line; PR bodies with the Generated-with line.

---

## 8. Key files & where things live

- **Shell/nav:** `app/src/app/layout.tsx`, `app/src/components/command-rail.tsx`
  (NEW, desktop left rail), `app/src/components/slate-status-bar.tsx` (NEW, honest
  status strip), `app/src/components/nav.tsx` (top nav, mobile),
  `app/src/components/mobile-bottom-nav.tsx`.
- **Home dashboard:** `app/src/app/page.tsx` (featured slip + builder + sidebar
  modules + guided module).
- **Guided beginner module:** `app/src/components/guided-start/guided-start.tsx`
  (NEW, additive).
- **Parlay Lab:** `app/src/components/parlay-lab-builder.tsx` (the builder — filters
  + Build My Card), `app/src/components/parlay-ticket-card.tsx`,
  `app/src/components/risk-section-spread.tsx`.
- **Lib helpers:** `parlay-suggested.ts` (`getSlipSports`,
  `getAvailableGamesFromSlips`, `getAvailableTeamsFromSlips`,
  `filterSlipsBySportTeamPlayer`, `flattenSectionSlips`, `slipMatchesSportTab`,
  `selectPlus100BuilderSlip`), `parlay-risk-sections.ts`, `data-parlays.ts`,
  `parlay-results.ts`, `public-parlay-era.ts`, `freshness.ts`.
- **Pipeline:** `pipeline/settle_results.py` (NBA settle — has the new
  `resolve_espn_event_id_for_teams` ESPN-by-date bridge),
  `pipeline/provider_circuit_breaker.py` (NEW), `pipeline/fetch_nba_data.py`
  (routes the provider chain through the breaker), `scripts/automation_settle.sh`.
- **Docs of record:** `docs/HANDOFF_2026-06-01_COMMAND_CENTER_HYBRID.md`,
  `docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md`,
  `docs/LEARNING_NOTES_2026-05-30_SETTLEMENT.md`,
  `docs/UI_STRUCTURAL_CONCEPT_PREVIEWS_2026-06-01.md` (+ this file).

---

## 9. Operational gotchas (learned the hard way)

1. **Dev server `.next` corruption:** running `npm run build` while `next dev` is
   live overwrites `.next` chunks → 500 "Cannot find module './XXXX.js'". Fix:
   stop dev, `rm -rf app/.next`, restart. Sequence builds and dev runs; never
   overlap.
2. **Two Vercel projects → 401 vs 404:** see §7. The user once got a 404 from a
   stale truncated alias; the deployments were fine (401 protected / 200 public).
3. **Racy custom-dropdown/stepper reads in `preview_eval`:** the filter dropdowns
   and the guided stepper are button-based; React re-renders between evals. Click
   in one eval, **read in the next** eval (don't expect the click + read in the
   same call). `preview_eval` does **not** await Promises.
4. **`getOptimizerGradedDates()` order:** don't assume sorted — take the **max**
   (`[...dates].sort().slice(-1)[0]`) for "latest settled".
5. **zsh glob:** quote `--include='*.tsx'` (zsh expands it otherwise).
6. **Banned-copy false positives:** "unlock", "safe-area-inset-bottom", the
   guardrail word-list in `lib/market-ticker.ts`, code comments, and negations are
   all fine — verify context before "fixing".
7. **June-1 is MLB-only** (no NBA games) — UI correctly shows only All/MLB tabs,
   no NBA/Mixed. That's honest, not a bug.

---

## 10. What recent sessions did (chronological)

**Settlement + pipeline (PRs #202–#206):**
- **PR #202 — `fix(results)`:** May-30 NBA settlement had left **all 270 NBA leans
  `stats_unavailable`** because the board keyed the game by an NBA.com 10-digit id
  and `nba_api` was unavailable on CI. Added **`resolve_espn_event_id_for_teams`**
  to `settle_results.py` — bridges NBA.com→ESPN event ids via the public ESPN
  scoreboard (date + tolerant team-abbr match, e.g. SAS↔SA). Re-ran the official
  pipeline → 270 NBA leans settled (149W/121L); public pending 9→0; optimizer
  pool 28→1 pending (the 1 = a verified DNP, left honestly pending). +7 tests.
- **PR #206 — `fix(pipeline)`:** the May-31 `morning-projections` run **timed out**
  (25-min job limit) because `nba_api` game-log fetches read-time-out at 25s from
  CI. Added **`provider_circuit_breaker.py`** (per-process breaker keyed by
  provider name; trips after consecutive slow failures or a cumulative
  failed-seconds budget; fast failures never trip it) and routed
  `fetch_nba_data.py`'s three chain-walkers through it. Bounds wasted time to
  ~125s/run regardless of roster size. 37 new tests; passed a 3-lens adversarial
  review. **May 31 was deliberately NOT backfilled** (slate over by diagnosis time).
- **PR #203 / #205:** learning notes + the projection-timeout diagnosis doc.

**June-1 readiness + between-slates UI (PRs #207, #208):**
- **PR #207 — `fix(ui)`:** projections explained its empty "today" state (instead
  of a bare `0/0`); home stopped saying "Today's" when showing a settled fallback
  slate ("The latest suggested parlays.").

**UI design exploration (PRs #209–#217):**
- First attempt #209/#210/#211 were **CSS-only theme** swaps (doc #212) — judged
  insufficient ("same layout, different color"), so they were **closed/superseded**.
- **Structural** previews shipped as draft "DO NOT MERGE" PRs: **#213 Command
  Center** (left rail + status bar + dashboard home), **#214 Social Story** (vertical
  story-feed home), **#215 Guided Flow** (3-step beginner wizard home). Comparison
  doc #216; preview-link fix #217 (the 401/404 explainer).

**Hybrid productionization (PRs #218–#221) — what's LIVE now:**
- **#218** Command Center **shell** (gold-themed left rail + honest status bar;
  mobile keeps top+bottom nav). **#219** dashboard **home** + **featured slip card**
  (`page.tsx` only). **#220** **additive guided "New here?"** module (sport→game→
  comfort→real cards, reusing the builder's own filter helpers; honest options/
  counts/empty-states; does NOT replace the builder or Build My Card). **#221**
  handoff doc. Each gate-merged on real `gametimepicks` green/CLEAN; **no
  data/pipeline changes**; brand gold kept (no experimental palettes / light flip
  / wizard-gating). Preview branches #213/#214/#215 were **re-implemented in clean
  production code, not merged**.

(Earlier sessions, for context: Parlay Lab game-coverage + Mixed-tab filter fix
PRs #199/#200/#201; Bank Builder paper ladder; Events schedule-only hub.)

---

## 11. The production UI today (Command Center)

- **Desktop:** left rail nav (grouped Overview/Tools/More, active states mirror the
  top nav) + persistent **slate status bar** (today · active slate settled/pregame
  · latest settled · $100 paper) + a dashboard grid.
- **Home dashboard:** an additive **"New here? Find a card in 3 steps"** module
  (collapsed by default) → a **Featured slip** card → the full **`ParlayLabBuilder`**
  (filters + Build My Card intact) → sidebar modules (Track Record · Bank Builder ·
  Projections · Events).
- **Mobile:** rail hidden; existing top strip + bottom nav; single-column stack.
- Honest throughout: active slate **2026-06-01 pregame**, latest settled
  **2026-05-30**; `/results` shows May 30, no May-25/26 leak; Bank Builder
  paper-only; Events schedule-only.

---

## 12. Known limitations & recommended next work

1. **June-1 settlement:** the next `nightly-settle` (3am ET June 2) settles June-1.
   Verify it lands (and that the **circuit breaker** kept `morning-projections`
   healthy). If `morning-projections` ever times out again, the documented levers
   are in `docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md` (the breaker is
   already in; next is wiring the provenance-stamped recent10 cache into the model
   fetch — **needs operator sign-off**).
2. **Top-chrome density** (disclaimer + status bar + ticker) — could merge the
   ticker's record into the status bar.
3. **Mobile nav** is the top strip + bottom bar (rail is desktop-only) — a mobile
   rail drawer is a possible parity follow-up.
4. **Deeper pages** (Projections/Parlay Lab/Results/Bank Builder) inherit the shell
   but keep their internals — module-izing them is optional.
5. **Guided module cards** are display+CTA (no direct write into Build My Card, by
   design) — a real hand-off into the tray is a possible enhancement.
6. **Risk-section calibration:** over May 28–30, Low (27%) leads, Longshot (0%) is
   the floor, but Medium≈High (6%≈6%) — a *watch* item, not an action (thin
   sample). The audit `policy.json` has a confirmed `batter_total_bases` demotion
   that is **tracked, not consumed** — do not wire it without operator approval.
7. **Stale operator PRs #1/#2/#4/#5** are obsolete (fixes already on main) — safe
   to close.
8. **Concept previews #213/#214/#215** stay open as design references — do not
   merge.

---

## 13. Quick reference

- Main `6753630` · prod `gametimepicks.yashwantbalaji.com` · public era `2026-05-27`.
- Active slate `2026-06-01` (MLB-only, pregame) · latest settled `2026-05-30`.
- Frontend tests: `cd app && npx tsx --test src/lib/*.test.mjs` (**562**) · `npx tsc
  --noEmit` · `npm run build`.
- Pipeline: `pipeline/.venv/bin/python -m pipeline.settle_test` · re-settle a date
  `SETTLE_DATE=<d> bash scripts/automation_settle.sh`.
- Merge only on real `Vercel – gametimepicks` SUCCESS + `mergeStateStatus` CLEAN.
- **Never:** fabricate data, backfill May 31, merge #213/#214/#215, change generated
  data for UI work, use banned copy, break Bank-Builder-paper-only /
  Events-schedule-only / Results honesty.
