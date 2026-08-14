# Program 179 — exact resume state

**Written** 2026-08-14 02:35 ET / 06:35 UTC · **Tip** `f731b12ff` (= `origin/main`)
**Classification** `MATERIAL_PROGRESS`. Releases A1–A3, B, C, D, E, F and all UFC releases remain.
Do **not** claim `NFL_CAPABILITY_PARITY_COMPLETE_MODEL_EXPERIMENTAL`.

**Countdowns at write time:** NFL Friday kickoff T+16.4h · NFL Saturday first T+34.4h ·
UFC 330 early prelims T+38.4h · UFC 330 main card T+42.4h.

---

## Shipped this session

**Release A0 — the P0 the founder screenshotted** (`f731b12ff`).

Ten current NFL games rendered 19-18 inside a 1.7pp win spread while every card carried the green
SIMULATION READY badge. Corrected by separating two states that had been conflated:

- `ARTIFACT_READY` — a committed, deterministic, reproducible artifact exists.
- `SIMULATION_READY` — …**and** event-specific inputs measurably move its distribution.

Readiness is read from each forecast's own `teamSignal` block (written by the P178 significance
gate), so the badge cannot drift from the engine. `/simulate` now reads **Today 19 games · 9 ready ·
NFL 10 games · MLB 9 games · 9 ready**; zero NFL cards carry the green badge, ten carry
**BASELINE ONLY**, and each leads with the range ("Total likely 23–52") rather than a rounded
scoreline. Each game report states its readiness *before* any number.

Guards in `src/lib/sports/nfl/readiness-badge.test.mjs` — written failing first, 4 of 7 failed
against the shipped state — also pin the **forbidden** repair: no jitter, no team-name hashing, no
seed churn, no market-implied score injection.

---

## Next session — exact order

1. **A1–A3 · the possession/drive engine.** This is the real fix behind A0's honest label. Build a
   football-native drive simulator (possessions, pace, pass/rush mix, efficiency, TD/FG/turnover/
   empty outcomes) with hierarchical, regularized offense/defense/ST strength shrunk to the
   preseason mean. Time-ordered train/validation/test from the committed corpus. Compare at minimum:
   league shared prior; home-only prior; existing Elo model; possession without participation;
   possession with participation. **Predeclare the promotion bars before loading the data.** If no
   candidate clears them, `BASELINE_ONLY` stays — that is an acceptable outcome, and A0 already
   makes it presentable.
   ⚠️ Keep the P178 significance gate. Do **not** flip the old coefficient positive or bypass it.
2. **A2 · participation artifact** for all 10 weekend events. Closed vocabulary
   (`CONFIRMED_OUT`/`EXPECTED_STARTER`/`EXPECTED_ROTATION`/`LIMITED`/`AVAILABLE_ROLE_UNCERTAIN`/
   `DEPTH_ONLY`/`UNKNOWN`); missing evidence is `UNKNOWN`, never zero snaps or a full game. Preseason
   QB rotations modelled explicitly. Today every player is `ROLE_UNCERTAIN` with no authorized
   actives source — that refusal is already honest, the *usage distribution* is the missing work.
3. **B · joint player engine.** Blocked on A2. ⚠️ The provider offers **no** NFL player market in
   this window (probed, `offeredMarkets: []`), so supported families land at
   `MODEL_ONLY_NO_MARKET` at best — do not let that read as a gap.
4. **C · Market Center adapter** — the one unresolved parity row. Needs `team-markets/<date>.json`,
   `boards/<date>.json`, `full-game-simulations/<date>.json` under `app/public/data/nfl` in the
   loader's own shape, `NFL_MARKET_CONFIG` with `model.kind: "NONE"`, and `sport` threaded through
   four call sites in `app/src/app/markets/page.tsx`. Precondition already fixed in P178.
5. **D · run the products** to current ACTIVE/NO_PLAY/REFUSED receipts. The NFL side already
   refuses provably; the MLB-side runs are the missing half.
6. **MLB Fri–Sun** — the `/simulate` MLB board is still the Aug-13 slate.
7. **E · settlement** — Friday settles Saturday, Saturday settles Sunday, via the 14:30Z pass.
   ⚠️ GitHub crons drift 1–1.5h here; wait, do not dispatch.
8. **UFC 330** (U1–U4) — not started. Charter gates it behind NFL A–D. ⚠️ The P171 odds
   authorization is **NFL-only**; no paid UFC call may be made under it.

---

## State that must not regress

- Parity ledger: **1 unresolved** (Market Center). `parity-closure-truth.test.mjs` fails the suite
  if completion language coexists with it.
- Significance gate: team term zeroed, `t = -0.5746`, CI spans zero. Correlation between strength
  and published win probability is −0.2285 (was −0.9726).
- Settlement: 7 forecasts settled; model Brier **worse** than the market in both batches.
- Credits: 18 / 3,000. No paid call in P178 or P179.
- Suite 4353 pass / 0 fail / 4 skipped · a11y 177 on three engines · protected money byte-identical.

## Traps (now five)

Comment-scanning guards have flagged their own rationale **four separate times**. Always strip
comments before scanning source. And: spread is not signal; a file existing is not a prediction;
`counts.settled` is window-scoped not lifetime; never `npm run build` while a dev preview runs.
