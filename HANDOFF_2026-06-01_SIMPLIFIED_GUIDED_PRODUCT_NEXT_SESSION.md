# HANDOFF — Simplified / Guided Product, Next Session (2026-06-01)

> **You are a fresh Claude Code session.** Read this whole file before doing
> anything. It is self-contained: it has the repo state, what's live, the next
> work (with the exact PR to start), the hard rules, and a copy-paste kickoff
> prompt at the very end (§12). Do **not** rely on any prior chat.
>
> **Repo path — use this EXACT path in every command. Do not clone, do not use
> an empty workspace, do not use any other path or lowercase variant:**
> ```bash
> cd /Users/yashwantbalaji/Downloads/gametimepicks
> ```

---

## 1. Current repo state

- **Local SHA:** `4bfaa675da7553edb6142e937e986fa3d897be03`
- **origin/main SHA:** `4bfaa675da7553edb6142e937e986fa3d897be03`
- **Ahead / behind:** `0 / 0` — fully in sync with origin/main
- **Current branch:** `main`
- **Working tree:** clean — **no tracked source changes**
- **Untracked scratch notes:** **52** untracked files (root `SESSION_*`, `HANDOFF_*`,
  `POSTMORTEM_*`, `SESSION_PLAN_*`, `SESSION_PROGRESS_*`, `.claude/`, `app/.claude/`,
  `gametime-picks-logo.png`, `docs/PARLAY_LAB_DESIGN_OPTIONS_2026-05-28.md`).
  **Leave them untracked** — they are working scratch, never commit them. (This
  handoff file will add one more untracked file; do not commit it unless asked.)
- **Production URL:** https://gametimepicks.yashwantbalaji.com (Vercel project **`gametimepicks`**)
- **Active slate (forward-looking):** **`2026-06-01`** — pregame, **MLB-only** (no NBA
  games that day). Snapshot has **18 slips**; optimizer pool present.
- **Latest settled slate:** **`2026-05-30`** (both `optimizer-graded/2026-05-30.json`
  and `graded/2026-05-30.json` present).
- **June-1 projection / parlay status:** the June-1 `morning-projections` run
  **succeeded** — there is a real June-1 pregame MLB-only slate (18 snapshot slips).
  NBA board for June-1 is empty/ScheduleUnavailable (no NBA games — honest, not a bug).
- **Results latest-settled status:** `/results` shows **2026-05-30** settled. Public
  track-record era starts **`2026-05-27`** (`PUBLIC_PARLAY_RESULTS_START_DATE`);
  `optimizer-summary.byDate` holds `2026-05-25 … 2026-05-30` but **05-25 / 05-26 are
  filtered out at read time** (do not leak them).
- **Bank Builder status:** live, **paper-trading / educational only** ($100 → $3,000
  paper ladder, resets to base on a loss). No real money, ever.

---

## 2. PR timeline and current product state

All of the following are **MERGED** to main unless marked otherwise.

