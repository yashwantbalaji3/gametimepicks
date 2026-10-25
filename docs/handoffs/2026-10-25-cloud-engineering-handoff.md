# Cloud engineering session: handoff to Launch Readiness (2026-10-25)

This is an independent contributor session. It **did not merge, deploy, flip a flag, change a receipt, or spend credits.** Launch Readiness remains the release owner.

## A. Starting state (verified)

| Item | Evidence |
|---|---|
| `origin/main` at start | `c38292e422` (2026-10-25 15:14:16Z, "auto: nfl settlement receipts") |
| Production SHA | **`c38292e4`**, read from `/data/build-info.json` (builtAt 2026-10-25T15:17:57Z), so Production equals main at start |
| Release I at `99c691f08d` | not re-verified. Production has since moved on through many bot builds |

**Relevant open PRs:**
- #1244: mixed-sport cards, draft, switch OFF.
- #1242: the mixed-sport design doc.
- #1245 and #1246: fixes for main-red tests.
- #1238 and #1237: `/results/nba` page weight.
- #1174: prepared NBA Theater rollback.

The unit suite is red on `main` itself, so #1244, #1245 and #1246 all show a red `quality-gate`.

**Workflows with problems:**
- `nfl-event-window`: **68 of the last 100 runs failed**, all on the paid-odds step (see B1).
- `nba-finals-waiter`: built, but every run is skipped because the repository variable `NBA_FINALS_WAITER_ENABLED` is not set to `true`.
- `nightly-settle`: its scheduled slots start **4.5–5.3 h late** (on 10-25, the 05:17/06:43/08:11/09:37 slots ran at 09:47/12:01/13:09/13:53). The grading that counts comes from the Vercel-cron dispatch at about 09:20 UTC.

## B. Engineering completed

### B1. NFL odds: a spent allowance no longer fails the event window. PR #1247, branch `claude/adoring-bohr-e6yo42`

**Problem.** The NFL receipt's 1,160-credit ceiling was reached on 2026-10-11 (ledger: 1160 of 1160). Since then, every window with games in it:
1. runs every free step;
2. refuses the paid bulk call (exit 5);
3. turns red and fires the ops webhook.

**Root cause.** The receipt itself says this refusal "is a DECISION OWED to the founder, not a broken job". The capture script honored that for an *expired* allowance but not for a *spent* one.

**Fix.**
- New pure function `ceilingExhausted()`.
- The capture now exits 0 with `BUDGET_EXHAUSTED`, a `::warning::` and a step-summary line. It does this before the key check and before any network call, and writes nothing.
- The per-call spend gate is unchanged.

**Tests.**
- New `ceiling-exhausted.test.mjs` (4 tests).
- 83 tests pass across the 9 files that read the script.
- `eslint-scripts` is clean.
- A real run on the committed state (no key) prints `BUDGET_EXHAUSTED` and exits 0, with a clean `git status`.
- With a raised ceiling (scratch copy of the receipt), the run still reaches the paid path.

**Release dependency.** One Production build (`app/` changed). Ride it with the next release.

### B2. Review and tested patch for #1244 (mixed-sport). Not pushed to its branch

- **Review:** https://github.com/yashwantbalaji3/gametimepicks/pull/1244#issuecomment-6399735724
- **Full patch, tests included:** `docs/handoffs/2026-10-25-cloud-pr1244-mixed-fallback.patch`. It applies cleanly to `8b9cd9f819`, and all 71 Level A tests pass with it.

| # | Defect (appears only when mixed is ON) | Evidence | Fix in the patch |
|---|---|---|---|
| 1 | ON empties every slot when fewer than two sports have a published probability. It replaces the cross-sport cards that OFF shows. | 10-25: Ligue 1 cards were recorded at 04:42Z but the NBA lane published at 14:33Z, so ON would have shown no cards all morning. | `mixedSlots`: an empty mixed slot keeps the OFF card. |
| 2 | The Moonshot heading says "3 legs, High or Longshot", but the mixed Moonshot is a Longshot of up to 5 legs. | Real slate 10-25T14:00Z: a 5-leg card (14.25%) | The heading follows the card's policy. |
| 3 | Copy: "today only no sport has a leg" | none | "today no sport has a leg" |

