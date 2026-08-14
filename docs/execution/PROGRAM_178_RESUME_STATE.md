# Program 178 — exact resume state

**Written** 2026-08-14 01:25 ET / 05:25 UTC · **Tip** `2bfb0e70d` (= `origin/main`)
**Classification so far** `MATERIAL_PROGRESS` — Releases A, B, C and H(partial) shipped.
Do **not** call this NFL parity complete. Releases D, E, F, G, I, J, K remain.

---

## What shipped, with commits

| | Release | Commit |
|---|---|---|
| Phase 0 | False-closure withdrawal + guard | `d12bde0c2` |
| A | NFL first-class on `/simulate`, one eligible-event set | `82d57dfd0` |
| B | All 10 remaining weekend NFL games simulated | `0da1a5fae` |
| H (part) | First 7 NFL forecasts settled against official finals | `0da1a5fae` |
| C | Significance gate — the model was leaning against the better team | `2bfb0e70d` |

---

## The two findings that matter

**1. P177's "11 OPEN → 0" was false closure.** ADAPTER_NEEDED is open work. The ledger now
publishes one `unresolved` count (currently **1** — Market Center sport support) and classifies
itself `MATERIAL_PROGRESS`. `src/lib/audits/parity-closure-truth.test.mjs` fails the suite if
completion language coexists with an unresolved row, or if a status appears that is classified
neither resolved nor unresolved.

**2. The margin head was inverted.** Correlation between the home side's Elo advantage and its
published win probability was **−0.9726** — the model favoured the weaker team on every game.
Cause: a fitted coefficient of −0.017442 whose 95% interval is [−0.0777, +0.0428], i.e. **t =
−0.575, indistinguishable from zero**. Fixed with a significance gate (|t| ≥ 2, bar declared before
the statistic). Correlation is now −0.2285; the spread collapsed from 5.2pp to 1.7pp.

**Consequence for the reader:** both model heads are now declared shared priors
(`NO_EVENT_SPECIFIC_SIGNAL`). `/nfl` says so plainly, including that an earlier version was
favouring the weaker side.

---

## Current live state

- **NFL weekend**: 10 pre-start artifacts — Fri DEN@ATL, TB@NYJ, MIA@WSH; Sat CAR@BUF, CLE@CHI,
  MIN@NYG, LAR@KC, JAX@NO, PHI@BAL, DAL@SEA. No Sunday game exists; none was invented.
- **`/simulate`**: 19 games · 19 ready (10 NFL + 9 MLB); card, chip, list and hero all reconcile.
- **Settlement**: 7 forecasts settled. Aug-13 batch — winner 3/5, marginMAE 10, totalMAE 5.17,
  80% coverage 0.667, Brier 0.2401 vs market 0.2237. Aug-14 (TEN@SF) — winner 1/1, Brier 0.1891 vs
  market 0.1012. **The model's Brier is worse than the market's in both.**
- **Credits**: 18 / 3,000 spent. No paid call made in P178.
- **Suite** 4344 pass / 0 fail / 4 skipped · typecheck clean · build clean · a11y **177** on three
  engines (`/simulate` and `/nfl/game/[eventId]` both joined the matrix this program).
- **Protected money**: byte-identical, asserted in-suite.

---

## Next session — start here

1. **Release D — participation intelligence.** All 10 weekend events need versioned player-role
   evidence. Today every player is `ROLE_UNCERTAIN` because no authorized actives source exists;
   `build-nfl-role-evidence.mjs` already states that honestly. The work is the coherent usage
   distribution (dropbacks, attempts, targets reconciling within each draw), not new prose.
2. **Release E — joint player-prop engine.** Blocked on D. Note the provider offers **no** NFL
   player market in this window (probed, `offeredMarkets: []`), so every family will be
   `MODEL_ONLY_NO_MARKET` at best — do not let that read as a gap.
3. **Release F — Market Center adapter** (the one unresolved ledger row). Needs four artifacts in
   the loader's own shape under `app/public/data/nfl`: `team-markets/<date>.json`,
   `boards/<date>.json`, `full-game-simulations/<date>.json`, plus `NFL_MARKET_CONFIG` with
   `model.kind: "NONE"`, and `sport` threaded through four call sites in `app/src/app/markets/page.tsx`.
   The precondition defect is already fixed (`latestMarketDate` no longer demands a player-props
   artifact from a sport with zero player families — that was a live NBA bug).
4. **Release G — run the products.** Bank Builder / Moonshot / Vault must each publish a current
   ACTIVE / NO_PLAY / REFUSED receipt. The NFL side already refuses correctly and provably
   (`product-eligibility.json`); MLB-side runs are the missing half.
5. **Release B2 — MLB Friday–Sunday.** The MLB board on `/simulate` is still the Aug-13 slate. Run
   the existing MLB production owner for Aug 14–16; do **not** fork the generator.
6. **Release H — remainder.** Friday's games settle Saturday; Saturday's settle Sunday. The
   event-window workflow's 14:30Z pass does this. GitHub crons drift 1–1.5h here — wait, don't
   dispatch.

---

## Traps this session hit (do not re-learn)

- **Date-pinned tests rot.** Six failed at once when Thursday's games went final and left the
  forward-looking capture. Always derive: the ET day of the earliest scheduled kickoff, the first
  scheduled event and its own two teams, an instant relative to a real kickoff.
- **A guard that punishes its own rationale.** Three separate guards flagged a comment explaining
  why the forbidden thing is forbidden. Strip comments before scanning source.
- **A blocker clearing is the system working.** `first-settlement: NOT_YET_OBSERVABLE` failed
  because settlement happened. Tie such guards to evidence, not to a snapshot.
- **`counts.settled` is window-scoped**, not lifetime. They diverge the morning after a slate settles.
- **Never run `next build` while a dev preview is running** — the shared `.next` leaves the preview
  serving a blank page.
- **Spread is not signal.** Ten distinct win probabilities looked like differentiation and were ten
  draws around one mean. Classify from the gate, never from the observed variation.
