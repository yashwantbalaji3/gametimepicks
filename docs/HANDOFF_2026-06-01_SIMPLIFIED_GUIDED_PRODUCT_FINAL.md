# HANDOFF — Simplified / Guided Product, FINAL (2026-06-01)

> Final handoff for the "simplified guided product" arc. The work
> organised the live production app around **five clear user paths** —
> Straight Bets · Suggested Parlays · Build Your Own · Bank Builder ·
> Results — while keeping the gold/vault brand, the Command Center shell,
> and every honesty/safety rule. Four PRs (#223, #224, #225, plus this
> docs PR) shipped and merged. **No data / pipeline / optimizer /
> settlement / generated-file changes** were made in any of them.
>
> **Repo path (use this exact path):**
> ```bash
> cd /Users/yashwantbalaji/Downloads/gametimepicks
> ```

---

## 1. Current repo state

- **main SHA (before this docs PR):** `d6ea15e6e34437f5d9773d92a630d8806d0512bc`
  (PR #225 merge). This docs PR adds one file under `docs/` and advances
  main by one commit; the post-merge SHA is recorded in the session's
  final report.
- **Branch:** `main` · in sync with `origin/main` · working tree clean
  (only the usual untracked scratch notes remain — never committed).
- **Production URL:** https://gametimepicks.yashwantbalaji.com
  (Vercel project **`gametimepicks`**).
- **Active slate:** **`2026-06-01`** — pregame, **MLB-only** (no NBA games
  that day; NBA board empty = honest, not a bug). 9 MLB games · 18 snapshot
  slips · optimizer pool `totalSlips = 64`.
- **Latest settled slate:** **`2026-05-30`** (`optimizer-graded/2026-05-30.json`).
- **Public track-record era start:** `2026-05-27`
  (`PUBLIC_PARLAY_RESULTS_START_DATE`). May-25 / May-26 stay filtered out
  at read time (never leaked).
- **Preview branches #213 / #214 / #215:** still **OPEN, DRAFT, unmerged**
  — never touched. (Design-only "DO NOT MERGE" structural concepts.)

---

## 2. PRs shipped in this arc

| PR | Title | Merge SHA | Files changed |
|----|-------|-----------|---------------|
| **#223** | feat(ui): Parlay Lab deep-linking + label clarity | `7dc686d` | `parlay-lab-builder.tsx`, `parlay-lab-mode-tabs.tsx` |
| **#224** | feat(ui): rail relabel + Home "Where do you want to start?" path cards | `f42f318` | `app/page.tsx`, `command-rail.tsx`, `home-path-cards.tsx` (new) |
| **#225** | feat(ui): de-duplicate Home vs Parlay Lab + framing intros | `d6ea15e` | `app/page.tsx`, `projections/page.tsx`, `results-hero.tsx` |
| **PR 4** | docs: simplified-guided-product final handoff | _(this PR)_ | `docs/HANDOFF_2026-06-01_SIMPLIFIED_GUIDED_PRODUCT_FINAL.md` (new) |

All paths are under `app/src/...` unless noted. Every feature PR changed
**only UI/component/page files** — confirmed via `gh pr view <n> --json files`.

### PR #223 — Parlay Lab deep-linking + label clarity
- Hash deep-links on the standalone `/parlay-lab` route:
  `#suggested` · `#build` · `#bankroll`. Read on mount **and** on
  `hashchange`, so direct links **and** browser back/forward drive the
  active mode. Tab clicks reflect the mode back to the hash (one history
  entry per change; same-value set is a no-op).
- Missing hash → default (`suggested`). Invalid hash → safe fallback to
  `suggested` (no crash, no blank section).
- Scoped to the standalone route only: the Home embed (`embedded`) never
  reads/writes the page hash.
- Relabelled "Suggested" → **"Suggested Parlays"** + a one-line modes
  intro. Mode keys are the single source of truth via a new
  `parseParlayLabModeHash()` helper.
- Kept keyboard a11y (Arrow cycling + focus), filters, and Build My Card.

### PR #224 — Rail relabel + Home path cards
- **Command Center rail:** plain-language labels grouped Overview /
  Today's picks / Track record / More. Split the single "Parlay Lab"
  entry into **Suggested Parlays** (`/parlay-lab/#suggested`) and
  **Build a Parlay** (`/parlay-lab/#build`); "Projections" reads
  **Straight Bets**. Hash-aware active highlighting (`useCurrentHash()`)
  + bidirectional sync with the on-page mode tabs.
- **Bug fixed:** a Next.js `<Link>` hash nav uses the history API, which
  does NOT fire `hashchange`, so switching parlay modes from the rail
  while already on Parlay Lab left the mode + highlight stale. When
  already on Parlay Lab, the click now sets `location.hash` directly
  (fires `hashchange`, which both the rail and the page builder listen
  for); cross-route clicks keep SPA nav and read the hash on mount.
- **Home:** added the full-width **"Where do you want to start?"**
  5-card launcher (Straight Bets · Suggested Parlays · Build Your Own ·
  Bank Builder · Results) with honest server-computed statuses (real
  optimizer slip count, `$100 paper` base, latest settled date).

### PR #225 — De-duplicate Home vs Parlay Lab + framing intros
- **Home:** replaced the full embedded `ParlayLabBuilder` ("Suggested
  slips") with a **compact Suggested-parlays preview** — up to 3 real
  top-ranked slips (excluding the Featured slip) + two CTAs into
  `/parlay-lab/#suggested` and `/parlay-lab/#build`. Build My Card no
  longer renders on Home; the full workspace lives on `/parlay-lab`.
- **Projections:** added a one-line **"Straight bet recommendations"**
  framing intro (single player-prop projections, not parlays; pick a game
  to review the projected line + edge; the parlays are built from these
  same projections). Eyebrow reads "Straight bets · projections".
- **Results:** refined the framing line — "Slips are saved before games
  and graded after — hit rate counts only finished slips; pending and
  pushes are shown separately."
- **Bank Builder:** left unchanged — already carries strong framing
  (paper-only disclaimers top + bottom, `$100 → $3,000` educational
  ladder copy, honest pending/empty Builder-Slip states).

---

## 3. What is now live (per surface)

- **Brand / shell:** dark gold/vault theme; desktop Command Center left
  rail (`command-rail.tsx`); mobile keeps the top `Nav` strip +
  `MobileBottomNav` (the rail is desktop-only; the Home path cards carry
  the plain-language navigation on mobile). Persistent slate status bar
  (`slate-status-bar.tsx`) — honest today / active-slate / latest-settled
  / `$100 paper`.
- **Home (`/`):** "Where do you want to start?" path cards →
  Guided "New here?" module → Featured slip → **compact Suggested-parlays
  preview (3 cards + CTAs)** in the main column; Track record / Bank
  Builder / Projections / Events modules in the sidebar. A dashboard, not
  a duplicate of Parlay Lab.
- **Projections (`/projections`):** "Straight bets · projections" — the
  straight-bet recommendation surface; per-game, per-player prop
  projections + edges. Honest today vs latest-available state. June-1 is
  MLB-only (9 games), NBA empty.
- **Parlay Lab (`/parlay-lab`):** the full workspace — 3-mode switcher
  (Suggested Parlays / Build Your Own / Bankroll Plan) with hash
  deep-links, filters, risk-section spreads, and Build My Card. Modes
  intro names all three.
- **Bank Builder (`/bank-builder`):** `$100 → $3,000` **paper-only /
  educational** ladder. Daily Builder Slip when one is pending + fully
  unsettled; honest empty state otherwise. No real money, ever.
- **Results (`/results`):** latest settled slate (`2026-05-30`),
  save-before / grade-after contract stated, public-era record, pending /
  no-action handled honestly. No pre-era (May-25/26) leak.
- **Events (`/events`):** WNBA · UFC · FIFA — **schedule-only**, no odds /
  projections / parlays.

---

## 4. Verification summary

Every feature PR passed the same gate before merge:

- `cd app && npx tsx --test src/lib/*.test.mjs` → **562 pass / 0 fail**
- `npx tsc --noEmit` → **clean**
- `npm run build` → **green**, 139/139 static pages exported to `out/`
- Browser-verified at **desktop 1280 + mobile 375**:
  - Routes: `/ · /projections · /parlay-lab · /parlay-lab#suggested ·
    #build · #bankroll · /bank-builder · /results · /events · /about`.
  - **No horizontal overflow** on any route.
  - **No console errors** on any route.
  - **No banned betting copy** on any route (incl. word-boundary `lock`
    and user-facing `safe/safety`).
  - Hash deep-links land on the correct mode; back/forward + keyboard nav
    sync; invalid hash falls back to Suggested; Home embed not hijacked.
  - Rail links + path cards navigate to the correct mode; rail active
    state is hash-aware and bidirectionally synced with the on-page tabs.
  - Build My Card works on Parlay Lab; status bar honest; Bank Builder
    paper-only; Events schedule-only; Results latest settled `2026-05-30`
    (no May-25/26 leak, **no June-1 settled leak**).
- **Merge gate:** each PR merged only when the real
  `Vercel – gametimepicks` check was **SUCCESS** and `mergeStateStatus`
  was **CLEAN**; main synced after each merge.

PR 4 (this doc) is **docs-only** — a final sitewide polish sweep at 1280 +
375 found **no code polish issues** (no overflow, console errors, banned
copy, or honesty regressions), so no code changes were warranted.

---

## 5. Hard rules honored (all PRs)

- No **data / pipeline / optimizer / settlement** code changes.
- No **generated data** changes (nothing under `app/public/data/`).
- No **fabricated** projections / parlays / results / odds / recent10 /
  schedules. Every slip rendered comes from a real snapshot/graded file.
- No **May-31 backfill** (that slate's `morning-projections` run timed
  out; leaving it empty is correct).
- No **June-1 settlement** (active slate is pregame; never settled).
- No **same-slate results** used to alter that slate's pregame suggestions.
- **Events** stay schedule-only (no WNBA/UFC/FIFA odds/projections/parlays).
- **Bank Builder** stays paper-only / educational.
- No **banned betting copy** (`lock`, `guaranteed`, `free money`,
  `risk-free`, `can't miss`, `easy win/money`, `no-brainer`, `sure thing`,
  `sharp money`); no user-facing `safe/safety`.
- **Preview branches #213 / #214 / #215** were **NOT merged or edited** —
  they remain open, draft, "DO NOT MERGE".

---

## 6. Known limitations / honest gaps

- **June-1 is MLB-only.** The UI correctly shows only All/MLB (no
  NBA/Mixed) for this slate; NBA board is empty because no NBA games are
  scheduled. Honest, not a bug.
- **Mobile nav labels** still read "Projections" / "Parlay Lab" (the
  space-constrained top + bottom mobile nav were intentionally left
  unchanged). The new plain-language paths surface on mobile through the
  Home path cards. A future PR could reconcile mobile-nav labels if
  desired.
- **Home Suggested-parlays preview** shows the top 3 slips by the model's
  existing ordering (currently all Low-Risk on the June-1 slate). It is a
  preview, not the full risk-lane spread — the full set lives on
  `/parlay-lab`. A future tweak could diversify the preview across risk
  levels.
- **No durable Bank Builder ladder history** yet (deferred by design); the
  ladder starts honestly at the `$100` base and shows an honest
  no-history state.
- The board is **auto-refreshed** by the live pipeline (props-only /
  morning runs); on-screen counts reflect whatever real payload is on
  disk at render time and stay internally consistent (header count ==
  grid count).

---

## 7. Recommended next work

- **Reconcile mobile nav labels** with the five plain-language paths (or
  add a compact mobile "paths" entry) so the naming is consistent across
  desktop and mobile.
- **Diversify the Home Suggested-parlays preview** to show one card per
  risk level (Low / Medium / High) instead of the top-3-by-rank, for a
  more representative glance.
- **A/B or analytics** on the path cards + rail to see which of the five
  paths users actually take, then tune ordering/copy.
- Optional: a short **"How it works"** explainer (or expand About) tying
  the five paths together for first-time visitors.
- Keep honoring the settlement cadence: settle June-1 only once **every**
  game is final **and** the official path supports it
  (`SETTLE_DATE=2026-06-01 bash scripts/automation_settle.sh`).

---

## 8. Explicit confirmations

- **Preview branches #213 / #214 / #215 were NOT merged and NOT edited.**
  They remain open, draft, and unmerged.
- **No data / pipeline / optimizer / settlement / generated files** were
  changed by any PR in this arc (#223, #224, #225, this docs PR).
- **No fabricated data** of any kind was introduced.
- **No June-1 settlement** and **no May-31 backfill** were performed.

---

*End of final handoff. main before this docs PR: `d6ea15e`. Active slate
`2026-06-01` (pregame, MLB-only, 18 snapshot slips / 64 optimizer slips /
9 MLB games). Latest settled `2026-05-30`. Five clear paths are live.*
