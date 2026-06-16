# Dual Bank Builder — Run #2, Step 1 Failure Audit

_Settled June 16, 2026 from official sources only (API-Football fixtures for the World Cup leg;
MLB Stats API box scores for the hitter props). No screenshots, no unofficial feeds, no
assumptions. Run #1 ($100 → $10,376.17, 5–0) and UFC 250 are untouched._

## 1. Result — 0 / 2 lanes advanced, run closed

Dual Bank Builder Run #2 launched two independent $100 paper ladders ("lanes"), each a two-leg
parlay targeting ~$200 at Step 1. **Both lanes lost Step 1.** The run is closed; neither lane
advances. This is recorded transparently on `/bank-builder` and `/today` with per-leg official
results and a "What we learned" section.

| Lane | Leg | Market | Model read | Official result | Outcome | Source |
|---|---|---|---|---|---|---|
| **A** | Iran or Draw | WC double chance | win | Iran 2–2 New Zealand (FT) | **WON** | API-Football fixture (FT) |
| **A** | Troy Johnston Over 0.5 hits | MLB batter hits | Over | 0 hits (Final) | **LOST** | MLB Stats API gamePk 824666 |
| **B** | Mike Trout Under 1.5 hits | MLB batter hits | Under | 2 hits (Final) | **LOST** | MLB Stats API gamePk 825071 |
| **B** | Samad Taylor Over 0.5 hits | MLB batter hits | Over | DNP (no batting appearance) | **VOID** | MLB Stats API gamePk 823046 |

- **Lane A LOST:** the World Cup double chance hit (draw), but Troy Johnston recorded 0 hits, so the
  two-leg parlay failed on the hitter leg.
- **Lane B LOST:** Mike Trout went 2-for-the-day, busting a low Under 1.5; Samad Taylor was rested
  (DNP) so his leg voids — but the lane was already lost on the Trout leg regardless.
- **Run #2 Step 1 = 0 / 2.** A two-leg parlay is a coin-flip-ish proposition at these odds; two of
  them both broke against us on the player-prop legs.

## 2. What actually went wrong (per leg)

1. **Troy Johnston Over 0.5 hits (LOST).** A "get at least one hit" line looks high-probability, but
   a single MLB game is high variance — any hitter can go 0-for-4. There was no margin of safety: a
   single hitless game ends the parlay. High implied/model probability on one game does not make
   a single-game leg low-variance.
2. **Mike Trout Under 1.5 hits (LOST).** Betting a star hitter to be held under a low line is a bet
   *against* talent. Trout getting 2 hits is an ordinary outcome, not a fluke. The Under looked
   priced-attractive but the model under-weighted the player's quality and the thin cushion (exactly
   2 hits busts it).
3. **Samad Taylor Over 0.5 hits (VOID).** Taylor did not appear in the box score — a healthy scratch
   / bench day. The leg voids, but the deeper lesson stands: **a player prop is only as good as the
   confirmed lineup.** We selected the leg with no lineup confirmation, so it was exposed to DNP risk
   from the moment it was launched.
4. **Iran or Draw (WON).** The one leg that held was a low-variance *team* market (double chance),
   not a single-player prop. This is the signal: team-level markets with two-thirds outcome coverage
   are structurally more survivable than single-player hitter props.

## 3. Root-cause themes

- **Player-prop variance dominates.** Three of four legs were single-game MLB hitter props. Each is
  a one-sample event with no averaging; the model's season-level probability does not protect a
  single night.
- **DNP / lineup risk was unmanaged.** Taylor's void shows a structural hole: we launched a player
  prop with no confirmed-lineup gate.
- **Thin cushions on low lines.** "Over 0.5 hits" and "Under 1.5 hits" both bust on a single ordinary
  outcome. The lines had no buffer.
- **Two-leg parlay multiplies fragility.** Both lanes needed both legs to clear. One volatile leg
  per lane was enough to lose each lane.
- **Model probability alone is not an eligibility gate.** Each leg cleared our model threshold and
  still lost. Probability must be combined with a *survival* score that penalizes variance, DNP
  exposure, and against-talent bets.

## 4. Requirements for Bank Builder V2 (gate before any Run #3)

Do **not** launch another ladder until a V2 eligibility gate exists. V2 must compute a separate
**survival score** (distinct from raw model probability) with at least:

1. **Volatility penalty** — penalize single-game / single-player markets vs. multi-outcome team
   markets; favor double chance / draw-no-bet / moneyline on strong sides.
2. **Player-prop & DNP-risk penalty** — heavy penalty for any player prop without a *confirmed
   starting lineup*; hard block on player props when the lineup is unconfirmed at selection time.
3. **Market-type weighting** — weight team markets above player props; weight "minimal cushion"
   lines (Over 0.5 / Under 1.5) down vs. lines with buffer.
4. **Recent-form consistency** — require consistent recent form (not one hot/cold sample); penalize
   high game-to-game swing.
5. **Odds-band constraints** — constrain each leg to a sane price band; reject longshot legs and
   reject "too good to be true" overlays that usually carry hidden risk.
6. **Correlation controls** — avoid stacking correlated legs; ensure lane diversity (already
   partially enforced by independent lanes, but make it explicit).
7. **Minimum data-quality** — require a minimum data-quality tier; never include `limited`/
   market-implied-only legs in a Bank Builder lane.
8. **No against-talent low Unders on stars** — explicitly down-rank Unders on high-quality hitters
   (the Trout failure mode).
9. **Pure + unit-tested** — the survival score must be a pure function with unit tests, so eligibility
   is auditable and reproducible.

V2 acceptance: a leg is Bank-eligible only if it clears BOTH the existing model threshold AND the
survival score, AND (for player props) has a confirmed lineup. Lanes remain locked once launched.

## 5. Integrity notes

- Settlement was executed by `pipeline/daily/settle_dual_bank_builder.py`, which reads official
  endpoints live and writes results in place — no fabricated scores, hits, or odds.
- Samad Taylor's void was confirmed by the absence of a batting line in the official box score, not
  by a screenshot or a secondary feed.
- Run #1 (NBA Finals road to $10K, 5–0) and UFC 250 (6–1, cards 0–4) were not read or mutated by the
  settlement step; they live in separate artifacts.
