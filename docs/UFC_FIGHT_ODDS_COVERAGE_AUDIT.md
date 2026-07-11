# UFC Odds Coverage + "Odds Pending" Fix (2026-07-11)

Founder: "it still says odds pending for a lot of the fights." Diagnosis + fix, no fake odds.

## Diagnosis
UFC 329 · 14 fights. The connected odds artifact (`odds-latest.json`, generatedAt 2026-07-10) has moneyline
for **10 of 14** fights. The **4 without odds** (genuinely provider-missing — classification **A**):
- Zach Reese vs Ryan Gandra
- Kai Kamaka III vs Luke Riley
- Paddy Pimblett vs Benoît Saint Denis
- **Max Holloway vs Conor McGregor** (the main event)

The join itself is **not** broken (diacritic-folded name-pair match already lands all 10 available bouts).

## Odds refresh attempt — REVERTED (blunt)
Ran `pipeline.ufc.build_odds` (ODDS_API_KEY present, credit-guarded, 3 credits spent). The fresh pull
returned only **3 bouts from a DIFFERENT early MMA card** (Aaron Aby / Zoran Milic, commence 14:00Z) — **0**
UFC 329 matches, vs the previous 10. So the Odds API does **not** have UFC 329 main-card moneylines posted
yet (they post closer to the 21:00Z event). **Reverted `odds-latest.json` to the better previous pull** (20
bouts / 10 matched); removed the wrong-card snapshot. Money md5 unchanged (`affe6b21…`) throughout.

## Fix — Slight-lean winner policy (Phase 4)
Every two-sided-odds fight now shows a **named winner** (was 6, now 10):
- de-vig favorite **≥ 55%** → **"Market-implied winner"** (High/Med/Low by probability) — 6 fights.
- de-vig favorite **50–55%** → **"Slight market lean"** (Low confidence) — 4 fights (e.g. "Whittaker (slight
  lean) by KO/TKO", "Sandhagen (slight lean) by KO/TKO").
- **No two-sided odds** → **"No clear winner" / "Odds pending"** — the 4 provider-missing fights only.

A winner is **never** invented for a no-odds fight, and no odds are fabricated.

## Final counts (UFC 329)
| metric | value |
|---|---|
| Fights | 14 |
| Two-sided odds | 10 |
| Provider-missing odds ("Odds pending") | 4 (Reese/Gandra, Kamaka/Riley, Pimblett/Saint Denis, Holloway/McGregor) |
| Named predicted winner | **10** (6 market-implied + 4 slight lean) |
| No clear winner (no odds) | 4 |
| Method reads | 12 |

## Guardrails
No fake odds. UFC excluded from Bank Builder / Moonshot (tested). Experimental V1 / paper-only, validation
0/150. Money md5 `affe6b21…`, 19-14, $0 — untouched.

## Residual
The 4 "Odds pending" fights (incl. the main event) will flip to named winners automatically once The Odds
API posts their moneylines — re-run `build_odds` closer to the event (a fresh pull tonight should include the
main card).
