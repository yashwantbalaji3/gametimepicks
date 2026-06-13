# Bank Builder Step 5 — Candidate Replacement Review (June 13, 2026)

**Baseline SHA:** 303f9ad · branch `june13-step5-starter-buxton` · ~19:05 ET June 13.
**State (UNCHANGED):** bankroll $3,623.97 · record 4–0 · Step 5/5 · target $10,000+. Candidate **pending**, no settlement, no bankroll/ledger mutation.

## Owner direction (this round)
1. **NBA:** drop the bench-guard leg (Miles McBride) — does not want a large amount riding on a bench player. Wants a **starter's over (points/rebounds/assists), or a Spurs spread/moneyline**. Feels the Spurs win. Asked for a deep analysis to pick the best NBA leg.
2. **MLB:** replace the leg with **Byron Buxton 1+ hits**, then (after review) specifically **Byron Buxton Hits Over 1.5** — *but only if it clears the model/market/freshness gates*, and "do not use Chapman if Buxton Over 1.5 clears."

## What the data allowed / blocked (verified on the real boards)
- **No team markets in the NBA model.** The board carries player props only (PTS/REB/AST/3PM/PRA/BLK/STL) — there is **no spread/moneyline/total with a model probability**. A Spurs spread/ML can't be published without fabricating a model, so it was not offered.
- **Buxton Hits Over 1.5 FAILS the gates** (verified, not assumed):
  - Model probability for the Over = **0.354** — the model leans the **Under (0.646)**. Below the 0.55 gate. Low confidence, edge ~1.25%.
  - **Freshness:** STL @ MIN was a **2:11 PM ET day game — already final** by selection time (~7 PM ET). A pending leg cannot come from a finished game.
  - Per the owner's own publish condition ("only if both legs pass model/market/freshness gates") and the standing "no unsupported / no stale-game props" rule → **not published.**
  - There is also no Buxton "1+ hits" (Over 0.5) market on the board at all — only this 2+ hits line.
- **Chapman was pre-authorized** by the owner's "do not use Chapman *if Buxton Over 1.5 clears*." Buxton did not clear → Chapman is permitted, and it honors the underlying "1+ hits batter" intent.

## NBA pool — Spurs starter overs (real, model-supported)
| Leg | Odds | Model | Edge | Note |
|---|---|---|---|---|
| **Devin Vassell REB Over 4.5** | **−143** (DK) | **0.705** | 15.3% | **SELECTED** — strongest Spurs starter over, Spurs-positive |
| Julian Champagnie PRA Over 15.5 | −104 | 0.650 | 17.4% | role wing, lower model |
| De'Aaron Fox REB Over 3.5 | +116 | 0.607 | 17.4% | marquee starter, longer odds, lower model |
| Stephon Castle PTS Over 15.5 | −127 | 0.577 | 5.0% | starter scoring over, lower model |
- **No Wembanyama over cleared:** tonight the model leans Wembanyama's *unders* (REB Under, PRA Under) — there is no model-supported Wemby PTS/REB/AST over, so none was forced.

## MLB pool — 1+ hits, upcoming, gate-cleared
Buxton (rejected, above). Among **upcoming** 1+ hits (batter_hits Over 0.5) legs, the strongest that pairs with Vassell (−143) and still clears +176 is **Matt Chapman** (−153, everyday Giants 3B, CHC @ SF 10:06 PM ET, model 0.756, edge 15.1%, High). Stronger-model 1+ hits favorites (Jung Hoo Lee 0.812 @ −251, Eldridge 0.785 @ −171) are too short to keep the pair ≥ +176 alongside Vassell.

## Decision: **Vassell Rebounds Over 4.5 + Chapman 1+ hits**
- **+181 · $3,623.97 → $10,183.19 · profit +$6,559.22 · combined model 0.533 · combined market 0.356.**
- Both legs PASS: model ≥ 0.55 (0.705 / 0.756), market ≥ 0.50 (0.588 / 0.605), High confidence, **upcoming** (NBA 8:30 PM, MLB 10:06 PM ET), real DraftKings odds.
- Combined model (0.533) is **higher** than the prior McBride+Freeland card (0.503). Honors both owner asks: a Spurs starter over + a 1+ hits batter.
- **Correlation:** cross-sport (NBA rebounds vs MLB hits), different games → ≈ 0.

## Honest caveat
Chapman's lineup is **not yet posted** (`lineupConfirmed: null`). A batter 1+ hits prop carries some lineup risk that the prior probable-starter *pitcher* prop did not; Chapman is an everyday starter so the risk is low, but it is non-zero. Documented in the artifact `lineupBasis`.

## Integrity
Pending only. Bankroll $3,623.97 / record 4–0 / Step 5/5 / ledger — UNCHANGED. No settlement. No fabricated odds/props/probabilities. Owner-requested Buxton leg honestly rejected on the gates rather than forced. No banned copy.
