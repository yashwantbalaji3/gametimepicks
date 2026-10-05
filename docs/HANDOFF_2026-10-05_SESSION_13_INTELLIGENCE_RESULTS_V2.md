# Handoff: 2026-10-05 — Session 13: Intelligence + Results V2 + Simulation Engine V2

Point-in-time; the repo and Production are current truth. Process held: one code PR at a time, merge `main` (never
rebase), explicit `git add`, exact-head CI, `gh pr merge --merge --match-head-commit` (founder authorization given in chat
for Session 13), verify on `main` and Production before the next PR.

## 1. State

| | |
|---|---|
| Session start | 2026-10-05 ~00:05Z · main `fc174e4694` · #955 (Session 12 docs) merged 00:06:15Z → `f4f002ee3d` (squash — before the founder named the repo's merge-commit convention) |
| PRs merged (all `--merge --match-head-commit`, exact-head green) | **#956** Forecast Ledger 02:12:32Z `0c28e3e20a` · **#957** Simulation Engine V2 SHADOW 02:35:37Z `573bdd2608` · **#958** Results V2 Forecast Record 03:15:33Z `f40fa3b8c0` · **#959** NFL experimental settlement sweep 03:38:00Z `c962d3d0df` · **#960** ledger canonical subject ids 04:00:25Z `7b1bc3ed71` · **#961** Ask V2 04:27:40Z `1db4134d43` · **#962** Research V2 04:49:47Z `01a95757c7` · **#963** NBA overnight tips 05:12:34Z `7fe6d166ed` · **#964** Simulation Center (internal) 05:47:23Z `0b904b5ea3` · **#965** forward shadow schedule 06:10:21Z `54f5911ba6` · **#966** search → Forecast Record 06:32:15Z `f7bdd9388a` · this docs PR merges last |
| Open | #716 (intentional long-term HOLD, untouched) |
| FINAL MAIN SHA (code) | `f7bdd9388a` (this docs PR merges on top) |
| FINAL PRODUCTION SHA | `f7bdd9388a` (`/data/build-info.json`) — contains #956–#966 |

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
- Rows (2026-10-05): **10,081** — NFL 2,778 · MLB 2,617 · EPL 4,608 · Ligue 1 18 · UFC 60. SETTLED 7,292 · VOID 2,129 ·
  NO_MEASUREMENT 483 · PENDING 177. Duplicates 0 (enforced) · shadow leakage 0 (enforced). Parity with the NFL, EPL and
  UFC owners' own Brier / log loss on every row they publish.
- Owner defects it surfaced: NFL experimental settlement never graded Week 2 (16 games) + 5 preseason games → fixed
  forward by #959 (official box-score fallback + pending sweep; runtime proof = the next `nfl-event-window` run settles
  09-17 +1, 09-20 +14, 09-21 +1); evening games graded once per UTC folder (lifetime summary already de-duplicated —
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
`forecast-record`, `simulation-meaning`; golden `frc-01..03`; eval 145/145. Production (real provider, `1db4134d`):
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

## 13. Runtime proofs pending (check first next session)

1. **Ledger nightly** — the first unattended `nightly-settle` "Forecast Ledger" step (crons run hours late; last delivered
   10-04 14:57Z). Expect `UNCHANGED` or new rows, no `APPEND_ONLY_VIOLATION`.
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
4. Results V2: NFL props Weeks 1–2 backfill via an exact id crosswalk; MLB projected-score / EPL BTTS settlement owners.
5. Research V2: team research history, Compare, Data Coverage page; nav grouping.
6. Founder packets (§12).
