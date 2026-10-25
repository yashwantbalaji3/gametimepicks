# Release manifest for Release Readiness (2026-10-26)

**Status:** this session merged nothing, deployed nothing, ran no paid capture and changed no Vercel setting, flag, receipt or grade. Release Readiness owns every merge and deploy below.

## 1. Exact heads and merge order

| Order | PR | Branch | Head | What it fixes |
|---|---|---|---|---|
| 1 | #1245 | `claude/nfl-matchup-vs-positive-control` | `c373e6d6ad` | main red test 1: `matchup.test.mjs` "EVERY ROW of the committed schedule capture agrees with its own label" |
| 2 | #1246 | `claude/nba-board-actuals-grader-drift` | `46b189f853` | main red test 2: `projection-board-postgame.test.mjs` "actuals on the COMMITTED record equal the shadow grader's…" |
| 3 | #1247 | `claude/adoring-bohr-e6yo42` | code head `72cfd1db28` (later commits on the branch are docs only) | main red test 3 (§2), plus B1–B10 of the [sprint handoff](2026-10-25-cloud-engineering-handoff.md) and B11 (postgame link) |
| 4 | #1244 + patch | `claude/level-a-mixed-cards` | `8b9cd9f819` + [`2026-10-25-cloud-pr1244-mixed-fallback.patch`](2026-10-25-cloud-pr1244-mixed-fallback.patch) | mixed-sport Level A, switch OFF |

- **Base checked:** main `e3e2977067` (25 Oct 18:51 ET). The 9 commits since `fa2ef148f4` are bot data only, with no change under `app/src`, `app/scripts`, `.github` or `scripts`.
- **Merge check:** merging 1 → 2 → 3 → 4 in order onto `e3e2977067` gives no conflicts (`git merge-tree`). The patch still applies cleanly to `8b9cd9f819`.
- **No shared vehicle:** #1245 and #1246 stay separate. Each fixes one test, and neither touches #1247's files.
- **Why #1245 and #1246 merge first:** CI on #1247 stays red until they are in main (see §3).

## 2. Main's third red test: identified and fixed (in #1247)

- **Test:** `app/src/lib/consistency/audit.test.mjs`, "no NEW discrepancy beyond the pinned baseline (sources unchanged)".
- **Fingerprint:** exactly one, `MODEL_VERSION_MIX|NFL|401873011|nfl-player-board|401873011|-|OFFICIAL:inputRef` (PIT @ NO, 10-25). It is still the only one on main `e3e2977067`.
- **Root cause:** a timestamp-only forecast revision written 6 s before kickoff. The board kept the earlier input reference while the record took the revision.
  - The numbers are identical; only the timestamp differs.
  - This is the defect class B9 removes, because unchanged inputs no longer revise.
- **Fix (`48932e21b6`):** a reviewed `eventOnly` baseline entry that excuses that one fingerprint and nothing else.
  - The class is **not** pinned, so any other event of the same kind still fails strictly.
  - A higher count on the same event still fails.
  - A full re-pin keeps the entry event-only.
  - None of the 536 existing entries changed.
  - 5 new tests in `baseline-event-only.test.mjs`.
- **Proof:**
  - main `e3e2977067` alone: 12 pass, 1 fail.
  - The same tree with the fix: audit plus baseline tests, 18 pass, 0 fail.

## 3. Test results

| Run | Tree | Result | Failures explained |
|---|---|---|---|
| GitHub CI `quality`, run 40223453300 | #1247 at `48932e21b6` (alone) | 10,776 pass, **2 fail**, 5 skipped | Exactly #1245's and #1246's tests. Reproduced locally: those 2 fail on #1247 alone and pass on the integration tree. Main has 3; the audit test passes in CI. |
| Local unit phase (Node 20.4.0, `CI=true`, full history) | integration = `fa2ef148f4` + #1245 + #1246 + #1247 (`04303f04a4`) | 10,776 pass, 5 fail | All 5 are sandbox-only:<br>• 2 `rls-live` (no Postgres: initdb refuses root);<br>• 2 `odds-canary-guard`: the scrubbed env had no proxy, so `npx tsx` stalled past the 60 s child timeout. With the proxy: 3/3 pass in 9.6 s;<br>• 1 EPL `forecast-recovery`: git 2.43 prints `%cI` as `+00:00`, CI's git 2.55 prints `Z`. |
| `npm run build` (`GTP_NBA_THEATER_PUBLIC=1`) | integration | exit 0, all 10 phases OK | One static-worker 60 s timeout warning, retried by Next.js (4-CPU sandbox) |
| Post-build phase, **never run in CI while main is red** | integration `out/` | **755 pass, 0 fail**, 134 files | — |
| axe-core 4.10.2, 390 px, built export | `/nba/simulation/401909861/`, `/nba/simulation/401909867/`, `/nfl/game/401873011/`, `/nfl/game/401873022/` | 0 violations on 3 routes; 1 on the final NFL game, fixed in `72cfd1db28` → 0 | See §4 |

After the four PRs, main should be green in CI. That is an inference from the CI run above plus the integration run, not yet observed.

