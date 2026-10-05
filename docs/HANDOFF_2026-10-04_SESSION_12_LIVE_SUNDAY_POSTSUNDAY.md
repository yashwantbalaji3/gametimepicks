# Handoff: 2026-10-04 — Session 12: live Sunday → post-Sunday reliability

Point-in-time; the repo and Production are current truth. Process held: one code PR at a time, merge `main` (never
rebase), exact-head CI, merge, verify on `main` and Production before the next PR; explicit `git add`.

## 1. State

| | |
|---|---|
| Session start | ~18:51Z (2:51 PM ET) · main `2ed0fc1977` · Production `2ed0fc19` (built 18:45Z) |
| PRs merged | **#950** daily-products ticks the kickoff owners by dispatch · 19:38:57Z · `ac8b0826ed` · **#951** Sunday free pregame refresh · 20:04:56Z · `db5e272260` · **#952** append-only Top-5 withdrawal log · 20:27:12Z · `a82f71064f` · **#953** Mr Dub "As of" reads the fold · 20:51:22Z · `47c6eed474` · **#954** shadow report rewrite check fails closed in a shallow checkout + real history in CI · 21:13:18Z · `63fd4c840a` |
| Open | none from this session except this docs PR · #716 (intentional long-term HOLD, untouched) |
| FINAL MAIN SHA | `61b130f71c` (code + data at 23:27Z; this docs PR merges on top) |
| FINAL PRODUCTION SHA | `61b130f71c`, built 2026-10-04T23:27:35Z (`/data/build-info.json`) — contains #950–#954 and the SNF INACTIVES boards |

## 2. Live Sunday

### 2a. Corrections to the Session 11 handoff (measured today)

- **The 13:00Z Sunday sweep was not dropped — it was DELAYED 4h17m** and fired at **17:17Z** (`37219945576`,
  `0 13 * * 0` → prop sweep, **33 credits**, prices `capturedAt` 17:18:17Z). It is canonical (the scheduled sweep),
  not a second authorized capture, but it means the Session 11 "no second Sunday spend" premise did not hold.
  Two delayed team-market crons (`30 14`/`0 15`) fired at 18:18Z (3 credits) and 18:34Z (refused: identical
  request < 45 min). **Ledger now 823 / 1,160 · 337 remaining** (`p171-ledger.json`).
- The SNF T-120 kickoff refresh WILL dispatch (canonical: prices > 180 min old at 22:20Z; budgeted ~8 credits/event).
- Healthy scratches DO reach the canonical owner: the ESPN injuries feed carries official inactives as
  `Out` (`fantasyStatus: INACTIVE`). The gap was only that no pass ran after the declaration.
- ESPN **back-stamps** inactives: KC's six were stamped 19:09Z but were not in the feed at 19:22:17Z; they
  appeared by 19:24Z. Judge a pass by when it RAN, not by the stamps it will read.

### 2b. 4 PM block — **GO**

Three zero-credit availability passes via the canonical owner (`nfl-event-window`, `skip_odds=true`,
`lookahead_hours=18`; odds step **skipped** in each; 0 credits):

| Run | Window | Caught |
|---|---|---|
| `37226573238` (19:00Z) | T-65 for 20:05Z | MIA/MIN inactives (18:38–18:44Z stamps) → newly excluded on the board: Max Brosmer |
| `37227944243` (19:21Z) | T-64 for 20:25Z | DEN/SF/LV/LAC/SEA inactives (18:58–19:07Z) → Jordan James (SF), Aidan O'Connell excluded; Mike Evans / Trey Lance / Ladd McConkey re-cleared to Active |
| `37228083798` (19:23Z) | T-62 | KC inactives (Wiley, Nussmeier, Pounds, Pyburn, Simmons, Canady) — none on a public board |

Public boards (`weekly-boards/latest.json` 19:24:18Z) — five families, 45 rows, all from unstarted games, all
`AVAILABLE_ROLE_UNCERTAIN`; vs the 19:24:40Z injuries feed: QUESTIONABLE 0 · DOUBTFUL 0 · OUT 0 · INACTIVE 0 ·
practice squad 0 · unknown/stale 0; all 45 on their current roster team (19:24:18Z rosters). Healthy players
wrongly removed: 0 (no public row moved in any pass).

