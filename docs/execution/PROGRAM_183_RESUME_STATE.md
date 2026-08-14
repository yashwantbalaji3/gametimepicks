# Program 183 — exact resume state

**Written** 2026-08-14 10:35 ET / 14:35 UTC · **Tip** `8035df872` (= `origin/main`)
**Classification** `MATERIAL_PROGRESS`. Release B closed on evidence; C–H remain.
**Friday kickoff T+8.4h** — the three Friday games are lock-safe: participation artifacts, frozen
forecasts and BASELINE_ONLY labelling are all live and published.

---

## Shipped

| Release | What | Commit |
|---|---|---|
| B (contract) | Per-family evaluation contract frozen **in its own commit** | `74ee11719` |
| B (engine) | Four families evaluated walk-forward → **all four REJECTED**; public table on `/nfl` | `8035df872` |

### The finding

| family | n | result | verdict |
|---|---|---|---|
| passing | 497 | MAE 6.22 vs 6.33 (Δ0.11, need 1.00) · coverage **0.515** | REJECTED |
| rushing | 1,232 | MAE 2.52 vs 2.68 (Δ0.16, need 0.75) · coverage 0.770 | REJECTED |
| receiving | 2,490 | MAE 1.2352 vs 1.2309 — **worse** than baseline | REJECTED |
| touchdowns | 1,553 | Brier 0.1082 vs 0.1055 — worse than the league rate | REJECTED |

**In preseason, playing time is decided by coaching rotation on the night, not by usage history.**
A player's own history could not beat "what a player of this usage level normally does".

**Two different failures, kept separate:** passing failed on *both* the projection and its ranges;
rushing's ranges were honest and only its projection was unhelpful. A guard pins the contrast.

**Consequence: no per-player projection ships.** A guard asserts no public per-player artifact
exists and the summary carries no player rows.

---

## Next, in order

1. **Release C · market availability + price acquisition.** ⚠️ The provider reports
   `offeredMarkets: []` for NFL player props — confirm live before spending, then capture team
   markets only. 18/3,000 credits used.
2. **Release D · Market Center adapter** — the one unresolved parity row. Needs
   `team-markets/<date>.json`, `boards/<date>.json`, `full-game-simulations/<date>.json` under
   `app/public/data/nfl` in the loader's shape, `NFL_MARKET_CONFIG` with `model.kind: "NONE"`, and
   `sport` threaded through four call sites in `app/src/app/markets/page.tsx`.
3. **Release E · products** to current ACTIVE/NO_PLAY/REFUSED receipts. ⚠️ Nothing NFL may enter a
   product: team model BASELINE_ONLY, all player families rejected, no prices for players.
   The honest receipt is NO_PLAY with counts by reason.
4. **Release F · public reports, locks, admin.** **Release G · settlement** on the 14:30Z cadence.
5. **Release H · drive-data corpus, MLB continuity, UFC 330.** ⚠️ MLB `/simulate` board is an older
   slate. ⚠️ P171 odds authorization is **NFL-only**.

---

## Immutable — do not revisit

- Team model: `BASELINE_ONLY` champion; P181 challenger `REJECTED_WITH_EVIDENCE`; contract
  `1cb0ec80f` and its sha256.
- Player families: all four rejected; contract `74ee11719` and its sha256.
- Aug-13 audit; the six games are a locked forward cohort.
- Participation: 10 events, 60/60 mass reconciliation, confident states structurally unreachable.
- Parity ledger **1 unresolved**; `parity-closure-truth.test.mjs` blocks completion language.
- Suite 4388 pass / 0 fail / 4 skipped · a11y 177 · protected money byte-identical.

## The pattern worth noticing

Three consecutive evidence tracks — team strength (P181), and now four player families (P183) —
have all returned **rejected**, each against bars frozen in a prior commit. That is not a run of bad
luck; it is a consistent measurement that **preseason football is close to unpredictable from
historical box scores**. The next honest lever is a different corpus (drive/play-by-play) or a
different phase (regular season), not a fifth variant of the same idea.
