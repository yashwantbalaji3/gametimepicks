# Program 181 — exact resume state

**Written** 2026-08-14 09:35 ET / 13:35 UTC · **Tip** `8c287309e` (= `origin/main`)
**Classification** `MATERIAL_PROGRESS`. Releases C–I remain; UFC 330 unstarted.
**Friday kickoff T+9.4h** (DEN@ATL, TB@NYJ, MIA@WSH at 23:00Z) · Saturday's seven from T+27.4h.

---

## Shipped

| Release | What | Commit |
|---|---|---|
| A | Promotion contract frozen **in its own commit**, before any model existed | `1cb0ec80f` |
| B | Six-candidate bake-off → **REJECTED_WITH_EVIDENCE**; public rejection notice on `/nfl` | `8c287309e` |

### The result

Best candidate `hier_offdef_k20`: margin MAE improved **0.11** points where **0.50** was required,
and totals **degraded** (10.41 vs 9.46). Two bars failed; coverage, calibration, minimum-n and
**every direction test passed** — which is what makes the rejection meaningful rather than a sign of
a broken build.

**Third independent confirmation** that preseason team strength does not predict preseason margin
(P172 bars, P178 t = −0.575, P181 bake-off). The ungated Elo scores **worse than no team term at
all** (10.86 vs 10.76).

---

## Next session

1. **STOP re-litigating the team model.** Three tests agree. The remaining lever is not another
   team-strength fit — it is a **different corpus** (play-by-play/drive data, which does not exist
   here) or a **different sport-phase** (regular season, where the signal may actually be present).
   Anything else is a fourth attempt at a settled question.
2. **Release C · participation intelligence** for all 10 weekend events. Closed vocabulary; missing
   evidence is `UNKNOWN`, never zero snaps or a full game. This is genuinely unbuilt and does not
   depend on the team model.
3. **Release D/E · joint player engine.** ⚠️ The provider offers **no** NFL player market this
   window (probed, `offeredMarkets: []`) — supported families land at `MODEL_ONLY_NO_MARKET` at best.
4. **Release F · Market Center adapter** — the one unresolved parity row. Needs
   `team-markets/<date>.json`, `boards/<date>.json`, `full-game-simulations/<date>.json` under
   `app/public/data/nfl` in the loader's shape, `NFL_MARKET_CONFIG` with `model.kind: "NONE"`, and
   `sport` threaded through four call sites in `app/src/app/markets/page.tsx`.
5. **Release G · run the products** to current ACTIVE/NO_PLAY/REFUSED receipts; **MLB Fri–Sun**
   (the `/simulate` MLB board is still an older slate).
6. **Release H · settlement** — Friday settles Saturday via the 14:30Z pass. ⚠️ crons drift 1–1.5h.
7. **UFC 330** — unstarted. ⚠️ P171 odds authorization is **NFL-only**.

---

## Must not regress

- BASELINE_ONLY on all 10 NFL games; zero green ready badges; every forecast carries the P178 gate.
- Parity ledger **1 unresolved**; `parity-closure-truth.test.mjs` blocks completion language.
- Aug-13 audit immutable; the six games are a **locked forward cohort** and may not fit any model.
- Credits 18 / 3,000, no paid call in P178–P181.
- Suite 4372 pass / 0 fail / 4 skipped · a11y 177 on three engines · protected money byte-identical.

## Contract-design lessons worth reusing

Freeze bars in their **own commit** and record the contract's **sha256** in the report. Make the
evaluator **refuse to run** without one. Make the coverage bar a **BAND, not a floor** — otherwise
widening a constant until misses vanish passes the very bar meant to stop it. Ship a **corruption
suite** proving each bar can reject. Score the **rejected** baselines too. And **name what you
built** — a drive model cannot be fitted to a corpus with no drives.