Production (`fd90a28b`, built 19:26:06Z) at 390 px and 1280 px: `/nfl`, the five remaining game pages
(401872974–978), `/today`, `/ask` — 0 horizontal overflow, 0 NaN/undefined/[object Object], 0 Questionable/Doubtful
rows, no Zay Flowers, 0 console errors; `/nfl` stamped "Updated Sun 3:24 PM ET".

**Started-game preservation:** `git diff 2ed0fc1977..` touches only boards/receipts for 401872974–979;
`forecasts/2026-10-04.json` holds only those six; `frozen-latest.json` changed only `generatedAt`; IND @ WSH and the
1 PM games untouched.

### 2c. SNF — **GO** — the first fully automatic pregame cycle (no human dispatch)

`nfl-pregame-free-refresh` run `37231455667` (started by a `publication-watchdog` `workflow_run` tick, 20:16Z) logged, unattended:
`WAIT_THEN_DISPATCH ROSTER` → `DISPATCH_NOW ROSTER` (T-103, event window `37240710202`, 22:37:18Z, odds step skipped) →
`WAIT_THEN_DISPATCH INACTIVES` → `DISPATCH_NOW INACTIVES` (T-55, `37243677065`, 23:25:03Z, odds step skipped) →
`ALREADY_REFRESHED` → exit. **Race protection proven:** the paid `nfl-kickoff-refresh` ticked 4 s after the ROSTER
dispatch and HELD `RUN_IN_FLIGHT`. The paid T-120 refresh never got a tick inside 22:20–00:20Z (watchdog hourly
after 18Z, late), so SNF kept the 17:18Z prices (~7 h at kickoff, inside the ≤ 12 h window) — no capture was bought
for a later timestamp; ledger unchanged at **823 / 1,160**.

