# NCAAF-007 — Market families: research matrix (v1, 2026-10-09)

PRIVATE_RESEARCH. **No family is eligible for any product.** States use the platform vocabulary
(`docs/ENGINEERING_START_HERE.md` §4): `SHADOW`, `UNEVALUATED`, `UNSUPPORTED`. Product eligibility is a separate
founder decision that this document does not make.

| Family | Model source | Market source (point-in-time) | Evidence so far | State | What would change it |
|---|---|---|---|---|---|
| Winner (moneyline) | C1 Elo P(home) | ESPN-relayed DraftKings moneyline, **captured by us before kickoff** (forward receipts, from 2026 week 6) | Backtest: C1 beats home-field-only by 0.11 nats/game on 2024–25 but **fails calibration bar (b)**. No historical timestamped prices, so no model-vs-market test exists yet. | **SHADOW** | Forward receipts graded vs de-vigged captured moneylines (NCAAF-006 records `devigLogLoss` per game), plus a preregistered model-vs-market bar and enough weeks |
| Game total (over/under) | C2 mean / W1 world totals | Captured total line (forward) | W1 totals track actual distributions band by band (bias +0.04, 80% coverage 0.824 on 2024–25). Never compared to a market line. | **SHADOW** | As above: forward over/under results vs captured lines, with pushes, before any eligibility talk |
| Point spread | W1 world margins | Captured spread with verified home sign | **W1 under-produces margins of exactly 3 and 7 by ~40–45%**, so cover/push probabilities near key numbers would be wrong. | **UNSUPPORTED** | A world engine that reproduces key-number structure (W2 joint analog worlds, NCAAF-004 H4), then forward cover evaluation |
| Team total | C2 team means | None captured: the ESPN scoreboard carries no team totals | — | **UNSUPPORTED** | A priced, timestamped team-total source |
| Player props (any) | none | none | No point-in-time participation, roles or injuries (Stage 1 matrix) | **UNSUPPORTED** | All of 007.7: as-of roles/participation, opportunity conservation, priced markets, forward evaluation |
| Same-game parlays / Parlay Lab legs | — | — | Requires qualified families + joint worlds | **UNSUPPORTED** | Later gated stage only |

## Line semantics already enforced (forward receipts)

- `homeSpread` uses the home convention (< 0 = home favoured). It is filled only when the provider text names a
  team **and** agrees with the numeric field, and is otherwise `null` with a reason. Week 6: 50/51 verified.
  `AF -7` vs team abbreviation `AFA` was withheld rather than guessed.
- Pushes are explicit in grading (`PUSH` for a margin or total exactly on the line). A missing market is
  `null`, never −110.
- **Improvement for the next capture code:** identify the favourite by the odds item's team id / favourite
  flag rather than the text abbreviation, keeping the text as a cross-check. That would have verified the
  Air Force line.

## Rights

ESPN-relayed DraftKings odds have no public-display authorization in `source-registry.mjs`. They stay inside
private receipts. Public display or comparison needs a source-registry decision (founder; see the Stage 1 Odds
API option).