| PR | What it did |
|----|-------------|
| **#202** | `fix(results)` — **NBA settlement ESPN bridge.** May-30 had left **all 270 NBA leans `stats_unavailable`** (board keyed games by NBA.com 10-digit ids; `nba_api` blocked on CI; ESPN fallback only accepted 9-digit ESPN ids). Added `resolve_espn_event_id_for_teams()` + tolerant `_nba_abbr_match()` to `pipeline/settle_results.py`, bridging NBA.com→ESPN via the public ESPN scoreboard (date + team abbr). Re-ran the official pipeline → **270 NBA leans settled (149W/121L)**; public pending 9→0; optimizer pool 28→1 (the 1 = a verified DNP, left honestly pending). +7 tests. |
| **#203** | `docs` — learning notes for the May-30 settlement gap (`docs/LEARNING_NOTES_2026-05-30_SETTLEMENT.md`). |
| **#204** | `docs` — results/projections/learning handoff (`HANDOFF_2026-05-31_RESULTS_PROJECTIONS_LEARNING.md`). |
| **#205** | `docs` — **projection-pipeline timeout diagnosis** (`docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md`). May-31 `morning-projections` hit the 25-min job limit because each NBA player's `nba_api` game-log fetch read-times-out at 25s from CI; no commit → **no May-31 slate** (correctly NOT backfilled). |
| **#206** | `fix(pipeline)` — **NBA provider circuit breaker.** New `pipeline/provider_circuit_breaker.py` (per-process, keyed by provider; trips on consecutive slow failures or a cumulative failed-seconds budget; fast failures never trip). Routed `pipeline/fetch_nba_data.py`'s three chain-walkers through it (catches `ProviderError` **and** unexpected exceptions — broadened after an adversarial review). Bounds wasted time per run. +37 tests. June-1 `morning-projections` then **succeeded**. |
| **#207** | `fix(ui)` — **between-slates clarity.** Projections explains its empty "today" state instead of a bare `0/0`; home stops saying "Today's" when showing a settled fallback ("The latest suggested parlays."). |
| **#208** | `docs` — June-1 readiness + site-revamp handoff (`HANDOFF_2026-06-01_SITE_REVAMP_PROJECTION_READINESS.md`). |
| **#212** | `docs` — 4-version CSS-only UI concept comparison (the CSS-only concepts were judged "same layout, different color" and superseded). |
| **#213 / #214 / #215** | `preview(ui)` — **STRUCTURAL preview concepts**, branches `preview/structural-concept-a-command-center` / `-b-social-story` / `-c-guided-flow`. **OPEN, DRAFT, "DO NOT MERGE."** Design references only. **#215 (Concept C — Guided Beginner Flow)** is the inspiration for the current simplification work. |
| **#216** | `docs` — A/B/C structural concept comparison. |
| **#217** | `docs(ui)` — fixed structural preview links (401 = deployment-protected `gametimepicks` previews are valid; 200 = public `gametime-picks` duplicate previews; 404 = stale/bad alias). |
| **#218** | `feat(ui)` — **Command Center shell** (PR 1/4): desktop **left rail** (`command-rail.tsx`) + persistent **slate status bar** (`slate-status-bar.tsx`); production top `Nav` kept for **mobile only**; mobile bottom nav unchanged. Squash `2cd2fcc`. |
| **#219** | `feat(ui)` — **dashboard home + featured slip** (PR 2/4): `page.tsx` becomes a modular grid (featured slip → full builder → sidebar modules). Squash `58e0d69`. |
| **#220** | `feat(ui)` — **additive guided "New here?" module** (PR 3/4): `guided-start/guided-start.tsx`, sport→game→comfort→cards; reuses the builder's own filter helpers; honest counts/empty-states; does **not** replace the builder. Squash `f1367a6`. |
| **#221** | `docs` — Command Center hybrid handoff (`docs/HANDOFF_2026-06-01_COMMAND_CENTER_HYBRID.md`). **MERGED** (squash `6753630`). |
| **#222** | `docs` — **master project + session handoff** (`docs/MASTER_HANDOFF_2026-06-01.md`). **MERGED** (squash `4bfaa67`, current main). |

**No later PRs exist.** No feature PR is currently in progress (the next-work plan in
§5/§6 has **not** been started — no code written yet).

---

## 3. Current production UI (what is LIVE on main `4bfaa67`)

- **Brand:** dark **gold/vault** theme (369 CSS variables `--vault-*` / `--gtp-*` in
  `app/src/app/globals.css`; Geist + JetBrains Mono). Token-driven.
- **Desktop Command Center left rail** (`app/src/components/command-rail.tsx`,
  `hidden lg:flex fixed inset-y-0 left-0`, width 232px): brand mark + grouped nav
  (Overview / Tools / More) → Home, Projections, Parlay Lab, Bank Builder, Results,
  Events, About. `useIsActive()` mirrors `nav.tsx` active-route logic.
- **Mobile** keeps the existing **top `Nav` strip** + **`MobileBottomNav`** (rail is
  desktop-only).
- **Persistent slate / status bar** (`app/src/components/slate-status-bar.tsx`, server
  component): today · active slate (settled/pregame) · latest settled · $100 paper.
  Reads real loaders — honest, never fabricated.
