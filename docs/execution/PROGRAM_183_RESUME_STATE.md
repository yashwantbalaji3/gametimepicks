# Program 183 — exact resume state

**Written** 2026-08-14 11:05 ET / 15:05 UTC · **Tip** `2f9a863ec` (= `origin/main`)
**Classification** `MATERIAL_PROGRESS`. Releases B and E closed; C, D, F, G, H remain.
**Friday kickoff T+7.9h** — the three Friday games are lock-safe.

---

## Shipped this session

| Release | What | Commit |
|---|---|---|
| B (contract) | Per-family evaluation contract frozen **in its own commit** | `74ee11719` |
| B (engine) | Four families evaluated walk-forward → **all four REJECTED** | `8035df872` |
| E | All four product lanes RAN → **NO_PLAY with counted rejection doors** | `e48def4f8` |
| — | NFL ledger records the refused 401 preflight; MLB race noted | `2f9a863ec` |

### Player families — all rejected
passing (n=497) Δ0.11 need 1.00, **coverage 0.515** · rushing (n=1,232) Δ0.16 need 0.75 ·
receiving (n=2,490) **worse than baseline** · touchdowns (n=1,553) Brier 0.1082 vs 0.1055.
**Preseason playing time is coaching rotation, not usage history.** No per-player projection ships.

### Product receipts — NO_PLAY, over-determined
Bank Builder / Moonshot / Card builder: 10 candidates each, all `NOT_VALIDATED_MODEL`.
End Zone Vault: 120 candidates, all `NO_PRICED_MARKET` (also blocked by `NO_VALIDATED_FAMILY`).
Every door counted; the builder exits non-zero if the taxonomy does not account for the whole pool.

---

## Two environment gates hit — both behaved correctly

1. **Release C price refresh REFUSED.** Dry-run planned 8 worst-case credits (18/3,000 used); the
   free `/sports` preflight returned **401** — the local key is invalid. The script refused before
   any paid call and did not blind-retry. **CI holds the working secret**; its 15:00Z pass covers it.
   The refusal is recorded in the P171 ledger with `creditsUsed: 0`.
2. **MLB board rolled ahead of its simulations.** The morning-projections bot wrote the 08-14 board
   while `game-simulations/`, `full-game-simulations/` and `predictions/` were still on 08-13 — six
   guards went red because every MLB game resolved `game_not_in_artifact`. I regenerated them; while
   I did, `mlb-daily-production` landed the same three artifacts and **CI correctly won the rebase**
   (it owns those paths). Suite is now 4396/0.

⚠️ **Lesson worth keeping:** "my artifacts vanished in a rebase" and "CI correctly won a race it
owns" look identical in a diff. Resolve `--ours` toward the authoritative writer and say so in the
commit.

---

## Next, in order

1. **Release C · confirm the 15:00Z capture landed** — Saturday's seven games still had no price at
   last check. Verify before assuming.
2. **Release D · Market Center adapter** — the one unresolved parity row. Needs
   `team-markets/<date>.json`, `boards/<date>.json`, `full-game-simulations/<date>.json` under
   `app/public/data/nfl` in the loader's shape, `NFL_MARKET_CONFIG` with `model.kind: "NONE"`, and
   `sport` threaded through four call sites in `app/src/app/markets/page.tsx`.
3. **Release F · public locks + admin.** **Release G · settlement** on the 14:30Z cadence.
4. **Release H · drive/play-by-play corpus** — the only path to a future team challenger.
   ⚠️ Do not run another score-only or usage-history variant. **Three tracks rejected in a row.**
5. **UFC 330** — unstarted. ⚠️ P171 authorization is **NFL-only**.

---

## Immutable

Team `BASELINE_ONLY` + P181 rejection + contract `1cb0ec80f` · player-family rejections + contract
`74ee11719` · Aug-13 audit · participation artifacts (60/60 reconciled) · parity ledger **1
unresolved** · credits **18/3,000** · protected money byte-identical.

**Suite 4396 pass / 0 fail / 4 skipped · a11y 177 on three engines · production `c8867740` serving
every new surface.**