Both new tests fail without the fix and pass with it (mutation-checked).

### B3. Grading audit, 10-24 Level A (read-only, nothing changed)

- **Counts:** 29 records on 10-24, all 29 graded. The 17 that include NBA legs are:
  - 9 NBA tier placements, which went **5 win / 4 loss**;
  - 8 single-game picks, which went 6 win / 2 loss.
- **Placements vs combinations:** the 9 placements are 6 unique leg combinations (Bank Builder and Moonshot reuse Parlay Center combinations). They include 2 revisions: a High card at 22:41Z and a Low card at 00:18Z (the Low card placed twice).
- **Independent check:** every leg was re-graded against `finals-2026-27.json`. **0 mismatches.** Every entry was recorded before its first tip-off.
- **Timing:** grades were written at 09:26Z (10-24 slate) and 09:25Z (10-23 slate), by the 09:20Z morning-trigger dispatch. The last NBA final landed at about 04:35Z.

## C. Product readiness (checked in Production at `c38292e4` on 10-25, about 15:30–16:00Z)

| System | Status |
|---|---|
| NBA hub and Game Simulation | **Live and verified.** 7 games, 7 `/nba/simulation/<id>` links, sampled page returns 200. |
| NFL Sunday simulations | **Live and verified.** 13 of 13 game pages link to a simulation page that returns 200. |
| NFL market prices | **Blocked by a founder decision.** The allowance has been spent since 10-11, so prices sit on the last committed capture. |
| Parlay Center, NBA Level A | **Live and verified.** `/build/` shows Low 61.1%, Medium 49.1%, High 24.8%, Longshot 14.26%, matching the 10-25 records exactly. |
| Bank Builder and Moonshot, NBA Level A | **Live and verified.** One NBA card on each page. |
| Mixed-sport Level A | **Implemented, awaiting release.** #1244 is OFF; my patch is recommended before any flip. |
| Level A grading | **Live and verified** (10-24 complete and correct). It runs about 5 h after the last final (see E3). |
| Results (`/results/nba`) | Live. The page is about 1.04 MB served; #1237 and #1238 address its weight. |

## D. Recommended release order (Launch Readiness owns every step)

1. **#1245 and #1246** (main-red test fixes). They unblock green CI for every other PR.
2. **#1247.** It is independent, ride it on the next release build.
3. **#1244 with the B2 patch.** Only after its section-7 evidence package on a real slate, then flip `LEVEL_A_MIXED_PUBLIC`.

## E. Next three priorities

1. **NFL odds allowance.** Owner: **the founder (decision).** Renew or raise `docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`, or confirm that NFL stays on the 10-11 capture. Done when the receipt is changed, or the decision to stay is recorded.
2. **Mixed-sport release.** Owner: the #1244 session, then Launch Readiness. Done when:
   - the patch is applied;
   - the §7 package covers one real slate: per-leg equality, cards per page and tier, band sweep, switch-OFF identity;
   - with the switch ON, no slot that OFF fills is ever empty.
3. **Level A grading when finals land (autonomous engineering).** Run the existing idempotent grader for **all-NBA entries only**, inside the `nba-results-refresh` commit that adds the finals. This adds no build of its own (that commit already builds).

   **Prerequisite race fix.** `nightly-settle` pushes with `git pull --rebase … || exit 1`, so a concurrent append to `graded.jsonl` would lose the whole settlement commit. Make that loop regenerate on conflict instead: take upstream `graded.jsonl`, re-run the grader (it is idempotent), then continue.

   **Done when:**
   - 10-25 NBA cards are graded within about 15 minutes of the last final;
   - a test reproduces two writers racing and shows no lost or duplicated rows;
   - the "graded twice" guard is unchanged.

   **Optional, for Launch Readiness:** turning on `NBA_FINALS_WAITER_ENABLED` is a separate repository-variable decision.