- **Dashboard home** (`app/src/app/page.tsx`): grid (`xl:grid-cols-12`) — main col
  (`xl:col-span-8`) = guided module → **Featured slip** card → "Suggested slips"
  module embedding the **full `ParlayLabBuilder`**; sidebar (`xl:col-span-4`) = Track
  record · Bank Builder · Projections · Events modules; plus `MarketTicker` +
  `NewsletterSignup`.
- **Featured slip**: `selectPlus100BuilderSlip(...) ?? suggested?.slips?.[0]`, rendered
  via `ParlayTicketCard emphasis="featured"`; shows its own honest settled/pending state.
- **Full ParlayLabBuilder** (`app/src/components/parlay-lab-builder.tsx`): sport pills
  (All/NBA/MLB/Mixed) → team/player filters → risk-section spreads. **Already has a
  3-way mode switcher** (`parlay-lab-mode-tabs.tsx`): **Suggested** (model-ranked
  slips), **Build Your Own** (custom slips, "not officially tracked"), **Bankroll
  Plan** (educational planner). This is key for the next work (§4–6).
- **Build My Card**: the selectable-slips tray (`SelectedSlipsTray` /
  `BuildMyCardProvider`) — works; shows stake + projected payout.
- **Guided "New here?" module** (`app/src/components/guided-start/guided-start.tsx`):
  collapsible 3-step finder (sport → game → comfort → ≤4 cards + CTAs), honest empty
  states.
- **Bank Builder** (`/bank-builder`): $100→$3,000 **paper-only** ladder.
- **Results** (`/results`): latest settled **2026-05-30**; no May-25/26 leak.
- **Events** (`/events`): **schedule-only** (WNBA · UFC · FIFA; "no odds, no
  projections").

---

## 4. Current requested next work (the goal)

Continue **simplifying the live production product**, inspired by **Concept C
(#215, guided/beginner simplicity)**, while **keeping the current Command Center
shell and the gold/vault brand**.

**Goal — make the app easier to understand by organizing it around these 5 clear
paths:**

1. **Straight Bet Recommendations / Projections** → `/projections`
2. **Suggested Parlays of the Day** → `/parlay-lab` (Suggested mode)
3. **Build Your Own Parlay** → `/parlay-lab` (Build Your Own mode)
4. **Bank Builder** → `/bank-builder`
5. **Results** → `/results`

**Crucial discovery (already verified in code):** Parlay Lab **already has** the
3-mode structure (`Suggested` / `Build Your Own` / `Bankroll Plan` via
`parlay-lab-mode-tabs.tsx`, `ParlayLabMode = "suggested" | "build" | "bankroll"`,
default `"suggested"`, set with `useState`). So paths #2 and #3 **already exist as
code** — they are just **buried** behind a jargon route name and mid-page tabs, with
**no deep-linking**. The next work is about **discoverability + naming + entry
points**, NOT building new structure. This makes it low-risk.

**Keep (do not remove):** gold/vault brand · Command Center shell + status bar ·
dashboard home · Build My Card · Bank Builder paper-only · Events schedule-only ·
Results honesty · real data only.

---

## 5. Completed planning for the next work (agreed plan)

- **PR 1 — Parlay Lab deep-linking + label clarity** (foundational; isolated to
  `parlay-lab/page.tsx`, `parlay-lab-builder.tsx`, `parlay-lab-mode-tabs.tsx`):
  - Add hash deep-linking: `/parlay-lab#suggested`, `/parlay-lab#build`,
    `/parlay-lab#bankroll`.
  - Relabel the "Suggested" tab → **"Suggested Parlays"** if appropriate.
  - Add a short plain-English intro explaining the three modes.
  - **Keep `ParlayLabBuilder` logic intact** (filters, Build My Card, keyboard nav).
- **PR 2 — Rail relabel + Home "Where do you want to start?" path cards.** Regroup
  the rail to the 5 plain-language paths; add a compact 5-card "Where do you want to
  start?" panel near the top of Home (one-liner + CTA each, honest live counts where
  cheap). Depends on PR1 deep-links.
- **PR 3 — De-duplicate Home vs Parlay Lab + framing intros.** Home currently embeds
  the *full* builder (all 3 modes) under "Suggested slips" → it duplicates Parlay
  Lab. Slim Home's embed to a **suggested-parlays preview** (top few
  `ParlayTicketCard`s) + "Open Parlay Lab →" CTA (Home = dashboard, Parlay Lab =
  workspace). Add short consistent "what is this" framing intros to
  **Projections / Bank Builder / Results**.
