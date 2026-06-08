# Bank Builder Strict Eligibility (latest)

Bank Builder is the **strictest** published surface.

## Gate (`is_bank_builder_eligible`, Python) + selection (`selectBankBuilderSlip`, TS)
- Allowed market only (batter_hits / NBA PTS / REB) — no downweighted/high-risk/disabled.
- **Heavy favorite: every leg ≤ -150** (the ~67% odds band) — `selectBankBuilderSlip`
  now requires `oddsForSide <= -150` on all legs (was `< 0`).
- L10 ≥ 80% on a near-full sample (≥8); non-stale form; lowest volatility (≤0.5).
- 2-3 legs; lowest combined payout = steadiest; ties broken by recent form,
  distinct games, known starters.
- **No responsible card → show none** (no padding). Home "Top Pick" falls back to
  the top suggested slip (not labeled Bank Builder) so the page is never empty.

## Validation
Tests cover: rejects shallow favorite (-120), non-allowed market, plus-money,
stale form; accepts a steady heavy-favorite allowed-market full-form leg.
~37 eligible legs/date Jun 5-7 (not starved). Leg hit rate of eligible pool ~65%.

## Compliance
No "safe/safest/lock/guaranteed/risk-free" copy; "most conservative", "paper
tracking", "educational" only. Conservative does not mean guaranteed.