INACTIVES pass caught DET (Wingo, White, Conklin, Fitzgerald, Hassanein, Bartch; 23:05Z) and CAR (Coker, Sanders,
Jackson, King, Reese IV, Lewis; 23:00–23:12Z); newly excluded on the DET @ CAR board: Jalen Coker (was Questionable),
Ja'Tavion Sanders. Public boards (23:25:49Z): 39 rows, all unstarted (SNF + MNF), blocked 0. Only the 401872978/979
boards changed — started 4 PM boards untouched. Production (`61b130f7`) at 390/1280 px on `/nfl` ("Updated Sun 7:25 PM
ET"), `/nfl/game/401872978`, `/today`, `/ask`: 0 overflow, 0 NaN/undefined, 0 Questionable/Doubtful, Coker absent; 0
resources ≥ 400 on those routes and `/results/date/2026-10-04/` (9 resource 404s seen earlier in the long-lived test tab
did not reproduce on any acceptance route).

### 2d. Live observation

`/live`, `/nfl`, `/results`: 200, no NaN/undefined. No live probabilities invented.

## 3. Trigger reliability (Phase F) — #950 · CODE_FIXED · mechanism proven · depth-4 proof PENDING

**Old topology (measured today):** `nfl-kickoff-refresh` ← cron (2 of 28 Sunday slots delivered: 14:34Z, 18:30Z) +
`workflow_run` on `publication-watchdog` (silent 00:22Z → 16:01Z) and `daily-products`. `daily-products` delivered at
11:17, 13:03, 14:04, 15:09Z but never ticked: those runs were depth 4
(`nightly-settle` cron → `morning-projections` → `mlb-daily-production` → `daily-products`). The same day proved the
boundary: depth-3 `daily-products` 15:40Z → tick 15:43Z ✓, depth-2 15:55Z → 15:58Z ✓. **GitHub runs at most 4
workflows per `workflow_run` chain.**

**New topology:** `daily-products` → new `tick` job → `gh workflow run` (workflow_dispatch starts a fresh chain)
for `nfl-kickoff-refresh`, `nfl-pregame-free-refresh` (#951) and `nba-forecast-window`. No `needs`, no concurrency
group (writer group moved to the `generate` job), no success requirement, default-branch only, `actions: write`
only, no checkout, no secret, never the capture. Dead `daily-products` `workflow_run` sources removed.
`workflow-trigger-depth.test.mjs` computes worst-case chain depth over every workflow (≤ 4) and pins the tick.

**Proof:** dispatch mechanism PROVEN — `daily-products` dry run `37229123329` → tick dispatched
`nfl-kickoff-refresh` (19:39:47Z, `workflow_dispatch`, decided HOLD ALREADY_FRESH) and `nba-forecast-window`
(19:39:48Z). **RUNTIME_PROOF_PENDING:** a depth-4 morning `daily-products` run (next delivered morning chain)
showing the tick.

## 4. Sunday T-55 (Phase G) — #951 · CODE_FIXED · RUNTIME_PROOF **PROVEN on SNF**

Owner: the existing free `nfl-pregame-free-refresh` (ROSTER T-105, INACTIVES T-55, `skip_odds=true`), no new writer.
- Decider walks kickoff groups in order (a finished/too-late group no longer ends the job); single-game
  Thursday/Monday behaviour unchanged.
- Clocks: daily-products tick (mornings), `workflow_run` on `publication-watchdog` (depth 2), Sunday crons.
- Race protection: an in-flight `nfl-event-window` (paid or free) is waited out and the decision is RE-MADE on the
  boards it produced before any dispatch; exactly one dispatch (`skip_odds=true`); no secret.
- Spend: 0 by construction.

## 5. Withdrawal (Phase H) — #952 · LIVE · runtime PROVEN (`results-top-boards` run `37232160356`: log 0 → 2 events, `--verify-staged` ✓, commit `9c3e79e6d2`; receipts dir diff empty; Production `/results/date/2026-10-04/` shows both Zay rows Withdrawn / not actionable, settlement "Not final yet" unchanged; 375 px no overflow)

Sidecar `results/top-board-withdrawals/<day>.json` (append-only; `verifyAppendOnly`), pre-kickoff evidence only
(receipt's own participation at `publishedAt`, or a per-game board stamped before kickoff), state = last event
(WITHDRAWN / REINSTATED, same allowlist as the ranking gate), `recordedAt` stated. Receipt bytes never touched
(sha256 pinned in tests). UI: row stays, marked Withdrawn / not actionable with evidence; settlement word
unchanged. Live: Zay Flowers ×2 families (FROZEN_RECEIPT, 10-03 14:44:14Z).

## 6. MNF (ATL @ NO, 2026-10-06 00:15Z) — plan (simulated against the real deciders)

- Odds: canonical `nfl-kickoff-refresh` HOLD until Mon 22:15Z, then DISPATCH (Sunday 17:18Z prices are stale);
  ~8 credits (one event). The SNF T-120 run's week window also prices MNF on Sunday — still stale by Monday.
- Availability: `nfl-pregame-free-refresh` ROSTER 22:30Z (satisfied if the paid run lands first), INACTIVES 23:20Z.
- Freshness: no Sunday price used as Monday's; post-kickoff prices never captured (pre-start window).

## 7. Week-4 settlement / ATD

Week-4 settlement: in progress (games today/Monday) via the existing scheduled `--post-final` sweep — no second system.
ATD forward (`player-props-share-level-forward/receipt.json`, recomputed independently): **n 524 / 1,000**, log loss
0.4867 (base 0.5009), level **1.182**, ECE **0.0431**; over-prediction at the top (p ≥ 0.40: n 71, pred 0.507 vs
obs 0.366). Gate ACCUMULATING; family GATED. Week 4 adds ~260 → ~785; Week 5 needed to reach 1,000.
Recompute after MNF: `node scripts/research/nfl/forward-player-props-share-level.mjs --grade --now <ISO>` (daily 13:30Z
via `nfl-props-forward-shadow`). No retune, no bar change, no grant.

## 8. Product Engine / SP / BB / MS (read-only, 19:45Z)

Universe 850 candidates · 6 eligible (MLB, all MARKET_IMPLIED: ATL @ LAD ML/RL/total). NFL **774 · 0 eligible ·
0 MARKET_IMPLIED**; MODEL-backed rows: ATD 263 (all SPORT_GATED). Exclusions: SPORT_GATED 774 · ROLE_UNCERTAIN 720 ·
NO_PROBABILITY 501 · EVENT_STARTED 485 · MARKET_MISSING 202 · ODDS_OUT_OF_RANGE 106 · EVENT_INSIDE_CUTOFF 91 ·
AVAILABILITY_BLOCKED 88 · MODEL_DEMOTED 64 · FAMILY_NOT_CLEARED 47 · ODDS_STALE 23 · MODEL_NOT_PUBLIC 10.
SP-V2: 3 forward days, 5 cards (1-2, 2 pending), 10-02 no-card; 0 guard failures; MARKET_IMPLIED (MLB).
BB-C1 / BB-C2b: 14 decided, survival 0.50 vs control 0.588 → **NOT_YET**. MS-C1 / MS-C4: 5 decided → **NOT_YET**.
⚠ The shadow report's "first commit / rewrite INTACT" column was vacuous in CI (shallow checkout → every file's first
commit = the shallow boundary `697b131a6`). **Fixed in #954** (boundary ⇒ UNVERIFIED, never INTACT; `nightly-settle`
deepens history before the report) — runtime proof = the next `nightly-settle` report showing real first commits.

## 9. Mr Dub

`npm run money:audit`: **$15,090.40** · peak $20,465.40 (06-24) · **−$5,375.00** · settled open exposure **$0** ·
folded through 10-03 · 131 movements · ✓ RECONCILED. C1: 0 banked. Today's live portfolio (not yet settled):
$225 at risk (BB-A step 2 $100 exposure, BB-B step 1 $100, MS-A step 1 $25). **#953**: the public "As of" KPI read the md5-locked `portfolio.json` `generatedAt` ("As of Jul 7") → now the fold's `foldedThrough`; Production `/mr-dub` reads "As of Oct 3 · 2026-10-03" (`47c6eed474`).

## 10. Friends beta — CODE-READY · NOT HOSTED-LIVE

No hosted project (no Supabase URL/key in Production bundles, Vercel `gametime-picks` env names, repo env, GH secrets).
No privileged key in any client bundle. Founder checklist: create project → run `db/accounts-schema.sql` → disable
open sign-up → Site URL + redirect `https://gametimepicks.yashwantbalaji.com/account/` → Vercel env
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only) + **redeploy** →
invite testers (`beta_access`) → `npm run accounts:verify` + `RLS_DB_URL=… node app/scripts/accounts/rls-live.mjs --hosted`
→ two-account acceptance (SUPABASE_BETA_SETUP.md).

