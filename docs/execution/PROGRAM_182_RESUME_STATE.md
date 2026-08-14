# Program 182 — exact resume state

**Written** 2026-08-14 09:55 ET / 13:55 UTC · **Tip** `445700c88` (= `origin/main`)
**Classification** `MATERIAL_PROGRESS`. Release A shipped; B–H remain.
**Friday kickoff T+9.1h** · Saturday's seven from T+27.1h.

---

## Shipped

**Release A — participation intelligence** (`445700c88`). All ten weekend events have versioned,
cutoff-safe artifacts at `data/internal/nfl/participation/<date>/<eventId>.json`, plus a public
summary on `/nfl`.

- **The preseason trap is closed by construction.** Regular-season shares are widened by a
  documented rotation factor (QB p10/p50/p90 = 0.05/0.20/0.55 of a full workload). Penix publishes
  0.032/0.128/0.352, never his 0.64 regular-season basis.
- **60 team-markets reconcile, 0 failures.** Named median mass + unallocated = exactly 1. Atlanta's
  listed passers hold 12.8%; the other 87.2% is published as unallocated.
- **`CONFIRMED_OUT` / `EXPECTED_STARTER` / `EXPECTED_ROTATION` / `LIMITED` are unreachable** — no
  registered actives source. Listed by name in `participation-states.mjs` so the absence is a
  documented refusal, not an accident.

---

## Next, in order

1. **Release B · joint player engine.** Now unblocked — participation distributions exist. ⚠️ The
   provider offers **no** NFL player market this window (probed, `offeredMarkets: []`), so every
   supported family lands at `MODEL_ONLY_NO_MARKET` at best. That is a state, not a gap.
2. **Release C · prices + Market Center adapter** — the one unresolved parity row. Needs
   `team-markets/<date>.json`, `boards/<date>.json`, `full-game-simulations/<date>.json` under
   `app/public/data/nfl` in the loader's shape, `NFL_MARKET_CONFIG` with `model.kind: "NONE"`, and
   `sport` threaded through four call sites in `app/src/app/markets/page.tsx`.
3. **Release D · products** to current ACTIVE/NO_PLAY/REFUSED receipts (NFL side already refuses
   provably; MLB-side runs are the missing half).
4. **Release E · public UX, locks, admin.** **Release G · settlement** on the 14:30Z cadence.
   **Release H · MLB weekend** — the `/simulate` MLB board is still an older slate.
5. **Release F · drive/play-by-play corpus track.** The ONLY path that can justify a future team
   challenger. ⚠️ Do not run a fourth score-only variant.
6. **UFC 330** — unstarted. ⚠️ P171 odds authorization is **NFL-only**.

---

## Must not regress

- BASELINE_ONLY on all 10 NFL games; zero green ready badges; every forecast carries the P178 gate.
- The frozen promotion contract (`1cb0ec80f`), its sha256, the bake-off verdict, and the Aug-13
  audit are all immutable. Disappointment is not a defect.
- Parity ledger **1 unresolved**; `parity-closure-truth.test.mjs` blocks completion language.
- Credits 18 / 3,000; no paid call in P178–P182.
- Suite 4380 pass / 0 fail / 4 skipped · a11y 177 on three engines · protected money byte-identical.

## The denial trap — five occurrences

A banned-phrase guard has now flagged its own denial **five times** (`beat the market`, a removed
sentence quoted in a correction, a date literal in an incident comment, a `Date.now()` in a
rationale, and `"will play"` inside "We do not know who will play"). **Always check the words
immediately before, or strip comments first.** Forbidding the phrase outright teaches the next
author to delete the honesty.