- **PR 4 — Polish + handoff doc.**

Each PR: small, gold/vault brand, additive where possible, no data/pipeline changes,
gate-merged (see §9), pause + report after each.

---

## 6. EXACT next recommended PR to start

### → **PR 1 — Parlay Lab deep-linking + label clarity**

**Scope:**
- Add **hash deep-linking** so the initial Parlay Lab mode is driven by the URL hash:
  - `/parlay-lab#suggested` → Suggested mode
  - `/parlay-lab#build` → Build Your Own mode
  - `/parlay-lab#bankroll` → Bankroll Plan mode
- **If the hash is missing:** preserve existing/default behavior (default = `suggested`).
- **If the hash is invalid** (anything not in the 3 known modes): fall back safely to
  the default (`suggested`) — do not crash, do not show a blank section.
- **Browser back/forward** should not break mode state if it's simple to support
  (e.g. listen for `hashchange` and sync the mode; update the hash on tab change
  without full navigation). Keep it simple — don't over-engineer.
- **Keep keyboard accessibility** (the existing ArrowLeft/ArrowRight tab cycling in
  `parlay-lab-mode-tabs.tsx` must still work).
- **Keep Build My Card intact** (the `SelectedSlipsTray` only renders in `suggested`
  mode today — preserve that behavior).
- **Keep filters intact** (sport/team/player filters and risk-section spreads).
- Optional within this PR: relabel "Suggested" → "Suggested Parlays" + a one-line
  intro naming the modes (low-risk copy; verify no banned words).
- **No data / pipeline / optimizer / settlement / generated-file changes.**

