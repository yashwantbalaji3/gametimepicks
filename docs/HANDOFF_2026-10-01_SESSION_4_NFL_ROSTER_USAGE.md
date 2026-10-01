# Handoff: 2026-10-01, Session 4 — NFL roster, availability, usage and prediction reliability (P0)

**Scope:** NFL only. This is a point-in-time snapshot; for current truth read the repo, `/data/build-info.json` and `gh pr list`. It continues [`HANDOFF_2026-10-01_SESSION_3.md`](./HANDOFF_2026-10-01_SESSION_3.md).

- **PRs:** #873 (A: board roster integrity), #874 (B: 2026 season into the role-share pool), #875 (D: Ask TD parity), this PR (C: roster audit health check + handoff). #716 untouched (HOLD).
- **Final SHAs:** see the PR merge commits and Production `build-info.json` (recorded at the end of this doc).

## 1. Root cause — why PIT @ CLE showed "Recent signings — last season's usage"

Traced, not assumed. Every claim below was reproduced on the committed artifacts of 2026-10-01.

| Question (§10) | Finding |
|---|---|
| Does current-season usage exist? | **Yes, in one producer only.** The weekly share-level forward forecast (`scripts/research/nfl/forward-player-props-share-level.mjs`, frozen per week before the first kickoff) folds 2026 nflverse stats: 48 games through 2026-09-30. It modelled Rico Dowdle at PIT from three 2026 games. |
| Is it connected to every family? | **No.** Rush yards, pass yards (ESTIMATE) and anytime TD publish from that weekly forecast. **Receptions / receiving yards** publish from the **v1 engine** (the share-level receiving family is `FORWARD_BREACHED`, so the board falls back by rule), and the v1 engine allocates from `role-shares-v1/current.json`, built from the **2023–2025 corpus only**. No 2026 game ever reached it. |
| Stale team mapping? | Membership was current (rebuilt against the roster every event window). Usage was not. The stint rule resets on a team change and waits for a game at the new club, and none arrived. So movers (Pittman IND→PIT) and every rookie (KC Concepcion, CLE's top 2026 target share) were absent from receiving: **79** current-season receivers slate-wide. |
| Why the strip? | `deriveNewArrivals` read only the 2024/2025 corpus, so a mover's "most recent stint" was his OLD club all season. It also skipped role state `INACTIVE`, a word role evidence never emits (it says `OUT`), so Dowdle (Out) was listed under the forecast he cannot play in. Same on 3 other boards: A.J. Brown (IR), David Njoku, Travis Etienne Jr. |
| Incompatible keys? | No. ESPN athlete ids are durable across both corpora and the board (`nfl-athlete-4038815` is Dowdle at CAR in 2025 and at PIT in 2026). The depth-chart capture spells clubs the ESPN way (WSH, LAR) — not nflverse. |
| Intentional gate? | The stint rule (no prior-club volume at a new club) is the evaluated policy and is kept: nothing in this session copies prior-club volume. |
| Another stale owner? | The QB starter: the depth chart was captured (twice a week) but no producer read it. CLE published passing yards for three QBs (Σ pass-attempt share 1.957). |
| Score / win probability? | **Team-level.** `build-nfl-public-forecasts.mjs` reads no player, roster, injury or depth input; it is unchanged and roster-independent. The v1 player sim is pinned to the same team score means (`teamScoreCheck`). Regular-season NFL has no separate player-driven simulation (`game-simulations` is preseason-only; `/simulate` links NFL cards to the game page). |

## 2. What shipped

### PR A — #873: board roster integrity (`build-nfl-player-board.mjs`, `lib/sports/nfl/board-roster-integrity.mjs`)
- **Unavailable ⇒ no row.** OUT / INACTIVE / IR / suspended players hold no current-game row in any family — anytime TD included ("conditions on playing" is true of settlement and misleading under "Likely TD scorers").
- **One passer per pass-attempt pool**, from the depth chart's QB1 (§19 shadow rule; §2.5 pre-authorised after the 09-27 Sunday acceptance). Removal, never renormalisation (§20). Fail-closed: stale chart (> 3 days, §12.1) or a QB1 the board does not project ⇒ pool untouched, state `UNRESOLVED` with the reason. Pass-attempt over-allocations on the Week-4 slate: **15 → 0**.
- **Current-season usage at the current club = modelled**, never an "unobserved arrival".
- **Coverage receipt per board** (§24): `PROJECTED` / `EXCLUDED_UNAVAILABLE` / `EXCLUDED_NO_CURRENT_ROLE` / `WITHHELD_ROLE_UNCERTAIN` / `NOT_MODELED_BY_FAMILY` (backup QBs; receivers the receiving pool cannot see — the v1 pool's own 5% target-share inclusion rule, no new threshold).
- **`auditBoard`**: THIRD_TEAM, DUPLICATE_IDENTITY, OFF_ROSTER, UNAVAILABLE_PROJECTED, PASS_POOL_MULTI, MATERIAL_OMISSION (materiality = the weekly forecast's own inclusion rule), ARRIVAL_PROJECTED / _UNAVAILABLE / _HAS_CURRENT_USAGE. Recorded on the artifact (`integrity.violations`) and logged `::error::`; **not** a generator refusal (the Aug 1–3 62-hour outage). The LIVE test runs the real producer on committed inputs and requires 0.
- **UI**: the prior-club strip is removed from the scorecard and the player board. One component (`components/nfl/not-in-these-numbers.tsx`) renders the receipt in a closed **"Model detail — who this forecast leaves out"**; a former club's numbers appear only there, as **"Historical prior, not used in these numbers"**.
- MATERIAL_OMISSION caught a real defect in my own receipt before merge: backup QBs whose only family was passing (Drew Lock SEA, Cooper Rush ATL) vanished once the rule emptied their row.

### PR B — #874: fold the 2026 season into the role-share pool
- `capture-nfl-player-events.mjs --from-current-season`: the 2026 finals listed in the bot-refreshed nflverse `current-season.json`, captured through the same ESPN summary path and R1–R3 reconciliation as 2023–25; already-captured games reused. **48/48, 0 quarantined**.
- `build-nfl-role-shares.mjs` folds the 2026 partition into the **current state only** — same fold, frozen hyperparameters (hl 4, k 0.5, boundary 0.25). The 2023–25 selection and held-out score are byte-identical (receipt differs only in `generatedAt`; 2025 TV 0.4637 vs last-game 0.4971). Accounted on `current.json` (`currentSeason.games/contentHash`).
- `nfl-event-window.yml` captures before the pool rebuild (non-fatal: `if !` under `set -euo pipefail`) and now commits `player-events-v1/2026.json` + `role-shares-v1/` (the committed pool had never been committed by the bot). One-run lag: it reads the `current-season.json` the previous run committed.
- **Calibration boundary (§49):** the props-v1 receipt was scored walk-forward with in-season roles and rates. Production had been running the published receiving family OUTSIDE its evaluated condition; this restores it. No publication state changed.
- Effect (combined A+B dry run): receiving gaps **79 → 23** slate-wide (the residue is players under the pool's own share floor); PIT @ CLE gains Concepcion, Boston (CLE), Pittman Jr., Bernard (PIT) in receiving.

### PR D — #875: Ask TD parity
- Production Ask answered "GameTimePicks does not hold touchdown scorer data" for PIT @ CLE while the game page lists Likely TD scorers. The Ask projection carried range families only. It now carries the board's PUBLISHED anytime-TD probability as one evidence sentence per player, conditioned on playing; absent ⇒ no sentence.

### PR C — this PR: one-command roster audit + health check
- `app/scripts/ops/nfl-roster-audit.mjs`: re-audits every upcoming board against the canonical owners (rosters, injuries contract, role evidence, current-season usage); per-team table; exit 1 on any violation. Runs in `nfl-event-window` after the board build — loud, not fatal. A test injects a third-team row, an OUT player and a second passer and requires exit 1 naming each; an exit-code probe was caught.

## 3. Owners (canonical, unchanged unless stated)

| Concern | Owner | Freshness contract |
|---|---|---|
| Player identity | ESPN athlete id `nfl-athlete-<id>` across corpus, rosters, injuries, board, live | — |
| Current roster | `app/public/data/nfl/rosters/latest.json` (event window) | rosters 168h (`season-context.mjs` FRESHNESS_MATRIX) |
| Availability | `data/internal/research/injuries/nfl/latest.json` → `data/internal/nfl/role-evidence/latest.json` (`isBlockingStatus` from the injuries contract) | injuries 24h; carry-forward of long-term statuses at capture (P254c) |
| QB starter | `data/internal/research/nfl/depth-charts/` (nflverse, Wed + Sat 08:12Z), newest by `acquiredAt` | 3 days (§12.1), fail-closed |
| Current-season usage | weekly share-level forecast (rush/pass/TD) + **`player-events-v1/2026.json` → `role-shares-v1/current.json`** (receiving) | **no SLA existed — proposed below** |
| Board + receipt | `app/public/data/nfl/player-board/<eventId>.json` (`coverage`, `integrity`) | rebuilt each event window until kickoff |

## 4. PIT @ CLE (Thursday 2026-10-02 00:15Z) — before / after

See the receipt table appended at the end (§9) — written after Production verification.

## 5. Week-4 slate audit

`node app/scripts/ops/nfl-roster-audit.mjs` — 16 games, all 32 teams.

| | Before (committed 20:16Z boards) | After |
|---|---|---|
| PASS_POOL_MULTI | 15 | 0 |
| ARRIVAL_UNAVAILABLE (Dowdle, A.J. Brown, Njoku, Etienne) | 4 | 0 |
| ARRIVAL_HAS_CURRENT_USAGE | 4 | 0 |
| identity errors / ghosts / third-team / duplicates / off-roster | 0 | 0 |
| MATERIAL_OMISSION | (not measurable — no receipt) | 0 |
| receiving-family gaps (named, `NOT_MODELED_BY_FAMILY`) | 79 silent | 23 named (after B) |
| carries pools Σ share > 1 | 23 | 23 — **founder/model decision, see §7** |

## 6. Late availability, game-day inactives, freshness (§14, §51, §52)
- **Before freeze, candidates refresh:** the board is rebuilt every event window until kickoff, and a started game keeps its last pre-kickoff revision (the builder only touches events with `kickoffUtc > now`). The weekly share-level forecast is frozen per week by protocol and is never rewritten; the board gates its rows. No silent overwrite path was added.
- **Game-day inactives: NOT carried.** Role evidence states it: `ACTIVE_EXPECTED is unreachable today by construction: no authorized source carries the official game-day inactive list`. A player declared inactive at 90 minutes is invisible unless ESPN's injuries feed marks him Out. Potentially material; no paid source was added. ESPN's free summary endpoint carries per-athlete injury state on game day (P669 finding) — a candidate, not wired.
- **Thursday cadence:** event-window crons are 14:30 / 15:00 / 21:00Z (GitHub-delayed 1h40m–4h55m). The Thursday kickoff-refresh only fires ≤ 120 min before kickoff and its last slot is 21:30Z, so on time it never qualifies for a 00:15Z kickoff. Tonight's board was refreshed by a manual zero-credit dispatch (`skip_odds=true`). **Recommendation:** a Thursday 22:30Z / 23:15Z event-window slot (free with skip_odds), or widen the kickoff-refresh window.
- **Proposed usage SLA (not enforced):** every final in `current-season.json` older than 36h must be in `player-events-v1/2026.json` (mirrors the results 36h bound). The pool's `currentSeason.lastGameUtc` is the field to check.

## 7. Founder / model decisions required
1. **Carries pools over-allocated (23 of 32 teams).** The share-level model publishes each player's share *when he plays* (shrinkK 0, no renormalisation) — e.g. ARI Love 0.57 + Conner 0.44 + Benson 0.30 + Allgeier 0.26. Removing unavailable players does not fix it (committee backs who are all active). Options: (a) renormalise the carries pool conditional on the available set — a model change behind §20, needs the 2014–21 replay + forward bars; (b) WITHHOLD rushing for over-allocated pools; (c) keep and disclose. Not changed tonight.
2. **Unavailable players' mass in the v1 engine** goes to unallocated OTHER (existing policy), so a starter's backup is not scaled up (Dowdle's 0.27 carry share does not move to Warren in v1). Same §20 gate.
3. **Game-day inactives source** (§6).
4. Carried forward unchanged: **paused-market MLB calls in the public game-call record** (Session 3 decision 1); UX-1 nav charter; Ligue 1 odds receipt.

## 8. Not changed
Settlement, Results, protected record, Bank Builder / Moonshot / Suggested methodology, model publication states, validation bars, frozen weekly forecasts, the frozen Oct 1 Top-5 board, team forecasts. No paid API calls; the paid NFL live-odds workflow untouched. No soccer work. #716 HOLD.

DP: **no tasks assigned — onboarding only.**

## 9. PIT @ CLE receipt (filled after Production verification)

Board before = committed 2026-10-01T20:16:30Z (main `401cfcd9`); after = 2026-10-01T22:30:25Z (main `2d1ae326`, A + B). Kickoff 2026-10-02T00:15Z; every regeneration happened before it, through the canonical producer chain (two zero-credit `nfl-event-window` dispatches, `skip_odds=true`). The frozen weekly forecast and the frozen Oct 1 Top-5 board were not touched.

| | Before | After | Why |
|---|---|---|---|
| Score / win | PIT 20–19 · PIT 54.4% / CLE 42.5% / tie 3.1% | **unchanged** | team-level model reads no player input (documented, not a defect of this session) |
| Passing | PIT Rodgers 204 · **CLE Watson 203, Sanders 95, Gabriel 84** (Σ share 1.957) | PIT Rodgers 204 · CLE **Watson 203** | depth-chart QB1 rule (snapshot 2026-09-30); Watson's number untouched (no renormalisation) |
| Rushing | PIT Warren 58.6 · CLE Judkins 42.1, Watson 24.5 | unchanged | share-level frozen forecast; Dowdle (Out) already gated by the injuries contract |
| Receiving PIT | Metcalf 3·35, Freiermuth 2·15, Washington 1·14, Warren 1·8, Wilson 1·6 | Metcalf 3·34, **Wilson 3·25**, Freiermuth 2·23, Warren 2·20, **Pittman Jr. 2·18**, **Bernard 2·15**, Washington 1·15 | v1 pool now folds 2026: Pittman (IND→PIT) and Bernard (rookie) enter; Wilson's target share 0.05→0.13 from his 2026 games. Multinomial allocation conserves targets, so the incumbents were re-shared, not inflated |
| Receiving CLE | Fannin 4·37, Jeudy 3·31, Sampson 1·13, Judkins 2·13, Bond 1·7 | Fannin 4·39, **Concepcion 4·35**, **Boston 3·35**, Jeudy 2·20, R. Sanders 2·16, Judkins 2·15 | Concepcion (CLE's top 2026 target share, 0.196) and Boston (0.143), both rookies, enter; Jeudy 0.161→0.116 |
| TD pool | PIT Warren .358, Metcalf .277, Wilson .206 … · CLE Fannin .350, Judkins .325, Concepcion .290, Boston .282 … | unchanged | frozen weekly forecast (already current-season); no unavailable player was in it |
| Not in the numbers | strip: Dowdle (Out, "20 g at CAR: 2.1 rec · 16.9 yds"), Hodgins ("at NYG") — "none of it is in this game's projections" | Model detail: Dowdle — Not playing (Listed Out); Hodgins — Role not yet observed (no PIT game yet; NYG history as an unused prior); Sanders, Gabriel — not this team's passer; Sampson — no receiving row (below the pool's share floor) | coverage receipt |
| Audit | 3 violations (PASS_POOL_MULTI CLE, ARRIVAL_UNAVAILABLE + ARRIVAL_HAS_CURRENT_USAGE Dowdle) | 0 | |

**Model trace — KC Concepcion (CLE), the corrected new-team player (§66):** ESPN id `nfl-athlete-4870653` (no 2023–25 rows: rookie) → current roster CLE → role evidence `ACTIVE_UNCERTAIN`, no designation → 2026 usage: 3 games, 5/6/9 targets (12 rec, 80 yds) in `player-events-v1/2026.json` → prior: none (stint rule, no prior-club volume) → pool target share 0.196 (CLE's highest), rush 0.039 → v1 multinomial allocation of CLE's simulated targets (team means pinned to the team forecast) → receptions median 4, receiving yards 34.9 → anytime TD 0.290 from the weekly forecast → the team score is unaffected by design → game page "Receiving leaders" + "Likely TD scorers"; Ask carries the same 29.0%.

**Second game — Isaiah Likely (NYG, ARI @ NYG), §67:** `nfl-athlete-4361050` BAL in 2025 → NYG roster → 3 NYG games in 2026 (8/10/5 targets) → pool target share 0.208 → before B: TD row only (0.344), **no receiving projection**; after B: 4 rec · 39.8 yds. Same mechanism, no matchup-specific code.

**Production verification (after #874, Production `d335562e`):** `/nfl/game/401872964/` at 1280 and 390 — no former-club line, no strip, no undefined/NaN, no horizontal overflow, no console errors; Dowdle only as "Not playing"; Gabriel/Sanders carry no passing yards. Representative games NE @ BUF (Sun 1 PM), DEN @ SF (late), DET @ CAR (SNF), ATL @ NO (MNF), `/nfl/` and `/simulate/`: same checks, all clean.

**Ask (§71):** Production answered "does not hold touchdown scorer data" before #875. On the #875 preview with the real provider, "What are today's GameTime forecasts for the NFL game PIT @ CLE? Include the likely touchdown scorers." returned the six probabilities exactly as the game page prints them (35.8 / 35.0 / 32.5 / 29.0 / 28.2 / 27.7%), conditioned on playing, sources = clock · research · forecast. ⚠ Two other phrasings routed to the guide tool only (planner variance — Session 3 backlog) and answered "no data"; the data path is correct, the planner is not reliable for this intent.

**Ask on Production after #875 (`d7a82b22`):** "Who are the likely touchdown scorers in PIT vs CLE tonight?" — the exact question that had answered "does not hold touchdown scorer data" — now returns the six probabilities matching the game page, conditioned on playing (sources: clock · research · forecast). ⚠ **Partial:** "What is Michael Pittman Jr.'s projection…" answers "no projection is listed" — the Ask projection carries the **top 6 players per game** (`build-ask-projections.mjs` `players.slice(0, 6)`, an evidence-length budget), and Pittman ranks 7th. It cites no former club and invents nothing, but it contradicts the game page (2 rec · 18 yds). Backlog: let a player-named forecast question carry that player's row.

## 10. Final state

- **Main / Production at the last product merge:** `d7a82b22ba` (#875), Production `d7a82b22` built 2026-10-01T23:04:53Z. Boards regenerated by `nfl-event-window` 2026-10-01T22:30:25Z (`2d1ae32640`). This PR (#876: audit script, event-window health step, this doc) merges after it; bot data commits follow.
- **CI:** exact-head `quality` green on #873 (`dfc468d4`), #874 (`07e0ec98`), #875 (`35fc0f7f`, re-run on the merged head because #874 was code drift). Drift at merge time was bot data only and the full suite was run locally on the merged head (8,878 / 8,883 / 8,885 pass, 0 fail). For #875 one MLB lineup data commit landed between my local run and the merge.
- **Mutation probes:** 16 (A) + 1 rendered UI (A) + 5 (B) + 1 (D) + 1 (C), all caught; files restored byte-identical.

## 11. Backlog (NFL, by value)
1. Founder decision on carries over-allocation (§7.1) — the largest remaining allocation violation.
2. Game-day inactives source (§6) — ESPN summary per-athlete injury state is free and keyed by the same ids.
3. A Thursday event-window slot near kickoff (free with `skip_odds`).
4. Ask: player-named forecast questions should carry that player even beyond the top 6; the planner sometimes routes TD questions to the guide tool only; the Session 3 fold leaves the visible sentence ending in "are:".
5. Usage SLA (§6) enforced in the audit once agreed.
6. v1 engine: an OUT player keeps pool mass (falls to OTHER); renormalising is §20.
7. `nfl-opportunity-conservation.mjs` / `nfl-qb-starter-shadow.mjs` are still unscheduled; the roster audit now covers the pass pool in the event window.

## Next recommended fresh session
1. Read Oct 2: PIT @ CLE settlement (props graded against the boards published here; Top-5 board settlement from Session 3).
2. Founder decisions §7.1–§7.3 and the carried MLB paused-market decision.
3. Then — only then — the competition-neutral soccer core (Session 3 Phase C item 1).
