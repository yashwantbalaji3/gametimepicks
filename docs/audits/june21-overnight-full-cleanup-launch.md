# June 21 Overnight Full Cleanup + Launch — Audit

**Date/time:** Sunday June 21 2026, ~3:00 AM ET (07:00 UTC) — real clock has rolled into June 21.
**Branch:** `june21-overnight-full-cleanup-launch` (off `main` @ `58764089`)
**Trigger:** User reviewed the live site, found Mr. Dub portfolio inaccurate (believed it should be
above $10,000), wanted June 20 treated as a gap day, and a clean June 21 launch.

## Headline finding — the ledger bug (source of truth)

`build-mr-dub-ledger.mjs` iterated `priorLane.steps` **without a `settled` guard**, so a stopped
lane's `coming_soon` placeholder rungs (Lane B Steps 3-5, no `slateDate`) were each counted as a
−$100 loss. That triple-counted Lane B's single lost seed and produced 5 `lane_stopped` events
(three with `null` dates) → bankroll dragged to **$9,876.17** with a fake **8-5** record.

**Fix:** only count `status === "settled"` rungs in the priorLane loop (the current-lane loop already
had this guard). The user's instinct was correct.

### Corrected source-of-truth ledger

| event | result | bankroll Δ | record |
|---|---|---|---|
| Crown ladder (protected, 5 rungs) | 5-0 won | +$10,276.17 (on $100 seed) → **$10,376.17** | 5W |
| Lane A Step 1 (won, 6/18) | won, rides | $0 (unrealized) | +1W |
| Lane A Step 2 (won, 6/19) | won, rides ($601.56) | $0 (unrealized) | +1W |
| Lane B run 1: S1 won (6/17), S2 lost (6/18) | stopped | −$100 | +1W, +1L |
| Lane B restart: S1 lost (6/19) | stopped | −$100 | +1L |
| Lane B Steps 3-5 (coming_soon) | **placeholder — not counted** | $0 | — |
| June 20 Bank Builder / Moonshot | **gap day — no card placed** | $0 | — |

**Result:** bankroll **$10,176.17** · record **8-2-0-0** · open exposure **$0** · drawdown **$200**
(two real Lane B lost seeds) · ROI 100.76× · crown **$10,376.17** untouched.

| field | before | after | reason |
|---|---|---|---|
| currentBankroll | $9,876.17 | **$10,176.17** | 3 phantom −$100 stops removed |
| record | 8-5-0-0 | **8-2-0-0** | coming_soon rungs no longer counted as losses |
| drawdown | $500 | **$200** | two real Lane B stops only |
| openExposure | $0 | $0 | unchanged (no open card) |

## June 20 gap-day handling

June 20 had **no valid placed Bank Builder / Moonshot card** (the only "cards" were the invalid
future-slate Japan/Egypt/Belgium/Uruguay candidates, already removed in PR #549). Treated as a gap
day: no June 20 win/loss in the ledger, no exposure. June 20 World Cup **game results** remain real
and settled on the Results page (NED/SWE, GER/CIV, ECU/CW). No "corrections" banner needed — the
absence of June 20 BB slips is already the correct representation.

## Bank Builder / Moonshot final state

- **Lane A** — advanced (Steps 1+2 won), Step 3 **awaiting a clean June 21 card**. $601.56 rides, not
  counted as exposure. Gap-day reason shown.
- **Lane B** — stopped, **awaiting a clean June 21 restart** (candidate-only, no exposure).
- **Moonshot** — stopped, **awaiting a June 21 candidate** (candidate-only, no exposure).
- No future-slate contamination; protected crown untouched.

## June 21 data — honest limitation (blocked on API keys)

**No API keys are present locally** (`ODDS_API_KEY`, `THE_ODDS_API_KEY`, `API_FOOTBALL_KEY` all
unset; no `.env`). The cached odds-discovery stops at **June 19**, and June 20 projections are
`provider: odds_api, strengthSource: none` — i.e. **entirely odds-derived**. Therefore June 21
odds-backed content **cannot be generated without a live pull, and fabricating it is forbidden**:

| surface | June 21 state | reason |
|---|---|---|
| WC schedule / fixtures | ✅ shown (Tunisia/Japan, Spain/Saudi, Belgium/Iran, Uruguay/Cape Verde, NZ/Egypt) | from committed `schedule.json` |
| WC projections / game pages | ⛔ data pending | needs odds pull |
| World Cup Specials | ⛔ no eligible card / data pending | needs odds + lineups |
| Suggested parlays (WC/MLB/Mixed) | ⛔ data pending | needs odds |
| MLB board | ⛔ data pending | no June 21 board, needs odds |
| UFC | fail closed — data pending | no current slate |

**To unblock June 21 cards:** add `ODDS_API_KEY` + `API_FOOTBALL_KEY` (the GH Actions refresh is
dormant pending these secrets) and run the slate refresh. The site is otherwise coherent: it presents
June 20 as the latest **completed** slate (settled results) and points forward to June 21.

## Verification
- **1197/1197 tests pass** (4 ledger specs reconciled to $10,176.17 / 8-2; added
  `june21-ledger-reconciliation` guard: bankroll > $10k, exactly 2 real stops, no null-date stops,
  June 20 gap day not counted).
- `tsc --noEmit` clean · `next build` clean.
- Audits: no banned copy, no secrets, protected crown + results untouched.
- Browser QA desktop + mobile: Mr. Dub $10,176.17 / $0 exposure / 8-2; Bank Builder + Moonshot
  awaiting June 21; no future-slate teams in active/candidate cards; no console errors; no overflow.
