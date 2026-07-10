# Paper Bankroll Performance Review (overnight, 2026-07-10)

Yash: *"paper bankroll has not been succeeding."* Blunt take: **the paper-card sample is far too small to
call it succeeding or failing — 1 settled card is not a track record.** But the model-quality signals
underneath it are real, documented, and point to concrete safeguards. This is paper-only; the official
19-14 / $19,065.40 record is untouched and separate.

---

## The paper-card record so far (internal ledger)

| metric | value |
|---|---|
| settled cards | **1** (Moonshot, 2026-07-09) |
| card record | **0-1** (−1 paper unit) |
| pending cards | 1 (Bank Builder — soccer legs, no committed final) |
| leg record | 1-2 (33% leg hit rate) |
| meaningful? | **No** — `meaningful:false`, minimum 10 settled cards |

**Verdict: not enough data to conclude anything.** One 4-leg Moonshot that lost 2 team-market legs is
noise, not a trend. Do NOT over-correct off one card. But also do NOT claim success — the honest state is
"unproven."

## The real underlying signals (from the settled MLB model ledger, n=18,227)

These are meaningful (large sample) and should drive the safeguards:

- **Confidence tiers are anti-predictive** — High ≈ Low hit rate (Simpson's effect). Confidence must not
  up-weight a pick.
- **Large claimed edge under-performs** — edge ≥20pp hits ~44% vs <0pp ~52%. Big edge is a *caution*.
- **Per-market reliability spread ~9pp** — batter_hits ~54% (signal) → total_bases ~44% (avoid),
  pitcher_strikeouts ~47.5% (net-negative).

## Concrete safeguards (recommended, founder-gated, some shipped as recommendations)

| # | safeguard | status |
|---|---|---|
| 1 | **Exclude sub-52% markets from Bank Builder** (total_bases, pitcher_strikeouts) | recommended in `model-improvement/latest.json` (`marketsToDemote`) |
| 2 | **Discount edge ≥20pp** — don't let a big edge inflate confidence | recommended (`recommendedNoPlayRules[0]`) |
| 3 | **Bank Builder: ≤3 legs, all above the reliability floor, distinct games** | recommended (`selectorChangesRecommended`) |
| 4 | **Moonshot: never add a weak-market leg just to reach the payout floor** | recommended |
| 5 | **More no-play while the paper sample is thin** | recommended |
| 6 | **Don't up-weight by confidence tier until re-validated** | recommended |
| 7 | **Diversify sports** (UFC once data-backed; reduce soccer as WC volume shrinks) | roadmap |

## Product-specific reads

- **Bank Builder** — currently pending (soccer). It should be the *conservative* product: high reliability,
  ≤3 legs, strong settlement, low correlation. The recommendation is to raise its reliability floor.
- **Moonshot** — the one that lost. 4 legs including a batter_hits (fine) but its team-market legs are the
  volatile part. Keep it explicitly high-risk + paper-only; require distinct games (it does).
- **Longshot** — no active generator; correctly returns no-play. Leave it schema/readiness-only.
- **Mr. Dub / daily portfolio** — ⚠️ this is where paper-vs-official confusion is highest: the daily
  refresh activates *display* lanes with a non-zero display exposure. Ensure every surface says paper +
  the official exposure is $0. (This is why the July-10 slate advance was held back — see
  JULY9_FINAL_DATA_AUDIT.)

## Bottom line

The paper bankroll isn't "failing" — it's **unproven on 1 card**. The right move is discipline: demote
weak markets, discount big edges, prefer no-play, and let the sample grow to ≥10-50 settled cards before
judging any product. All safeguards are internal recommendations requiring founder approval; none were
auto-applied, and no official money/formula changed.