**Implementation notes (grounded in the code):**
- `app/src/components/parlay-lab-builder.tsx` line ~394 holds
  `const [mode, setMode] = useState<ParlayLabMode>("suggested")`. The deep-link
  should initialize this from `window.location.hash` (in a `useEffect`, since this is
  a static export / client component and `window` isn't available during SSR) and
  add a `hashchange` listener. When the user changes tabs, optionally reflect it back
  to the hash (`history.replaceState` to avoid spamming history, or `pushState` if
  back/forward navigation is desired).
- `app/src/components/parlay-lab-mode-tabs.tsx` exports
  `ParlayLabMode = "suggested" | "build" | "bankroll"` and `PARLAY_LAB_MODES`.
  Reuse those keys for hash parsing — do not hardcode strings separately.
- `embedded` mode (Home's embed) passes the same builder; make sure hash-reading does
  not hijack the Home page (e.g. only react to the hash when not `embedded`, or scope
  it so the embedded instance keeps its default). **Verify Home still works.**

**Verification:** run the §8 commands; browser-verify all §8 routes including the
three hash URLs land on the correct mode; back/forward sane; no console errors; no
overflow at 1280 + 375; Build My Card still works; filters still work.

---

## 7. HARD RULES (non-negotiable)

Do **NOT**:
- change **data / pipeline / optimizer / settlement** code unless a **real, testable
  grader gap** exists (and then only via the official pipeline path with tests).
- change any **generated data file** (anything under `app/public/data/`).
- **fabricate** projections / parlays / results / odds / hit rates / recent10 /
  recent games / schedules / learning signals. Never hand-edit outcomes.
- **backfill May 31** (it has no slate — a `morning-projections` run timed out;
  leaving it empty is correct).
- **settle June 1** unless **every** June-1 game is officially final **and** the
  official settlement path supports it (`SETTLE_DATE=2026-06-01 bash
  scripts/automation_settle.sh`). Never settle a future/in-progress slate.
- use **same-slate final results** to alter that same slate's **pregame** suggestions.
- **merge or edit** preview branches **#213 / #214 / #215** (open, draft, design-only).
- add odds/projections to **Events** — WNBA / UFC / FIFA stay **schedule-only**.
- make **Bank Builder** anything other than **paper-only / educational**.
- add **fake sportsbook links** or copy FanDuel/DraftKings branding.
- expose **secrets** (Odds API key, etc.); never scrape sportsbooks.
- claim active AI / ML unless actually implemented + evaluated ("statistical model").
- leak **May-25 / May-26** public hit rates (pre-public-era); never restore the
  May-26 "replay".
- use **banned betting copy** (user-facing): `lock`, `guaranteed`, `free money`,
  `risk-free`, `can't miss`, `cant miss`, `easy win`, `easy money`, `no-brainer`,
  `no brainer`, `sure thing`, `sharp money`.
- use user-facing **"safe" / "safety"** — **except** the CSS
  `safe-area-inset-bottom` (acceptable false positive). Negations that merely contain
  a banned word ("no card is a sure thing", "we do not take real money") are fine —
  verify context before "fixing" a match.

When blocked, **stop** and report a precise blocker + the exact next action. Only
stage the deliverable files per PR; leave the 52 untracked scratch notes alone.

---

## 8. Verification commands (exact)

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
cd app
npx tsx --test src/lib/*.test.mjs    # expect 562 pass
npx tsc --noEmit                     # expect clean
npm run build                        # expect green static export to out/
```

**Browser-verify routes** (desktop **1280** + mobile **375**; no horizontal overflow,
no console errors, no banned copy):
- `/`
- `/projections`
- `/parlay-lab`
- `/parlay-lab#suggested`
- `/parlay-lab#build`
- `/parlay-lab#bankroll`
- `/bank-builder`
- `/results`
- `/events`
- `/about`

Also confirm: **Build My Card works** (✓ tray with stake + projected payout) ·
**Bank Builder paper-only** · **Events schedule-only** · **Results latest settled =
2026-05-30, honest** (no May-25/26 leak).

> Preview harness: `.claude/launch.json` config **`gtp-dev`** (`npm run dev`, port
> 3000). Pattern: `preview_start` → navigate via `preview_eval(window.location.href=
> ...)` → read/screenshot.

---

## 9. Vercel / merge gate

- Each PR deploys to **two** Vercel projects: real **`gametimepicks`** (the
  production gate) and a duplicate **`gametime-picks`** (legacy). Checks:
  `Vercel – gametimepicks`, `Vercel – gametime-picks`, `Vercel Preview Comments`.
- **Merge only when:** real **`Vercel – gametimepicks` = SUCCESS** **AND**
  `mergeStateStatus = CLEAN`. Then **squash-merge** + **sync main**.
- `mergeStateStatus` can transiently flip to `UNKNOWN` / `UNSTABLE` — **re-poll** until
  CLEAN.
- If **only the duplicate** `gametime-picks` is red (rate-limit) but the real
  `gametimepicks` is green → merge is allowed; document the exception.
- If the **real** `gametimepicks` is **red** → **do NOT merge**; one paced retry max;
  else **stop and report**.
- **Sync main after every merge** (`git checkout main && git pull origin main`).
- Branch first (never commit on `main`). End commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; PR bodies with the
  `🤖 Generated with [Claude Code]` line.

Gate-wait loop:
```bash
for i in $(seq 1 70); do
  PROD=$(gh pr view <N> --json statusCheckRollup --jq '[.statusCheckRollup[]|select((.name//.context)=="Vercel – gametimepicks")|(.state//.status)][0]')
  MS=$(gh pr view <N> --json mergeStateStatus --jq .mergeStateStatus)
  [ "$PROD" = SUCCESS ] && [ "$MS" = CLEAN ] && break
  case "$PROD" in FAILURE|ERROR) break;; esac
  sleep 20
done
```

---

## 10. Known gotchas

1. **`.next` cache corruption:** running `npm run build` while `next dev` is live
   overwrites `.next` chunks → 500 "Cannot find module './XXXX.js'". Fix: stop dev,
   `rm -rf app/.next`, restart dev. Never overlap a build with a running dev server.
2. **`preview_eval` race / hydration:** clicking a React button and reading state in
   the **same** eval fails (no re-render yet). Click in one eval, **read in the
   next**. `preview_eval` does not await Promises. Re-read after actions.
3. **Preview URL status:** **401** = deployment protection on the real
   `gametimepicks` previews (valid; needs Vercel sign-in). **200** = the public
   `gametime-picks` duplicate (same code). **404** = a stale/truncated alias — don't
   trust it; use the PR's Vercel "Visit Preview" link.
4. **`getOptimizerGradedDates()` ordering:** don't assume sorted output — take the
   **max** for "latest settled": `[...dates].sort().slice(-1)[0]`.
5. **Banned-copy false positives:** "unlock", `safe-area-inset-bottom`, the guardrail
   word-list in `lib/market-ticker.ts`, code comments, and negations are all fine —
   check context before "fixing" a grep hit.
6. **Pipeline tests are mixed style:** Suite-style files run via
   `pipeline/.venv/bin/python -m pipeline.<name>_test` (they `sys.exit()` at import,
   so they break `pytest` collection); pytest-style files run individually with
   `pipeline/.venv/bin/python -m pytest pipeline/<file>_test.py`. **There is NO
   unified `pytest pipeline` runner** — do not run the whole dir with pytest.
7. **June-1 is MLB-only** (no NBA games) → UI correctly shows only All/MLB, no
   NBA/Mixed for that slate. Honest, not a bug.
8. **zsh globbing:** quote include globs (`--include='*.tsx'`).

---

## 11. Current open PRs (and how to treat them)

- **#215** `preview/structural-concept-c-guided-flow` — **DRAFT, DO NOT MERGE.**
  Structural preview (Concept C, guided beginner flow) — **inspiration only** for the
  current simplification work.
- **#214** `preview/structural-concept-b-social-story` — **DRAFT, DO NOT MERGE.**
- **#213** `preview/structural-concept-a-command-center` — **DRAFT, DO NOT MERGE.**
- **#5 / #4 / #2 / #1** — **stale/obsolete operator PRs** (admin-status / dry-run /
  YAML / leak fixes from May 8–12). Every fix already exists on main. Safe to close;
  do not merge as-is. Not part of the current work.
- **No active feature PR is in progress.** The next-work plan (§5/§6) has not been
  started.

---

## 12. Copy-paste kickoff prompt for the next Claude Code session

```
Read HANDOFF_2026-06-01_SIMPLIFIED_GUIDED_PRODUCT_NEXT_SESSION.md in full before doing anything.

Use this exact repo path in every command — do not clone, do not use an empty
workspace, do not use any other path:
  cd /Users/yashwantbalaji/Downloads/gametimepicks

First, confirm current state from the correct path and report:
  git rev-parse --abbrev-ref HEAD
  git rev-parse HEAD
  git ls-remote origin main | cut -f1
  git status --short
  gh pr list --state open --limit 30
Report: current branch, local SHA, origin/main SHA, ahead/behind, working-tree
status, that #213/#214/#215 are still open/draft/unmerged, active slate
(expect 2026-06-01 pregame MLB-only), and latest settled slate (expect 2026-05-30).
Proceed only if state is safe and in sync.

Then start ONE PR only:
  PR 1 — Parlay Lab deep-linking + label clarity

Scope (see §6):
  - Add hash deep-linking: /parlay-lab#suggested, /parlay-lab#build, /parlay-lab#bankroll
  - Missing hash → preserve default behavior (suggested)
  - Invalid hash → safe fallback to suggested
  - Support browser back/forward (hashchange) if simple; keep keyboard a11y
  - Keep Build My Card intact; keep filters intact
  - Optionally relabel "Suggested" -> "Suggested Parlays" + a one-line modes intro
  - NO data/pipeline/optimizer/settlement/generated changes

Follow ALL hard rules in §7. Verify with the §8 commands + browser routes (1280 +
375, no overflow, no console errors, no banned copy, Build My Card works, Bank
Builder paper-only, Events schedule-only, Results latest settled honest).

Merge ONLY when the real `Vercel – gametimepicks` check is green and
mergeStateStatus is CLEAN (see §9). Sync main after merge.

Do NOT merge or edit preview branches #213/#214/#215.

Pause and report after PR 1 merges. Do not start PR 2 until I say so.
```

---

*End of handoff. Current main: `4bfaa67`. Active slate 2026-06-01 (pregame, MLB-only).
Latest settled 2026-05-30. Next action: PR 1 — Parlay Lab deep-linking + label clarity.*
