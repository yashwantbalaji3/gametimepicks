# Bank Builder Step 5 — Official Settlement · Road to $10K Completed (June 14, 2026)

**Baseline SHA:** fee2ab3 · settled ~09:10 ET June 14, 2026.
**Result: Step 5 WON — the $100 → $10,000 paper ladder is COMPLETE (5–0).**

## Official source (NOT the user's report)
- **NBA Finals Game 5 · New York Knicks @ San Antonio Spurs · gameId 401859967.**
- ESPN box-score API: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401859967` — `status: STATUS_FINAL`, `completed: true`. (Same official source the pipeline used to settle Game 4.)
- **Final score: New York 94, San Antonio 90** (Knicks won Game 5).

## Leg settlement (official box score)
| Leg | Line | Official | OREB+DREB check | Result |
|---|---|---|---|---|
| Devin Vassell Rebounds **Over 4.5** | ≥5 to win | **7 rebounds** | 0 + 7 = 7 ✓ | **WIN** |
| Stephon Castle Rebounds **Over 4.5** | ≥5 to win | **5 rebounds** | 1 + 4 = 5 ✓ | **WIN** |

Both legs cleared. The user's report matched the official box score — but the box score, not the report, is the basis for settlement. (Note: the Spurs *lost* the game; the card was on rebound totals, not the result, so the Spurs loss did not affect either leg.)

## Card result
- **Step 5: WON** · combined +186 · stake $3,623.97 → **payout $10,376.17** · profit **+$6,752.20**.
- Bankroll: $3,623.97 → **$10,376.17**. Record: 4–0 → **5–0**. Run status: **completed**. Road to $10K: **completed**.
- Story: **$100 → $10,376.17 across 5 rungs** (over 100×), June 9–13.

## Full ladder (all 5 rungs, officially settled)
1. MLB (Jun 9) — Ohtani 1+ hit · Seager Under 1.5 hits → $100 → $211.85
2. NBA Finals G4 (Jun 10) — Castle REB Over 4.5 (5) · Anunoby PRA Over 23.5 (38) → → $... 
3. World Cup (Jun 11) — Mexico ML · South Korea/Czechia DC → 
4. WC + MLB (Jun 12) — USA/Paraguay DC · Avila K Under 3.5 (0) → $1,423.64 → $3,623.97
5. NBA Finals G5 (Jun 13) — **Vassell REB Over 4.5 (7) · Castle REB Over 4.5 (5)** → $3,623.97 → **$10,376.17**

## Artifacts updated (public, source of truth)
- `public-summary-latest.json`: bankroll 10376.17, record 5-0, currentStreak 5, lastSettled Step 5, `runStatus "completed"`, `finalBankrollUnits 10376.17`.
- `public-ledger-latest.json`: appended Step 5 win entry (Vassell finalStat 7, Castle finalStat 5, settlementSource "espn", officialResultConfirmed true, sameGame true); `nextPickStatus "completed"`, `nextStakeUnits null`.
- `official-step5-candidate.json`: status "pending" → "settled", result "won", per-leg finalStat + result "win", finalScore recorded.
- Internal experimental summary/ledger (`summary-latest.json` $444.19) — NOT touched (separate audit track).

## UI
- `/bank-builder`: completion crown — "🏆 Road to $10K completed", $100 → $10,376.17, 5–0, before/after card, 100% lava meter, Step 5 shown WON with Vassell + Castle portraits + Spurs logos + rebound counts in Previous Hits; review-pending panel removed; settled candidate no longer renders as pending.
- `/picks`, `/today`, `/build`, `/nba`, `/mlb`: the settled candidate makes the pending Step 5 callout vanish automatically (loader returns null for non-pending) — no stale pending card. `/results` shows the Step 5 settlement.

## Scope / honest limitations
- **Officially settled this session: Bank Builder Step 5** (the user's explicit deliverable), from the ESPN final box score.
- The **general June-13 suggested-card results pipeline** (`settle_results.py` / `settle_suggested_cards.py` grading every June-13 NBA/MLB prop into `settled_leans.jsonl`) was **not run** here — that is a separate batch operation. No stale June-13 pending cards are user-facing: the slate pages (`/picks`, `/today`, `/nba`, `/mlb`) are date-gated to today (June 14), so June-13 cards are not shown as active. No June-13 result was fabricated or guessed.
- World Cup: no June-13 WC cards were published (WC remained credential-blocked), so there are none to settle.

## Integrity
Settled only from the official ESPN final box score, cross-checked via OREB+DREB consistency. No fabricated stats/scores. No banned promotional copy. 864 tests pass, tsc + build clean.
