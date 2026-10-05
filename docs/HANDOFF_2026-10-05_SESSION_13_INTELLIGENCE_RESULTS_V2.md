# Handoff: 2026-10-05 — Session 13: Intelligence + Results V2 + Simulation Engine V2

Point-in-time; the repo and Production are current truth. Process held: one code PR at a time, merge `main` (never
rebase), explicit `git add`, exact-head CI, `gh pr merge --merge --match-head-commit` (founder authorization given in chat
for Session 13), verify on `main` and Production before the next PR.

## 1. State

| | |
|---|---|
| Session start | 2026-10-05 ~00:05Z · main `fc174e4694` · #955 (Session 12 docs) merged 00:06:15Z → `f4f002ee3d` (squash — before the founder named the repo's merge-commit convention) |
| PRs merged (all `--merge --match-head-commit`, exact-head green) | **#956** Forecast Ledger 02:12:32Z `0c28e3e20a` · **#957** Simulation Engine V2 SHADOW 02:35:37Z `573bdd2608` · **#958** Results V2 Forecast Record 03:15:33Z `f40fa3b8c0` · **#959** NFL experimental settlement sweep 03:38:00Z `c962d3d0df` · **#960** ledger canonical subject ids 04:00:25Z `7b1bc3ed71` · **#961** Ask V2 04:27:40Z `1db4134d43` · **#962** Research V2 04:49:47Z `01a95757c7` · **#963** NBA overnight tips 05:12:34Z `7fe6d166ed` · **#964** Simulation Center (internal) 05:47:23Z `0b904b5ea3` · **#965** forward shadow schedule 06:10:21Z `54f5911ba6` · **#966** search → Forecast Record 06:32:15Z `f7bdd9388a` · **#967** this handoff 06:40:01Z `2cc7873297` · **#968** NFL props Weeks 1–2 → ledger 07:02:40Z `92fcb9b93c` · **#969** Ask forecast-history follow-ups 07:25:54Z `8943cb6c65` · **#970** ledger coverage report 07:30:25Z `09dd57ea50` · **#971** ledger = Vercel build input 13:00:07Z `c15488bb0f` |
| Open | #716 (intentional long-term HOLD, untouched) |
| FINAL MAIN SHA (code) | ~~`f7bdd9388a`~~ as first written — **superseded: final Session 13 main = `c15488bb0f` (#971); see §16** |
| FINAL PRODUCTION SHA | ~~`f7bdd9388a`~~ (contained #956–#966) — **superseded: final Production = `c15488bb0f` (built 2026-10-05T13:01:41Z, contains #955–#971); see §16** |

## 2. Forecast inventory (Phase A · M1)

Full table: `docs/FORECAST_LEDGER.md` §6. Every public family has a named producer and settlement owner. In the ledger:
NFL winner / total / margin / team score / rush / rec yds / receptions / ATD / pass yds (est.) · MLB moneyline / run line /
total / Homer Nukes · EPL 1X2 / over 2.5 / anytime scorer / SOG · Ligue 1 1X2 · UFC winner. Declared gaps (published,
not measured): NFL props Weeks 1–2 (name-only reconciliation rows), NFL score shape, MLB projected score, MLB prop leans
(RESEARCH — every market demoted), EPL BTTS / clean sheet / double chance / scorelines, UFC method / round, NBA (SHADOW).

## 3. Universal Forecast Ledger (Phase B · M2)

- `app/src/lib/forecast-ledger/` + `app/scripts/results/build-forecast-ledger.mjs` → `data/internal/forecast-ledger/v1/`.
- One row per published forecast observation (the last pre-start publication), read from its owner; identity
  `fl1-FNV64(sport|event|subjectType|subject|family|kind)`; subject ids are canonical entity ids since #960 (audited
  re-key, 4,963 pairs, `v1/migrations/2026-10-05-canonical-subject-ids.json`).
- Append-only guard; a forecast enters once its event starts; Top-5-only rows after kickoff + 72 h; missing = null.
- Schedule: `nightly-settle` step after the settlement commit (own commit via `commit-generated.sh`); a refusal goes red
  and alerts but never blocks the settlement publish.
- Rows at the first build (2026-10-05T00:32Z; point-in-time — final Session 13 state is 10,812, §16): **10,081** — NFL 2,778 · MLB 2,617 · EPL 4,608 · Ligue 1 18 · UFC 60. SETTLED 7,292 · VOID 2,129 ·
  NO_MEASUREMENT 483 · PENDING 177. Duplicates 0 (enforced) · shadow leakage 0 (enforced). Parity with the NFL, EPL and
  UFC owners' own Brier / log loss on every row they publish.
- Owner defects it surfaced: NFL experimental settlement never graded Week 2 (16 games) + 5 preseason games → fixed
  forward by #959 (official box-score fallback + pending sweep; runtime proof = the next `nfl-event-window` run settles
  09-17 +1, 09-20 +14, 09-21 +1 — still PENDING at Session 14 · Chunk 1, §16); evening games graded once per UTC folder (lifetime summary already de-duplicated —
  my first write-up over-stated it and was corrected in #958).

## 4. Simulation Engine V2 (Phases C–F · M3–M6)

Contract, audit, architecture, validation and migration plan: `docs/SIMULATION_ENGINE_V2.md`.

- **v1 audit:** no published NFL number comes from a game path (analytic win head; independent margin ⟂ total Gaussians;
  three player engines sharing no draws). The page label "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME"
  stays — it is true.
- **SimulationReceiptV2** (`simulation-receipt@2`) + validator; **NFL engine** `nfl-drive-sim-v2` `2.0.0-shadow`
  (drive-level, play families inside drives, players from role shares with OTHER, 2025 OT rules, per-run seeded RNG).
- **Run count:** 10,000 (|ΔP(home)| ≤ 0.005 vs 20k; ≈ 1.2 s/game with players).
- **Coherence:** 0 incoherent runs in 1,642,000 (Protocol A) + 1,710,000 (B); mutation probes per invariant.
- **Validation (Protocol A, 2019–21, 821 games, no leakage):** winner Brier V1 0.2217 / **V2 0.2273** / market 0.2113 /
  base 0.2534; team-score MAE 7.748 / 7.753; margin MAE 10.698 / 10.685; total MAE 10.943 / 10.915; margin CRPS
  7.667 / 7.678. New: period model (half Brier 0.2366 vs coin 0.25). Biases: OT 3.2% vs 5.2%, |margin| = 3 7.8% vs 13.4%,
  passing yards 223 vs 250 / rushing 133 vs 116, quarter shape. Correlation signs all match. Player families coherent
  but NOT VALIDATED. Protocol B (2023–25) agrees.
- **State: SHADOW — COHERENT_BUT_NOT_PROMOTED.** Production surface: none public (`/preview/simulation-v2/` is internal —
  verified 404 on Production). First forward shadow receipt: MNF ATL @ NO. Forward ledger scheduled by
  `nfl-sim-v2-shadow.yml` (#965): after every event window + hourly, receipts only on input change.
- **Migration plan:** MLB (closest — adapt `lib/mlb/full-game/` to the receipt), NBA (possession), soccer (chance
  timeline), UFC (round / finish hazard) — each stays on its current engine until its adapter validates.

## 5. Results V2 (Phases H–I · M8–M9)

- `/results/forecasts/` (KPI strip, per-sport family tables, declared gaps, how it works, products kept separate) and
  `/results/forecasts/<sport>/<family>/` (19 static pages: metrics by kind, calibration, pick record only where a pick was
  published, latest 60 rows in words, CSV of every row). `/results` links it (records directory + card).
- Metrics: continuous MAE / median / RMSE / bias / range coverage; binary Brier / log loss / ECE + reliability bins;
  multiclass log loss / Brier / top class + blind-guess reference. No pooled accuracy anywhere.
- CSV: `public/data/forecast-record/v1/<sport>-<family>.csv` emitted each build; rows = page counts (tested).
- Production verified (`f40fa3b8`): all routes 200, KPIs 10,081 / 7,292, 390 px no overflow, no console errors.

## 6. Ask V2 (Phases J–K · M10–M11)

`docs/ASK_GAMETIME.md` §29b. Intents `MODEL_PERFORMANCE` / `FORECAST_HISTORY`; tools `getForecastFamilyPerformance`,
`getForecastHistory` (registry 24); daily projection `ask/v1/forecast-record.json` + per-sport shards; help chunks
`forecast-record`, `simulation-meaning`; golden `frc-01..03`; eval 145/145 at #961 (146/146 after #969 added `multi-06`). Production (real provider, `1db4134d`):
the calibration question answered verified-true with the ledger's numbers; the history question answered with the right
rows but via the deterministic fallback (verifier rejected the writer's draft — read the attempts in the Vercel logs;
safe, grounded, worth tuning).

## 7. Research V2 + cross-linking (Phases L–M · M12–M13)

Player Research pages show "Our forecasts for <player>" (ledger rows by canonical id → family records); family pages
link players to Research; Model Lab lists every family's measured record. Remaining IA ideas (Explore / Compare / Trends /
Data Coverage) are in the DP packet K3 and the next-session list.

## 8. Navigation / search

Global search (#966) reaches the Forecast Record overview, Model Lab and all 19 forecast-type pages (built from the page
owner's reader; verified on Production: 20 entries). Players already resolve to Research pages, which now carry their
forecast history. Nav structure itself unchanged.

## 9. DP packet (Phase O · M14)

`docs/DP_WORK_PACKET_SESSION13.md` — K1 Ask eval corpus (150–250 questions), K2 Results completeness, K3 Research
discoverability, K4 mobile/a11y (incl. the sr-only-escapes-overflow class), K5 EPL identity, K6 forbidden scope.

## 10. Side lanes (Phase P)

- **MNF (ATL @ NO, 10-06 00:15Z):** existing owners (paid T-120 refresh, free ROSTER / INACTIVES) — unchanged.
- **Week-4 settlement / ATD:** existing `--post-final` sweep; ATD forward receipt after MNF (report only, no retune).
- **NBA international tips (#963):** tips in the 06–14Z hole are owed from 18 h out — HOU @ DAL 10-09 12:00Z from the
  10-08 22Z tick, DAL @ HOU 10-11 10:00Z from 10-10 17Z (dry-run on the live schedule). Runtime proof pending (10-08).
- **UFC event-id mismatch:** not changed (blocks UFC products, not measurement — the ledger keys UFC by the ESPN bout id).
- **Friends beta:** CODE-READY · NOT HOSTED-LIVE (unchanged).

## 11. Found in passing

- `live-props-producer.test.mjs` runs the real producer against the real tree and rewrites committed
  `nfl/live-props/*.json` on a game day (flagged as a separate task).
- `ask-official-cards` LIVE test reads a git-ignored local projection; passes on clean checkouts.

## 12. Founder / model gates

Simulation V2 promotion (SHADOW → EXPERIMENTAL / PUBLIC) and its winner-anchoring choice · ATD grant · SP / BB / MS
adoption · NBA G3 / G10 · MLB historical restoration · new paid spend · Supabase hosting · legal pages.

## 13. Runtime proofs pending (check first next session) — status at Session 14 · Chunk 1 in §16

1. **Ledger nightly — ✅ PROVEN** (run `37308269305`, 12:15Z): `auto: forecast ledger` `2b31f76c39` as its own commit after
   the settlement commit; 10,081 → **10,812** rows (+720 NFL Weeks 1–2 from #968, +11 MLB grades), no violation; a rebuild
   against the new HEAD is clean. ⚠ Found: the ledger path was not a Vercel build input, so the nightly commit SKIPPED the
   build and the public Forecast Record stayed on 10,081 — fixed in the build-input PR that follows this addendum.
2. **#959 sweep** — the next `nfl-event-window` run settles Week 2 (09-17 +1, 09-20 +14, 09-21 +1) from the official box
   score; then the ledger moves those 80 rows PENDING → SETTLED.
3. **#965 forward shadow** — first `nfl-sim-v2-shadow` run (cron :41 / after an event window); MNF ATL @ NO should print
   UNCHANGED unless availability moved.
4. **#963 NBA** — `nba-forecast-window` on 10-08 ~22Z builds 10-09.
5. **MNF / Week-4** — paid T-120 refresh, free ROSTER / INACTIVES, settlement → CANONICAL, then ATD forward receipt
   (`forward-player-props-share-level.mjs --grade`), report only.

## 14. Known risks

- Ask `FORECAST_HISTORY` on Production answered via the deterministic fallback (grounded, `verified:false`) — read the
  verifier attempt in the Vercel logs and tune the evidence phrasing.
- Ask projection shard growth: EPL 755 KB of a 3 MB ceiling — fine for a season, re-shard by season if it doubles.
- The ledger lags owners by up to one nightly cycle (cron delays make that longer); Results shows "last settled".
- Sim V2 receipt ids hash the engine version, not code — bump `NFL_SIM_V2_VERSION` on any engine change.

## 15. Next session

1. Confirm §13 runtime proofs; MNF + Week-4 settlement + ATD receipt.
2. Ask history fallback root cause; Ask eval corpus (DP K1) → golden cases.
3. Sim V2 v2.1 (training-window-only fixes: yardage split, late-game logic/key numbers, end-of-half) + grade the
   forward shadow ledger once a week of receipts settles; MLB receipt adapter (closest sport to V2).
4. Results V2: ~~NFL props Weeks 1–2 backfill via an exact id crosswalk~~ (done: #968, +720 rows, 7 names left
   unresolved); MLB projected-score / EPL BTTS settlement owners.
5. Research V2: team research history, Compare, Data Coverage page; nav grouping.
6. Founder packets (§12).

## 16. FINAL SESSION 13 STATE (addendum · Session 14 · Chunk 1, checked 2026-10-05 ~14:15Z)

§1–§15 stay as written (point-in-time). This section records the final state after the late PRs (#967–#971) and the
runtime evidence. Truth order used: `origin/main` → GitHub PR / Actions state → committed artifacts → Production
`build-info` → docs.

| | |
|---|---|
| Final main | `c15488bb0f` (#971 merge); no bot or data commit above it at the check |
| Final Production | `c15488bb0f` (`/data/build-info.json`, built 2026-10-05T13:01:41Z) |
| Merged PR range | #955–#971 (#955 = Session 12 docs, squash; #956–#971 merge commits) |
| Open PRs | #716 only (intentional long-term HOLD) |
| Forecast Ledger | **10,812 rows** · 19 forecast types · SETTLED 7,906 · VOID 2,246 · NO_MEASUREMENT 483 · PENDING 177 · duplicates 0 · shadow leakage 0 (`manifest.json`; `build-forecast-ledger.mjs --check` → `LEDGER_CURRENT`) |
| Ledger nightly (unattended) | **PROVEN** (§13.1, run `37308269305`: +731 rows, 0 append-only violations, clean rebuild) |
| Production Forecast Record | 10,812 (`/results/forecasts/`, after #971 made the ledger a Vercel build input) |
| NFL Weeks 1–2 props | in the ledger (#968): +720 rows by exact roster crosswalk; 7 names left unresolved; 0 unresolved EPL ids |
| Ask eval | 146/146 (fake provider, registry v1/24; `npm run ask:eval`) |
| Search / Research | #966 search → Forecast Record overview, Model Lab and 19 type pages; #968 rows reach player Research histories; #969 Ask history follow-ups keep the player |

**#959 NFL experimental settlement sweep — IMPLEMENTATION COMPLETE · RUNTIME PROOF PENDING.**
- No `nfl-event-window` run on a SHA containing #959 yet: the latest is run `37245186890` (schedule, `bf3cc417a7`,
  2026-10-04 23:50Z), before #959 merged (2026-10-05 03:38Z). The 16 games are still `AWAITING_OFFICIAL_RESULT` on main
  (record folders 09-17 ×1, 09-20 ×14, 09-21 ×1).
- Next automatic opportunity: `nfl-event-window` crons 14:30Z / 15:00Z / 21:00Z (GitHub delivers these hours late).
  Expected effect (dry run on a scratch copy of main, nothing committed): 16 settle from `espn_official_box_score`, plus
  13 Week-5 games (10-03 ×1, 10-04 ×12); five preseason games (08-21/22) stay pending (no official final on file);
  SNF DET @ CAR stays pending until its official box score is on file. Already-graded rows unchanged, no new double
  grade, second pass byte-identical. Ledger dry run: 10,812 rows, PENDING 177 → 32 (145 = 29 games × 5 rows), 0
  append-only violations.

**#965 Simulation V2 forward shadow — IMPLEMENTATION COMPLETE · RUNTIME PROOF PENDING.**
- `nfl-sim-v2-shadow.yml` (workflow_run after `nfl-event-window` + hourly `41 * * 9-12,1,2 *` + dispatch) has **zero
  runs**. Eight hourly slots passed (06:41–13:41Z) and none ran. GitHub delivered few scheduled events across the repo
  that day (e.g. hourly `nba-forecast-window` ran 2 times since 00:00Z; `results-top-boards` ran once), so this looks
  like the known dropped-cron class and not a fault in this workflow. Nothing has triggered the `workflow_run` path
  yet, because `nfl-event-window` has not run since #965 merged.
- Committed shadow receipts: one, `shadow/2026-10-05/401872979.json` (NO @ ATL, `nfl-drive-sim-v2` `2.0.0-shadow`,
  10,000 runs, SHADOW), written by the Session 13 build (`c81049db38`), not by the workflow.
- Isolation (unchanged): `/preview/simulation-v2/` is 404 on Production; no non-preview route reads the receipts;
  `marketUse = NOT_AN_INPUT`; 0 sim-v2 rows in the Forecast Ledger. Promotion state stays SHADOW · COHERENT_BUT_NOT_PROMOTED.
