# GameTime Picks — July 21 Public Launch: Final Readiness

**Date:** 2026-07-21 (morning refresh, ~09:15 ET) · **Mode:** paper / review · **Official-money exposure:** $0

Everything in this document is paper-only and educational. No real money is placed. Official record, bankroll,
crown, and exposure are **unchanged** and md5-guarded (see [Exposure & money](#exposure--money-confirmation)).

---

## 1. Verdict — review-ready vs public-launch-ready

| Question | Verdict | Basis |
|---|---|---|
| **Review-ready tonight?** | **YES** | Every public route renders; the exact Bank Builder + Moonshot review cards show their legs on-page; money untouched; nothing forces a pick. |
| **Public-launch-ready (public-safe beta)?** | **YES, as an honest MLB-first beta** | MLB is the live sport, the 10,000-run player-prop simulation is real, market snapshots are market-anchored, World Cup is archived (no false "Live today"), products sit in review with $0. No hard blockers to a public-safe beta. |
| **Ready for real-money staking?** | **NO — and intentionally not authorized** | These are review cards, not placed bets. Going live for real money requires a **separate, explicit** founder money-exposure instruction. This build does not authorize it. |

**One-line summary for the founder:** The site is honest, current, and safe to show publicly as an MLB-first
paper simulator. It is *not* — and should not be presented as — a real-money betting product.

---

## 2. MLB coverage — July 21 (of 15 scheduled games)

Coverage is measured **after the morning refresh** (the overnight run picked up a 5th priced game, **ATH@AZ**).
Books post the rest of the market through the day. We never fabricate odds or simulations for unpriced games.

| Surface | Coverage | Games |
|---|---|---|
| Scheduled games | 15 | full slate |
| Team markets (de-vigged, market-anchored) | **5 / 15** | LAD@PHI, TB@TOR, BAL@BOS, SD@ATL, ATH@AZ |
| Player props ingested | **8+ / 15** (1,094 props) | more markets per game posted overnight |
| 10,000-run player-prop simulations | **5 / 15** | same 5 priced games (21 sim picks) |
| Game report detail pages | **15 / 15** | 5 with full sims, 10 "awaiting posted markets" |
| Positive model-vs-market picks | **20** | across the 5 simulated games |

The 10 unpriced games still render a report page — they honestly read **"awaiting posted markets"** rather than
showing invented numbers. Unpriced because the books have not yet posted their team-market / prop lines (they
post closer to first pitch); coverage widens automatically on the next refresh, never by fabrication.

### Morning re-evaluation of the active cards
Re-checked all three Step-1 review cards against the fresh 5-game simulation. **No card was mutated** — each is
already optimal or a lateral trade, and all six leg odds still match the fresh sim (no stale prices):
- **Moonshot** — the two strongest model-vs-market gaps are still Wheeler (+31 pt) and Gausman (+24 pt). Optimal; unchanged.
- **Bank Builder Lane A (survival)** — Suárez (67%) + Wrobleski (60%) remains the best two-anchor hit-probability pair. Unchanged.
- **Bank Builder Lane B (value)** — the new ATH@AZ game surfaced **Nolan Arenado · Total Bases Over 1.5 · +131 (model 58% vs market 43%, +15 pt gap, anchor)**. Swapping it in for Buehler would raise the weak leg's gap (2 pt → 15 pt) and price the card at ~+427 (still in the +200..+700 value band), but it also *lowers* combined survival by ~1 pt — a lateral edge-for-safety trade, not a clear improvement for a survivability-first value lane. **Proposed for founder approval; not auto-applied.** To adopt it, edit `app/scripts/refresh-review-cards-0721.mjs` Lane B legs to `[Willson Contreras TB o1.5, Nolan Arenado TB o1.5]` and re-run `--apply` (money-guarded).

---

## 3. Bank Builder — restarted from Step 1, both lanes ACTIVE (paper · review · $0)

Both lanes are **review cards**, not placed bets. All legs are MLB player props that settle deterministically from
the official MLB Stats API box score (strikeouts / total bases). Within each lane, the two legs are in
**independent games**.

### Lane A — survival, two anchors (combined **+306**)
| Leg | Market | Odds | Model vs market | Game |
|---|---|---|---|---|
| Ranger Suarez | Strikeouts **Over 5.5** | −109 | model **67%** vs market **52%** | BAL @ BOS |
| Justin Wrobleski | Strikeouts **Over 5.5** | +112 | model **60%** vs market **47%** | LAD @ PHI |

### Lane B — value band +200..+700, **ACTIVATED** (combined **+296**)
| Leg | Market | Odds | Model vs market | Game |
|---|---|---|---|---|
| Walker Buehler | Strikeouts **Over 3.5** | −136 | model **60%** vs market **58%** | SD @ ATL |
| Willson Contreras | Total Bases **Over 1.5** | +128 | model **67%** vs market **44%** | BAL @ BOS |

---

## 4. Moonshot — Step 1, higher-variance (paper · review · $0)

Combined **+278**. Both legs MLB pitcher strikeouts, deterministic MLB Stats API settlement, **independent games**.

| Leg | Market | Odds | Model vs market | Game |
|---|---|---|---|---|
| Zack Wheeler | Strikeouts **Over 6.5** | −122 | model **86%** vs market **55%** | LAD @ PHI |
| Kevin Gausman | Strikeouts **Over 5.5** | +108 | model **72%** vs market **48%** | TB @ TOR |

No World Cup legs, no settlement-pending props, no internal full-game model outputs appear in any product card.

---

## 5. Exposure & money confirmation

| Field | Value |
|---|---|
| Official record | **19-14** |
| Paper bankroll | **$19,065.40** |
| Crown (peak paper bankroll) | **$20,465.40** |
| Official-money exposure | **$0** |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` |

All product artifacts are md5-guarded so canonical money can never move as a side effect of a card change.
Nothing in tonight's build changed official money, bankroll, crown, record, or exposure.

---

## 6. What the 12-section MLB game report (V2.5) shows

Source: `app/src/components/game/mlb-simulation-report-v2.tsx`.

1. **Matchup header + status** — teams, first pitch, priced/awaiting status
2. **Simulation coverage** — whether this game has a full 10k sim or is awaiting posted markets
3. **10k player-prop result** — the 10,000-run simulation output for the props in this game
4. **Player-prop watchlist** — biggest model-vs-market gaps, labeled **"not a bet"**
5. **Model vs market** — model probability beside the market-implied probability, per prop
6. **Risk & correlation** — same-game legs are **not** independent; correlation is called out
7. **Settlement support** — deterministic box-score settlement (strikeouts / total bases)
8. **Market snapshot** — de-vigged team markets, market-anchored
9. **Full-game model status** — validating / not public
10. **Why no projected score or win probability** — the honest explanation
11. **Bank Builder / Moonshot eligibility** — whether legs in this game clear the product gates
12. **Methodology & data freshness** — how it's built and when it was last refreshed

**Deliberately NOT shown publicly:** projected final score, win probability, total-runs distribution, or margin
distribution.

---

## 7. Honest limitations (say these plainly)

- **Only 5 of 15 games are priced so far this morning.** The other 10 report pages read "awaiting posted markets."
  Full coverage and more eligible legs arrive as books post through the day (re-run the refresh nearer first pitch).
- **The internal MLB full-game model mirrors the market** (81-game backtest). The `pitcher-strength-v1` and
  `bullpen-fatigue-v1` features **failed** their backtest and are **not adopted**. The soccer rating engine
  **loses to the market**. All of this is internal-only under `data/internal/`, never web-served, never in any
  product. It is why there is no public projected score or win probability.
- **World Cup is complete → archive only.** The newest real WC slate with games is **2026-07-15**; the WC page
  freshness anchors to that archive date, so it never falsely reads "Live today."
- **Products are paper / review mode.** They activate as review cards only; there is no real-money exposure.

---

## 8. Remaining launch blockers

**Hard blockers to a public-safe beta: none.** The site is honest, current, and money-safe.

Open items are *cadence*, not blockers:

- Re-run the morning MLB refresh + 10k sims each day so more of the 15-game slate gets priced and covered.
- Keep **$0 official exposure** unless the founder gives a separate, explicit real-staking instruction.
- Keep the money md5 at `affe6b21` on every publish (forensic audit must read **MATHEMATICALLY PERFECT**).

See `docs/MLB_DAILY_OPERATING_PLAYBOOK.md` for the exact daily commands and gates.

---

## 9. Final morning verification (2026-07-21) — GO for public paper beta

Ran the full pre-launch pass this morning after fast-forwarding the overnight nightly-settle commits (money-clean):

- **Public paper beta:** ✅ **GO.**
- **Official-money launch:** ⛔ **NO-GO** (intentionally — requires a separate explicit founder instruction).
- **MLB coverage:** 5/15 team markets + 10k sims, 15/15 report pages, 20 positive picks (see §2).
- **Active cards:** unchanged (Lane A Suárez+Wrobleski +306 · Lane B Buehler+Contreras +296 · Moonshot Wheeler+Gausman +278); all odds match the fresh sim; Arenado proposed as a Lane B alternative (§2).
- **Gates:** tsc clean · full suite green · build exit 0 · forensic **MATHEMATICALLY PERFECT** · health **HEALTHY** · leak / fake-claim / product-eligibility scans clean · route smoke **12/12**.
- **Money md5:** `affe6b21071f2b3be96bb2774eb347c3` — unchanged before and after · record 19-14 · bankroll $19,065.40 · crown $20,465.40 · exposure $0.