## 4. Acceptance evidence

**NFL forecast identity (B9)**
- Disposable worktrees, real data. main rewrote 5 revisions on every run; the fix writes 5 once, then 0, then 0.
- Forecast summary and side are identical for all 5 games.
- Positive control: a moved KC @ SEA kickoff writes exactly one revision (`401873022-rev-1845Z`) with lineage, then 0.
- The unit test covers: a later run, a recaptured schedule, a moved kickoff that revises once.

**NBA grading (B3)**
- Real 10-24 record: the scoped grader reproduces every committed NBA grade byte-for-byte.
- **Repeat run:** writes nothing (the "graded twice" guard).
- **Late correction**, flipping GSW @ PHX: reports conflicts for exactly the 3 won cards, leaves the 3 already-lost cards alone and rewrites no line. A correction that keeps the winner (131 → 130) reports no conflict.
- **Three real git races** (grade versus nightly-settle push): the resolver regrades on top and loses no rows. It aborts on any other conflicted file.

**NFL odds budget (B1)**
- The spent ceiling exits 0 with `BUDGET_EXHAUSTED`, a `::warning::` annotation and a step-summary line.
- This was verified with a fake key-shaped key and a dead proxy: it makes **no network call**.
- A raised ceiling still reaches the paid path (unit test).

**Accessibility (B4, B6, B7, B10, B11)**
- Built export, desktop 1280 px / phone 390 px with touch: back links are 24 / 44 px on the NFL game pages and 44 / 44 px on the NBA simulation, with no horizontal overflow.
- The postgame box-score note link (B11) appears only on final games, so earlier scans never reached it.

**#1244 patch**
- The patch is on this branch, linked from the [#1244 review comment](https://github.com/yashwantbalaji3/gametimepicks/pull/1244#issuecomment-6399735724).
- `mixedSlots` only fills slots that the single-sport cards leave empty. It never removes a valid single-sport card (tested on a 96-instant real slate).

## 5. Production acceptance checks (after each deploy)

**After batch 1 (#1245, #1246):**
- [ ] The NBA projections board shows the corrected actuals label.

**After batch 2 (#1247):**
- [ ] CI `quality` is green on main, including "Rendered guards (post-build)".
- [ ] `/methodology` NBA row reads "only as unpriced model suggestions".
- [ ] `/results` "by policy and tier" shows no raw `@1/` text.
- [ ] Footer and back links are ≥ 24 px on desktop and ≥ 44 px on a phone.
- [ ] A final NFL game page's box-score note link is underlined.
- [ ] The next NFL window with games writes **at most one revision per pending game** (the one-time hash-formula change), and 0 on later windows. The numbers in that revision equal the previous receipt.
- [ ] The next NFL window with the allowance spent is green, with a `BUDGET_EXHAUSTED` warning.
- [ ] The next NBA night: `graded.jsonl` gains the NBA rows inside the `auto: nba results capture` commit.
- [ ] The next nightly-settle has no rebase failure.
- [ ] `cd app && npx tsx --test src/lib/consistency/audit.test.mjs` on main passes (no new strict discrepancy).

**After batch 3 (#1244 + patch):**
- [ ] Nothing public changes while `LEVEL_A_MIXED_PUBLIC = false`.

## 6. Rollback

- **Each batch:** revert its merge commit and redeploy through the normal path.
- **#1247:** workflows return to their old behaviour.
  - Receipts and grades are append-only, so rows written meanwhile stay valid.
  - The `eventOnly` baseline entry is inert once reverted.
- **#1244:** keep the switch OFF; no revert is needed.

## 7. Expected behaviour changes

- NFL: one revision per pending game on the first run after deploy, then none until inputs really change. Fewer data-only builds.
- NFL odds windows: green with a warning instead of red while the allowance is spent.
- NBA Level A cards: graded within minutes of finals instead of about 5 h later.
- Public copy and UI: methodology wording, results labels, larger tap targets, keyboard-reachable tables, underlined in-text links.

## 8. Founder decisions (not taken here)

- NFL odds allowance: renew, raise, or stay on the 10-11 capture.
- Flipping `LEVEL_A_MIXED_PUBLIC`, after the §7 package.
- NBA Top-10 board, correlation caps, sportsbook links (plus legal), Terms and Privacy (counsel), challenger promotion, `NBA_FINALS_WAITER_ENABLED`.

## 9. Still unverified, and known risks

- **Not observed yet:** main green in CI after the merges; production behaviour from §5.
- **Not run:** the live-RLS tests (they need Postgres as non-root; CI runs them).
- **Not run with the patch:** the 1244 + patch tree went through the Level A tests (72 of 72), not the full suite.
- **Pre-existing flake risk, not changed here:** `adoption-mutation.test.mjs` rewrites `src/lib/analytics/adoption.ts` on disk while sibling test files run in parallel. `adoption.test.mjs` can therefore load the mutated source and fail intermittently.
  - Suggested fix: mutate a temp copy instead.
  - In this run, the file was restored and nothing failed.
