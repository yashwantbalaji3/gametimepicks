# Bank Builder — NBA Finals Active-Slip Override Policy (2026-06-10)

## Decision (updated — now the TRACKED active slip)
For NBA Finals Game 4, today's **active tracked Builder Slip** is a user-approved
**NBA Finals same-game card**, replacing the MLB candidate for **today's pending
rung only**. This is a pre-tip, user-approved event override — **not** a retroactive
result edit. The June 9 settled win and all settled history are unchanged.

## Honesty + audit guarantees
- **Settled ledger untouched.** The ledger (`build-bank-builder-ledger.mjs`) is
  settled-only; June 9's win and the bankroll progression to ~$211.85 are unchanged.
- **MLB candidate superseded, not deleted.** The original MLB Daily Builder Pick is
  still computed (`selectPlus100BuilderSlip`) and shown on `/bank-builder` in a
  collapsed "superseded by the NBA Finals event slip" details block.
- **Audit artifact** `app/public/data/bank-builder/active-builder-slip-2026-06-10.json`
  records the override with: date, sport=NBA, event, status=pending, paperStake (exact
  current bankroll), combined odds, projected return/profit, full legs, and
  `replacement { previousCandidateSport: MLB, replacementReason:
  user_approved_nba_finals_feature, replacementTimestamp, noResultOverride: true }`.
- **No result implied** before the game finishes (status pending).

## Selection (deterministic, real data)
`selectFeaturedFinalsCard()` over the real NBA leg pool: a 2-leg same-game card,
combined odds +150…+400, **both legs Medium+ model confidence**, highest leg score.
Stake = exact current ladder bankroll; projected return = stake × combined decimal;
projected profit = return − stake.

## Tonight's selection (2026-06-10)
**Stephon Castle REB Over 4.5 (−130, High) + OG Anunoby PRA Over 23.5 (−106, High)**
· combined **+244** (3.44×) · paper stake **$211.85** → projected **$728.76**
(profit +$516.91). Auto-updates with the leg pool.

## Guardrails honored
No fabricated odds/legs/results; combined odds = exact product of decimals. No "lock /
safe / guaranteed / sure thing / free money / risk-free / can't miss" copy. Correlation
note states the legs share one game. Paper only; not betting advice.
