# NCAAF progress ledger (DP lane)

Execution scratchpad for `docs/ncaaf/NCAAF_V1_EXECUTION_PLAYBOOK.md` §17. **Not** a platform status authority:
the main engineering owner reconciles anything here into `GAMETIMEPICKS_MASTER_ROADMAP_V2.md`.

## Tracker

| ID | Phase status | Maturity / evidence | Next action |
|---|---|---|---|
| NCAAF-001 | **DONE** (research) | TESTED_LOCAL: corpus v1 (14,988 games, 2016–25) reproduces byte-for-byte; 24 tests | Forward capture design moves to NCAAF-005 |
| NCAAF-002 | IN_PROGRESS | Protocol preregistered (`MODEL_EVALUATION_PROTOCOL.md`) before any fit | Implement B0/B1/C1/C2/C3 + evaluator; tune on dev only |
| NCAAF-003 | PLANNED | — | World spec once champions are frozen |
| NCAAF-004 | PLANNED | — | — |
| NCAAF-005 | PLANNED | — | — |
| NCAAF-006 | PLANNED | — | — |
| NCAAF-007 | PLANNED | — | — |
| NCAAF-008 | PLANNED | — | — |
| NCAAF-009 | PLANNED | — | — |
| NCAAF-010 | PLANNED | — | Founder gate |

## Stage 1 acceptance receipt — 2026-10-09

What **VERIFIED** means here: exercised against the live provider by a bounded, cached, re-runnable script,
with counts in a committed artifact. It does **not** mean the source is licensed for publication, stable, or
point-in-time for pregame use.

- **Results / schedule (VERIFIED for results):** 2016–25, 15,342 provider events → 14,988 played finals in
  the corpus. Historical kickoff *revisions* are not recoverable.
- **FBS/FCS by season (VERIFIED, reconciled):** FBS teams that played equal the official FBS size in all 10
  seasons. The provider's FBS group also carries 8–13 never-playing ids, dropped by reconciliation.
- **Conference by season (VERIFIED for ids):** the ESPN conference id is season-scoped (7 realignments
  checked). Conference names are unmapped.
- **Drives/plays (PARTIAL):** 10/10 FBS–FBS and 7/10 FCS–FCS sampled games carry drives. Not used in V1
  baselines.
- **Historical pregame rosters, QB starters, injuries, depth charts, weather forecasts (UNAVAILABLE):**
  excluded from V1 features.
- **Odds:** historical ESPN/CFBD lines have no capture time, so they are a benchmark only (ESPN numeric spread
  sign is unverified). Point-in-time history = The Odds API historical (PAID_DECISION, ~3,000 credits for
  2021–25).
- **CFBD (ACCESS_BLOCKED):** needs DP's own free key.

### NCAAF-001 — Phase checkpoint — 2026-10-09
- **Owner / branch / HEAD:** DP · `dp/ncaaf-v1` · the commit that adds this file (see `git log`).
- **Base main SHA:** `92dce6f0d4` (fast-forwarded from `2ba7dc13f9`; no merge conflicts; no reserved file
  touched).
- **Deliverables:** `app/src/lib/sports/ncaaf/{espn-events,corpus}.mjs` (+ tests);
  `app/scripts/ncaaf/{probe-espn-coverage,probe-espn-drives,build-corpus}.mjs`;
  `data/internal/research/ncaaf/capability/{espn-coverage-v1,espn-drive-sample-v1}.json`;
  `data/internal/research/ncaaf/corpus/v1/{games-2016…2025.jsonl,manifest.json}`;
  `docs/ncaaf/{STAGE_0_ARCHITECTURE_MAP,DATA_CAPABILITY_MATRIX,MODEL_EVALUATION_PROTOCOL}.md`.
- **Tests / commands (Node 20.4.0):** `npx tsx --test src/lib/sports/ncaaf/espn-events.test.mjs` 14/14;
  `… corpus.test.mjs` 10/10; mutation probe (scheduled "0" guard) red, then green after restore;
  `node scripts/ncaaf/build-corpus.mjs --now 2026-10-09T18:00:00Z --seasons 2016-2025 --check` gives
  "11 files reproduce byte-for-byte"; the coverage re-run from cache is hash-identical; `lint:scripts` clean.
- **Provider requests:** ESPN keyless, 178 (2021–25) + 174 (2016–20) scoreboard/membership + 20 summary + 6
  ad-hoc probes. Throttled at 300 ms. Raw bodies only under the gitignored `.cache/`.
- **Data windows / as-of:** corpus rows are post-game facts. The model cutoff is `slateDate < D`
  (America/New_York). No roster, injury, odds or weather inputs.
- **Invariants:** a scheduled "0" is not a score; forfeits (1-0) are not games; cross-division duplicates
  merge by id; disagreeing copies and same-day duplicate matchups are quarantined; team ids are
  `ncaaf-team-<ESPN id>` (no NFL collision).
- **Blockers:** none for local work. Decisions pending: CFBD key (DP), Odds API historical spend (founder),
  Open-Meteo commercial licence (founder), and the `.gitignore` "PUBLIC" comment vs the private repo (founder).
- **Approval needed?** NO for continuing locally.
- **Next authorized task:** NCAAF-002 implementation under the preregistered protocol.
- **Roadmap sync note:** NCAAF-001 → DONE (research, local), evidence above. Not yet pushed.
