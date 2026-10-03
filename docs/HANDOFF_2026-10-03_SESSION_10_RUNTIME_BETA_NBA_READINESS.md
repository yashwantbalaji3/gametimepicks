# Handoff: 2026-10-03 — Session 10 (runtime proof · friends beta · NBA factual readiness)

Additive to `HANDOFF_2026-10-03_FULL_DAY_CONTINUATION.md`. Point-in-time; the repo and Production are current
truth. Process: one implementation PR at a time (merge `main`, never rebase; exact-head CI; merge; verify on
`main` and in Production before the next).

## 1. State

| | |
|---|---|
| Session start main | `729b8b03ca` (Production `729b8b03` — `/data/build-info.json`) |
| FINAL MAIN SHA | `b3b5a9be11` (#944 merge; this docs PR merges on top) |
| FINAL PRODUCTION SHA | `9b8069a8` at 23:46Z — contains #942 and #943; #944 (grader, no public surface) deploying |
| PRs merged | #942 NBA write-once pre-tip receipts + injury provenance + pre-tip window (G2/G4/G7) · merged 23:07:55Z `63b999217e` · #943 MLB frozen pregame forecast survives every refresh · 23:28:26Z `3d514c759d` · #944 NBA grader validation metrics (G5) · 23:44:57Z `b3b5a9be11` · this handoff |
| Open / hold | #716 (long-standing HOLD, untouched) |

Local note: the session began with 32 uncommitted local `nfl/live-props/*.json` files from a Session-9 local
canonicalization run (local ≠ CI-admitted). They were saved to a scratch patch and discarded, never committed.

## 2. NFL settlement — canonicalization PROVEN (runtime, no code change)

| | |
|---|---|
| Ledger | `data/internal/nfl/prop-settlement/` — **1,867 rows · 32 games · 6 slate days** (09-20, 09-21, 09-24, 09-27, 09-28, 10-01) |
| Finality | **CANONICAL 1,867 · PROVISIONAL 0** |
| admittedBy | all 1,867 `{workflow: nfl-event-window, runId: 37129088859}` (14:17Z workflow_dispatch; first FINAL reads committed `d41be5bbb6` 14:19Z) |
| Promotion | scheduled run **37143021179** (18:07Z, commit `96b9c6b02d` 18:08:58Z) — 3 h 50 m after the first reads |
| Promotion diff | `finality` PROVISIONAL→CANONICAL on 1,867 rows; **every other field byte-identical** (frozen block, identity, original, settledAt, lineResult, admittedBy, corrections); 0 duplicate ids; 0 rows added/removed |
| Measurement | OBSERVED 1,480 · NO_MEASUREMENT 387 · **0 unmeasured rows graded** |
| settlementSupport (canonical `prop-settlement-support.mjs`) | **PROVEN ×5** — passing 28 · rushing 79 · receiving yds 150 · receptions 146 · anytime TD 497 qualifying rows (CANONICAL + OBSERVED + line-graded + frozen + CI-admitted) |
| Public gate | `nfl/family-eligibility.json` (18:37Z) `settlementProven: true` for all five; the 10-04 universe no longer emits SETTLEMENT_UNSUPPORTED |

PROVEN clears only the settlement blocker. Every other gate is independent (§4).

## 3. NFL prices

| | |
|---|---|
| Latest prop capture | **2026-10-03 16:52:00Z** (`capture-20261003T1652`, The Odds API) — 874 prop rows, 15 events, 5 families, DraftKings 859 / FanDuel 7 / others 8 (DK→FD→most-complete ladder, one named book per row); 78 credits. Re-carried by the 18:08Z team-market capture (3 credits) |
| Ledger | **711 / 1,160** credits (449 remaining) — no spend by this session |
| Age to kickoff | 13:30Z IND@WSH **20.6 h**; 17:00Z block **24.1 h**; SNF 00:20Z **31.5 h** |
| Within the 12 h product window? | **No** (not yet) — the rule is `asOf − capturedAt ≤ 12 h` (`LEG_BOUNDS.maxPriceAgeMs`); a product built Sunday morning would read ODDS_STALE again |
| Why | not a defect: the Saturday sweep landed; the ≤ 12 h capture is owned by `nfl-kickoff-refresh` (120-min lead, 180-min freshness budget), ticked by publication-watchdog / daily-products on Sunday. **Pending** (Sunday ~11:30Z+): the first tick inside 120 min of the 13:30Z kickoff should dispatch the capture; no spend authorization was added or needed. |
| Known | the 16:52Z capture quarantined some books as "future-stamped" (sourceAsOf seconds after the minute-truncated capturedAt — the known P-quarantine class) |

## 4. NFL role / roster / families

- **Practice squad:** current boards (16 Week-4 boards, roster capture 18:37Z, 494 PS players league-wide) — **before 9 players / 12 family rows → now 0**. The only other player to leave a board since (Keenan Allen, IND) left on `designation: Out` — **0 active players lost**. Production (`729b8b03`) game pages: 0 PS names in visible text at 390/1280 on all 15 Week-4 games; the names remain only in the RSC payload's `practiceSquadFilteredPlayers` (the named-removal receipt), by design.
- **Role:** no source confirms a role; `PROJECTED_DEPTH_STARTER ≠ ROLE_CONFIRMED` enforced (0 role-confirmed rows).
- **ATD** (`nfl-anytime-td-opportunity-v1`): forward **n 524 / 1,000**, log loss 0.487 vs constant 0.501, **level 1.18** (bar 0.90–1.10), **ECE 0.043** (bar ≤ 0.040) — unchanged (Week 4 grades after MNF). Reliability: 0.0–0.1 pred .080/act .092 (76) · 0.1–0.2 .150/.153 (176) · 0.2–0.3 .247/.194 (139) · 0.3–0.4 .344/.290 (62) · **0.4–0.5 .441/.238 (42)** · 0.5–0.6 .541/.500 (16) · 0.6–0.7 .631/.500 (8) · 0.7–0.8 .749/.800 (5). Gate blockers now: **MODEL_FORWARD_ACCUMULATING · ROLE_CONFIRMATION_UNAVAILABLE · NO_FOUNDER_GRANT** (settlement PROVEN; 231/265 priced). GATED. No bar changed, no grant.
- **Passing yds** (share-level v1, ESTIMATE_BELOW_BAR): FAMILY_NOT_PUBLISHED · NO_MODEL_PROBABILITY · MODEL_FORWARD_ACCUMULATING (66/300, ECE 0.108) · ROLE · NO_FOUNDER_GRANT.
- **Rushing yds** (share-level v1): NO_MODEL_PROBABILITY · MODEL_FORWARD_ACCUMULATING (216/300, ECE 0.062, level 1.13) · ROLE · NO_FOUNDER_GRANT.
- **Receiving yds / receptions** (props-v1): NO_MODEL_PROBABILITY · MODEL_FORWARD_UNREGISTERED · ROLE · NO_FOUNDER_GRANT.

## 5. Mr. Dub (`npm run money:audit`)

$15,240.40 · peak $20,465.40 (06-24, crown) · −$5,225.00 · **RECONCILED** · 127 movements · folded through
10-02 · C1 live from 10-02 · **0 completions banked** (no ladder completed) · daily-portfolio seed exposure
10-03: BB $200 · MS $50 (10-03 cards pending tonight's Division Series games). No money rule touched.

## 6. Product Engine V2 + shadows (nothing retuned)

10-04 NFL universe rebuilt read-only (`--now 2026-10-03T22:40Z`, not written): **757 candidates · 0 eligible ·
0 MODEL · 0 MARKET_IMPLIED-eligible** — SPORT_GATED 757 · ROLE_UNCERTAIN 642 · NO_PROBABILITY 464 ·
MARKET_MISSING 121 · ODDS_OUT_OF_RANGE 103 · FAMILY_NOT_CLEARED 83 · AVAILABILITY_BLOCKED 31 · MODEL_NOT_PUBLIC 28.
**SETTLEMENT_UNSUPPORTED 688 → 0** (proven) and **ODDS_STALE 636 → 0 at that instant** (16:52Z capture is 5.8 h
old at 22:40Z; it will be stale again by Sunday's product instant). MLB 10-03 (committed): 142 / 24, all
market-implied team markets.

SP-V2: 2 forward days (10-02 no card; 10-03 medium/high/longshot pending, low NO_CARD_IN_BAND) · SHADOW.
BB-C1: 20 lane-days · 13 decided · survival .462 vs control .600 · published 88 % of control · 0 completions ·
furthest rung 4 · market-implied · **NOT_YET**. MS-C1: 3 decided · NOT_YET. Guard failures 0; day files
rewritten 0; 1 RETROACTIVE (09-21, pre-existing); 2 settlement disagreements on 09-22/09-23 BB-LEGACY legs
(shadow won vs live pending — pre-existing, 09-23 doubleheader era).

## 7. Friends beta

Hosted Supabase: **none** (no secrets / vars / env names; Vercel CLI not installed). **CODE-READY, NOT
HOSTED-LIVE.** The one external dependency is unchanged: founder creates the project → runs
`db/accounts-schema.sql` → sets redirect URLs → sets Vercel env → provides the hosted DB URL for
`node app/scripts/accounts/rls-live.mjs --hosted` and the two-account acceptance (`docs/SUPABASE_BETA_SETUP.md`).

## 8. NBA — Oct 20

Predictive NBA publication was not this session's goal; nothing was promoted, no bar or model changed, registry
`HISTORICAL_ONLY`.

| Gap | Outcome |
|---|---|
| **G2** early tips never forecast pre-tip | **FIXED (#942).** `nba-forecast-window.yml`: hourly cron + `workflow_run` on publication-watchdog / daily-products; a dependency-free pre-check (`decide-nba-forecast-window.mjs`) asks whether a game tips within 8 h without a v0 forecast, then captures injuries, builds only that game (v0; v0.1 alongside, its roster-gate refusal only warns), verifies, commits. Own concurrency group (not `gtp-generated-artifacts`); re-plans on a lost push race; free. Opening day's 19:00Z BOS @ DET is owed from 11:00Z. `sport-schedules`' daily build is unchanged in role and now also write-once. |
| **G4** injuries captured after forecasts | **FIXED (#942).** Injuries capture + commit moved before both NBA forecast steps (order pinned by test). Every receipt records the snapshot's sha256, capture time, entries, age, state (CURRENT ≤ 24 h house bound / STALE / MISSING — a label, not a withholding). A snapshot captured after the forecast instant is **refused** (leakage). No injury weighting changed. |
| **G5** grader lacked preregistered metrics | **FIXED (#944).** `grader-metrics.mjs` → `ledger.validation` per label (preseason never pooled): winner Brier/log loss/ECE + 10-bin reliability (sim and Elo), coin + in-sample home-rate baselines (market: NO_AUTHORIZED_PRICE), margin/total MAE + bias + p10–p90 coverage, overtime vs tie mass, player-family coverage (expectedMinutes ≥ 20; 3PM rate ≥ 0.05/min), availability misses, §8 pre-tip count, §6/§7/§10 states (HOLD / BARS_HOLD / BARS_FAIL / REJECT_EARLY_ECE). Not computable from v0 artifacts and reported as such (never zero): p25–p75 coverage, P(stat ≥ median) ECE, forward overtime facts. Constants pinned to the document text by test. |
| **G7** forecasts not write-once | **FIXED (#942).** Per-game receipt (eventId, generatedAt, modelVersion, family, tip, inputs, payloadSha256 over game **and** receipt); stored games never rewritten; tipped games refused; `runs[]` appended; `verify-nba-forecast-receipts.mjs --against HEAD` before every commit. The two 10-03 legacy games are kept untouched and counted as pre-receipt. |
| **G10** legacy paid NBA path | **AUDITED — FOUNDER GATE.** Repo vars `ENABLE_ODDS_REFRESH=true`, `ODDS_DRY_RUN=true`, `NBA_LEGACY_REFRESH` unset, `ODDS_API_KEY` secret present. `auto-refresh.yml` (9 crons/day) runs "Optional — paid Odds API refresh (props-only)" every time; it stops only at the `ODDS_DRY_RUN` guard. **Today it cannot spend.** One var flip (`ODDS_DRY_RUN=false`) or one manual dispatch with `odds_dry_run=false` would run `pipeline.generate_daily_board --props-only` for today + tomorrow with **no authorization receipt and no credit ledger** (unlike NFL/UFC/EPL), and the key is injected into that step's env on every cron. Also: "Setup Python" / "Install Python dependencies" run on every cron because `ENABLE_ODDS_REFRESH=true`. Recommendation: gate every `ENABLE_ODDS_REFRESH` step on `vars.NBA_LEGACY_REFRESH == 'true' && env.ENABLE_ODDS_REFRESH == 'true'` (or retire them), or set `ENABLE_ODDS_REFRESH=false`. Not changed — policy is the founder's. |
| **G3** 2026-27 data never ingested | **AUDITED — MODEL GATE.** v0 folds only `corpus-v1.json` (last game 2026-06-14) and the corpus box scores; finals-2026 and fetched box scores are never folded, so every regular-season forecast from Oct 20 uses frozen end-of-2025-26 ratings and pools. Folding them changes v0 output → needs a new version string with its own forward shadow (recommended: decide before Oct 20 so its shadow starts on game 1). Not done. |

Model evidence unchanged: v0 Brier 0.267 vs Elo 0.215 (dev season), forward n 0 / 300 (first preseason final
folds on the 10-04 run; preseason never counts toward bars).

| PUBLIC | SHADOW | WITHHELD | MISSING |
|---|---|---|---|
| schedule · team identity · `/nba` factual hub · write-once finals record · `/results/nba` archive | game model / sim (v0, v0.1) · rosters · injuries · validation ledger | points · rebounds · assists · 3PM | PRA · player-prop settlement · NBA Live adapter · NBA Ask tools |

**Launch recommendation:** launch NBA on Oct 20 as factual (schedule + finals + hub) with every model clearly
withheld; the forward shadow now has a pre-tip opportunity for every game and reports its preregistered metrics.

## 9. MLB / Live

**MLB postseason trace (10-03 Division Series, 4 games):** schedule ✓ → postseason state ✓ (season-state, no
calendar guess) → public forecast ✓ (4 simulated pregame) → products ✓ (24 eligible market-implied team legs;
lanes placed) → frozen receipt ✗ **DEFECT** → live ✓ (StatsAPI feed, 38 s fresh) → settlement pending (games
tonight; pending ≠ loss) → Results ✓ (`/results/date/2026-10-02` = that day's published cards).

🔴 **Frozen pregame forecasts erased on public surfaces (fixed forward in #943).** The full-game sim generator
carried a started game's pregame simulation only when the prior FILE predated first pitch; the second lineup
refresh after first pitch therefore published it `unavailable`. 10-03: CWS @ CLE (17:00Z) carried 18:46Z →
erased 19:20Z; ATL @ LAD (20:00Z) erased 22:15Z — `/live` showed "No GameTime pregame forecast" for both.
History: since 09-04 the committed end-of-day files lost most games' pregame forecasts (e.g. 09-08 10/15,
09-09 14/15, 09-13 14/15, 09-20 15/15, 09-27 14/15, 09-29 3/4, 10-01 1/1, 10-03 2/4). The append-only
`data/internal/mlb/prediction-snapshots/<date>/snapshot-<HHMM>.json` kept every run, so model grading evidence
is intact; the public artifacts (and `predictions/<date>.json`, derived from them) are not. Fix: per-game
`frozenPregame` ledger (`lib/mlb/full-game/frozen-carry.mjs`). **Not done: restoring past days** — every erased
game's pregame bytes exist in git history (last pregame commit per game); restoring them into the public files
is a data repair of public historical artifacts and is left as an explicit decision (§11).

**Live (factual) status:**

| Surface | State |
|---|---|
| NFL score / quarter / clock | WORKING (Week 4 not yet played this session; last verified Sessions 5–9) |
| NFL player measurements | WORKING (free post-final sweep; settlement CANONICAL) |
| NFL TD measurement | WORKING — NO_MEASUREMENT is never "no TD" (387 unmeasured rows, 0 graded) |
| MLB live | WORKING (StatsAPI); frozen pregame forecast PARTIAL until #943 deploys (above) |
| UFC live | NOT PUBLIC BY POLICY (product-gated; known eventMismatch id defect) |
| NBA live | MISSING (no adapter) |

No live win probability, no live Suggested Parlays.

## 10. Results / Ask / mobile / accessibility (Production `729b8b03`)

20 launch routes × 390 / 1280 rendered in the browser: **0 horizontal overflow · 0 NaN / undefined / [object
Object] in main** (`/`, `/today`, `/nfl`, `/mlb`, `/ufc`, `/epl`, `/nba`, `/results`, `/results/date/2026-10-02`,
`/ask`, `/build`, `/bank-builder`, `/moonshot`, `/mr-dub`, `/account`, `/my`, `/following`, `/saved`, `/feedback`,
`/live`). `/soccer/` is not a route (the hub is `/epl/`; nothing links to `/soccer/`). CI's structural +
browser a11y layers ran on each PR. Ask: NFL gate record current (`settlementProven: true` ×5); no billed Ask
query was made.

## 11. Founder / model gates

1. **Supabase project** — the beta's only external dependency (create, schema, redirects, Vercel env, hosted DB URL for `rls-live.mjs --hosted`).
2. **ATD family grant** — not before the forward test reaches n 1,000 inside its bars (today 524, level 1.18, ECE 0.043) and a role source exists.
3. **G10** — hard-gate or retire the legacy paid NBA step (`auto-refresh.yml`); today only `ODDS_DRY_RUN=true` stands between a cron and unledgered spend.
4. **G3** — a new NBA version string that folds 2026-27 finals + box scores (its own forward shadow), ideally armed before Oct 20.
5. **MLB public forecast restoration** — whether to restore the erased pregame forecasts of past days (09-04 → 10-03) into the public sim/prediction files from git history (verbatim bytes of each game's last pregame commit; a data repair of public historical artifacts, no recomputation).
6. Unchanged: SP-V2 / BB-C1 / MS-C1 adoption; QB depth-starter ≠ confirmed role; new paid spend (Phase H stays off).

## 12. Known risks

- Sunday's ≤ 12 h NFL price capture still depends on GitHub delivering the watchdog / daily-products clocks to `nfl-kickoff-refresh` (as of writing, latest prop capture 16:52Z Saturday).
- `nba-forecast-window`'s BUILD path is proven only by tests + a dry-run decide at runtime (run 37160833179, HOLD); its first real build is expected ~15:00Z Sunday for the 10-04 23:00Z games (or the daily `sport-schedules` build gets there first — both are write-once).
- Until #943 is deployed and a day passes, `/live` keeps losing started MLB games' forecasts on the 2nd refresh; past days stay erased unless restored (gate 5).
- G10 latent spend path (gate 3).
- First real C1 completion is still plausible within days (no ladder completed yet).
- Local suite: built-export tests read a stale local `out/`; CI builds fresh (do not trust a local red there).

## 13. Next session

1. Confirm a ≤ 12 h NFL prop capture before Sunday's 13:30Z / 17:00Z kickoffs (`ls app/public/data/nfl/markets/` on main; `propPrices.capturedAt` vs kickoff) — if absent, classify (dropped tick / HOLD reason) from `nfl-kickoff-refresh` runs.
2. Confirm `nba-forecast-window` built a receipt-bearing 10-04 forecast before 23:00Z and `verify-nba-forecast-receipts.mjs --against HEAD` stays intact; confirm the 10-04 grader run writes `ledger.validation` (preseason bucket).
3. Confirm #943 at runtime: on the next MLB slate, a game started before two lineup refreshes still shows its frozen forecast on `/live` (and `frozenPregame` appears in the sim file).
4. Founder decisions: Supabase project; G10; G3 version; MLB restoration.
5. ATD forward receipt after MNF (Week 4 grading) — report, do not promote.