## 11. NBA (Oct 20)

- Factual: `nba-forecast-window` 21 runs since #942, all correct HOLDs; BUILD path not yet exercised at runtime;
  write-once receipts intact (`verify-nba-forecast-receipts.mjs --against HEAD`); injury hash join PROVEN.
  ⚠ International tips HOU@DAL 10-09 12:00Z and DAL@HOU 10-11 10:00Z sit in the overnight hole (only the hourly
  cron reaches them; it delivered 4/~20 overnight) — needs an overnight-safe clock before 10-09.
- Predictive: WITHHELD (unchanged).
- **G10 (founder):** `auto-refresh.yml` legacy paid NBA step is one variable flip (`ODDS_DRY_RUN=false`) or one
  dispatch from spending (no receipt, no ledger; up to ~28–56 credits/run, 9 runs/day). Proposed hard gate:
  require `vars.NBA_LEGACY_REFRESH == 'true' && ENABLE_ODDS_REFRESH == 'true'` on the paid/enrichment steps (diff
  prepared, not applied); zero-code alternative: set `ENABLE_ODDS_REFRESH=false`.
- **G3 (founder / model version):** v0 reads only frozen `corpus-v1` (+ boxscores); 2026-27 finals would change
  output (probe: one final moves MIA 1465→1479, a 10-08 pHome 0.561→0.580). Recommendation: keep v0 frozen as control
  and register a new version (`v0.2-walkforward`) with its own ledger before 10-20.

