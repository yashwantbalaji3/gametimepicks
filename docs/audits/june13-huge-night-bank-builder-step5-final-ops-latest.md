# Step 5 published — NBA + MLB cross-sport final step (June 13 huge night)

Run: 2026-06-13 ~20:15 UTC (~4:15 PM ET) · Base `f4fb5bd`. Owner authorized changing the
Step 5 target to **NBA+MLB or 2-leg NBA** (Brazil still blocked). **Outcome: an Official Step 5
Candidate is PUBLISHED (pending)** — a real, gate-cleared cross-sport card. Bankroll/record/
ledger unchanged ($3,623.97 / 4-0 / Step 5) — not settled.

## Boards (real, current)
- NBA Game 5 (NY @ SA), isDemo=false, Live: 196 recommended, 98 High-confidence w/ odds+model.
- MLB June 13: 15 games, 704 leans, DK/FD odds + model + edge.
- World Cup: still BLOCKED (no API_FOOTBALL) — not used (owner authorized NBA+MLB instead).

## Structures evaluated
- **A — NBA + MLB** (cross-sport): best gate-clearing pair combined model prob ≈ 0.51, zero
  correlation.
- **B — 2 NBA legs** (same-game): best diff-player/diff-market pair combined model prob ≈ 0.51
  but with same-game-script correlation (both depend on the Game 5 flow).
- **Selected A** per the rules: prefer NBA+MLB when it clears gates and has materially lower
  correlation. A also screened the MLB leg to a **probable-starter pitcher** prop (no batter
  midday lineup risk) and to an **upcoming** game (Cantillo's 4:11 PM game had already started
  — excluded; chose the 10:06 PM game).

## Published Official Step 5 Candidate (pending)
| Leg | Pick | Book | Odds | Model | Market | Edge | Status |
|---|---|---|---|---|---|---|---|
| NBA | **Victor Wembanyama Rebounds Under 11.5** (NBA Finals G5, NY @ SA) | DraftKings | −122 | 0.720 | 0.550 | +20.5% | Finals starter, 8:30 PM ET |
| MLB | **Kyle Freeland Strikeouts Under 4.5** (COL @ ATH) | DraftKings | −145 | 0.708 | 0.592 | +11.6% | probable starter, 10:06 PM ET |

- Combined: **+207** (decimal 3.0746) · stake **$3,623.97** · projected return **$11,142.32**
  · projected profit **+$7,518.35** · combined model prob **0.51** · combined market **0.33**.
- Correlation: cross-sport, different games → effectively zero.
- Gates cleared: +207 ≥ +176 ✓ · $11,142.32 ≥ $10,000 ✓ · both legs model ≥ 0.55 ✓ · both
  legs market ≥ 0.50 ✓ · both upcoming tonight · no lineup risk · real odds+model+book.
- Artifact: `app/public/data/bank-builder/official-step5-candidate.json` (status `pending`).
- Loader generalized (`bank-builder-official-candidate.ts`) to read
  `official-step{currentStep}-candidate.json` + re-validate gates at read time.

## Integrity
PENDING, not settled. Bankroll $3,623.97 / record 4-0 / Step 5 / ledger (4 entries) UNCHANGED.
No fabrication — both legs are board-sourced with real odds, model probability, market
probability, and edge. Not settled until official results tonight.

## UI
The candidate renders on the flagship `/bank-builder` via the existing OfficialCandidateCard
(both legs, odds, model/market %, book, NBA orb + real MLB headshot, "NBA FINALS STARTER" /
"PROBABLE STARTER", "Step target $10,000+ · combined model probability 51%"). Header chip /
`/today` show $3,623.97 · Step 5 · 4-0. Follow-up: surface a dedicated Bank-Builder lane on
`/picks` (the candidate currently leads on /bank-builder + /today).

## Verification
863 tests (+5 step5-candidate) · tsc + build clean · copy + secret audits clean · no ledger
mutation. Production verified post-deploy.

## Next operational step (NOT done here)
Settle Step 5 tonight ONLY from official results (NBA box score for Wembanyama rebounds; MLB
box score for Freeland strikeouts). Do not settle before games are final.
