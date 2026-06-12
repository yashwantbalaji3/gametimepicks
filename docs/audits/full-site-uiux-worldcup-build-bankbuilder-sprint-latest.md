# UI/UX + WC props + Build + Bank Builder Step 4 sprint — 2026-06-12 (afternoon)

Baseline (verified pre-work): $1,423.64 / Step 4 / 3–0; June-11 settled; June-12 WC 2
matches / 215 player props (post props-fix), MLB 15 games / 708 leans, mixed 5.

## Headline: OFFICIAL STEP 4 CANDIDATE PUBLISHED (pending)

The board leans carry verifiable model probabilities (modelProbOver/Under) — re-opening
the mixed review the pool artifact couldn't support. Published card
(`official-step4-candidate.json`, presentation-only; ledger/bankroll/nextPick untouched):

| Leg | Odds | Book | Model | Market |
|---|---|---|---|---|
| United States or Paraguay (DC, 90′) — USA vs Paraguay tonight | −290 | fanduel | 73.3% | 69.8% |
| Luinder Avila Strikeouts UNDER 3.5 — HOU@KC tonight (probable starter) | −112 | draftkings | 69.2% | 52.8% |

**+155 · $1,423.64 → $3,623.97 (+$2,200.33) · clears the $3,500 floor · combined model
50.7%** (vs 45% on the settled Step-3 hit). Cross-sport zero correlation; the MLB leg is
a probables-based PITCHER prop (no midday lineup risk) on the settled-positive K-Under
side (51.1% all-time vs K-Over 44.7%); recent K log: 2,1,2,1… unders-trending; riskFlags
[]; |edge| 16.3 ≤ 20. Owner-approval basis: this sprint explicitly opened mixed WC+MLB +
higher odds. Loader gates re-validate at read time (pending-only, step must equal current
public step, date must be today's ET slate, model ≥55%/market ≥50% per leg) — the card
can never resurface stale or post-settlement. Exact math + non-mutation locked by 3 new
tests.

## UX shipped
- **Fixture props explorer** (client): "Top picks" default (strongest model edges,
  recommended side only), market tabs with counts, team filter, player search — replaces
  the 100-row wall on WC fixture pages; same explorer adopted on the /mlb hub props tab.
- **Last-5 drawer**: every player-prop row expands (server-safe `<details>`) to the REAL
  last-5 game log from the artifacts (MLB `recentGames` — green/red vs the picked side,
  official box-score values) + model-projects line + edge; honest "log unavailable" state
  when absent (WC props carry no per-game logs — never invented).
- **Games-first hubs**: /mlb, /nba, /world-cup now open on the Games tab (the simple
  click-sport → see-games → click-game flow the owner asked to restore).
- **Build game selector**: choosing a sport reveals real game chips (matchup labels from
  artifacts) that scope the leg pool — completing the 1-choose / 2-add / 3-stake flow.

## Verification
815 tests pass (incl. 3 new Step-4 integrity tests) · tsc + build clean · copy audit
clean · stale sweep clean · production verified post-deploy (card + explorer + drawers +
games-first live).