## 12. MLB historical restoration — founder decision

Three Oct-3 games lost public `frozenPregame` in `mlb/full-game-simulations/2026-10-03.json` (+ derived
`predictions/2026-10-03.json`): 849829 CWS@CLE (source `7c807c5d88`), 849828 ATL@LAD (source `029a5ecdfc`;
erased 21:40Z by `9a1f26ff25`, correcting Session 10), 849835 NYY@TB (source `729b8b03ca`). Writer is
`JSON.stringify(x,null,2)` — re-serialisation is byte-exact on all 15 committed versions; embedded `artifactHash`es
re-derive; win probabilities equal the graded snapshots. No settlement/bankroll file references them
(`settledIntoMoney: false`). Recommendation: restore exact original bytes only. Not restored.

## 13. UFC / Soccer

UFC 332 graded 14/14 (11 model reads graded, 7-4; 3 named skips). ⚠ `eventMismatch` still ALWAYS true (ESPN id vs
Odds-API hash compared with `!==`) → must be fixed before any UFC product; UFC product gate holds. Minor: `/ufc`
copy promises paper cards that aren't on the page. Soccer: no blockers; EPL odds frozen 09-19 (labelled), FPL
crosswalk candidate-only, `/epl` 473/500 KB.

## 14. Launch readiness (Production, curl + 375 px)

All key routes 200; 0 NaN/undefined/[object Object]/Infinity; 1,520 sitemap URLs 200; no page-level horizontal
scroll at 375 px. Blockers: (1) `/privacy`, `/terms` 404 by design until counsel + operator entity (founder);
(2) accounts not hosted (founder); (3) Mr Dub "As of Jul 7" stamp — FIXED (#953, Production verified); (4) UFC eventMismatch (future
UFC product only). Notes: `/results/nba` 3.7 MB raw with no page-weight budget; `launch-contract.mjs` still says
analytics BLOCKED while the collector is enabled; launch checklist docs dated July (handoffs are current truth).

## 15. Founder gates

New paid spend · Phase H live-prop re-enable · G10 paid-policy hard gate · G3 NBA model version · MLB historical
restoration · ATD grant · SP-V2 / BB / MS adoption · legal pages (counsel) · Supabase hosting.

## 16. Known risks

- GitHub delivery is DELAYED (hours) as well as dropped; a delayed paid sweep cron still spends (canonical).
- The kickoff-refresh decider will dispatch a paid capture minutes before a kickoff if prices cross 180 min then
  (e.g. 4:25 games at 20:18Z) — canonical budget, but late.
- Analytics collection is enabled while `/privacy` is 404 pending counsel; the internal launch tracker
  (`launch-contract.mjs`) still says analytics BLOCKED (stale, internal only — no public false claim found).
- NBA overnight international tips (10-09, 10-11).
- Two first-attempt guards in this session were vacuous and caught by their own probes (shared bash loop variable;
  a regex matching its own header comment) — keep probing every guard, with a control.

## 17. Next session

1. Confirm runtime proofs: depth-4 `daily-products` tick (#950); Sunday/Monday free INACTIVES pass (#951).
2. MNF: watch the Monday T-120 paid refresh + 23:20Z INACTIVES pass; Week-4 settlement → CANONICAL.
3. ATD forward receipt after Week 4 (report only).
4. Confirm #954 in the next `nightly-settle` report; NBA overnight clock before 10-09 / 10-11 (the #950 tick covers a
   10-09 12:00Z tip only if the morning chain delivers before ~11:30Z; 10-11 10:00Z is not covered); UFC eventMismatch.
5. Founder packets: G10, G3, MLB restoration, Supabase, legal.
