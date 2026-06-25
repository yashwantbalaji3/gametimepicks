# June 25, 2026 — Soft-Launch Readiness

_Consolidated readiness, reconciliation, generation, selection, UI, known-issues, and deployment notes for
the June-25 soft launch. Builds on `june25-second-ladder-report.md` + `june25-operations-report.md`._

## 1. Money reconciliation (Phase 1) — ALL RECONCILES ✓
| Check | Result |
|---|---|
| Crown = Σ official completed-ladder finals | $20,465.40 = $10,376.17 + $10,089.23 ✓ |
| Bankroll = crown − drawdown | $20,165.40 = $20,465.40 − $300 ✓ |
| bankroll ≤ crown | ✓ |
| settledProfit = bankroll − $100 start | $20,065.40 ✓ |
| daily-summary closing = bankroll | $20,165.40 ✓ |
| ROI = settledProfit / $100 | 200.65× ✓ |
| Record | 13-3-0 (unchanged by banking) |
| completedLadders | [#1 $10,376.17, #2 $10,089.23] both official |
| pendingLaneCompletions | none (banked) · exposure $0 canonical |

Replayable: `build-mr-dub-ledger` reproduces this exact state from `banked-ladders.json`. No phantom profit
(the $300 dual-lane losses are preserved); no double-counting.

## 2. Bank Builder reset (Phase 2/3) ✓
Lane A (banked Ladder #2) + Lane B (failed) both reset to a **fresh Step-1 $100→$200 cycle-2**; the old run
is archived to `dual-bank-builder-2026-06-24-completed.json`. No surface implies Step 5 anymore.

## 3. June-25 generation (live data)
- **Bank Builder** — Lane A + Lane B, fresh Step-1, 2 legs each, $100 seed, ~+101/+104 (→ ~$200).
- **Moonshot** — A/B candidate (3 legs), below the +700 longshot floor → awaiting a qualifier (no fabrication).
- **WC Specials** — 5 cards (+968…+2402) from the live 6-game slate; team-model fallback (no soccer player props).
- **Homer Nukes** — 2 lanes × 3 legs × $10 from 437 live HR props (9 MLB games).

## 4. Selection review (Phase 5) — survival philosophy
The Step-1 cards are the deterministic output of the **safest-target-fit selector** (it re-scores every combo
and keeps the highest-survival card that reaches the rung). Both lanes are **Double-Chance anchors**
(Japan-or-Draw -450 conf 0.78; Paraguay-or-Draw -480 conf 0.78) + the market-posted total needed to reach
the 2.0× rung — consistent with the survival framework + the two completed 5-0 ladders. No safer combo
reaches $200, so **no change** (verified, not assumed).

## 5. Moonshot de-laddering (Phase 6) ✓
Removed all ladder/`$25→$3,000`/challenge/Step-X-of-Y/Target messaging from the Moonshot page, tracker, and
the product-lane descriptor. Reframed as **"two independent, high-upside longshot cards published daily,
tracked on their own record / ROI / profit, separate from the Bank Builder — maximum upside, not a ladder."**
The two products are now philosophically distinct in copy as well as in code.

## 6. Marketing / social proof (Phase 4) ✓
Factual `AchievementBanner` on the homepage (Today) + Mr. Dub: "2× $100 → $10K challenge completed", both
ladder chips ($100→$10,376 · $100→$10,089), "$20,065 paper profit", "Bank Builder 13-3" + a paper-only
disclaimer + a "Full ledger →" link. Every number is read from the canonical ledger (no hardcoded claims).

## 7. Visual / imagery (Phase 9/10) ✓
WC Specials cards carry full imagery: all 24 legs have flag data (team flag for moneyline/DC legs, both
fixture flags for totals/BTTS, player portraits for player legs); the card component renders `FlagBadge` +
portraits. Bank Builder + Homer Nukes legs carry flags/portraits. Production build renders all routes; no
broken assets in the static export.

## 8. Testing (Phase 14)
Full suite, tsc, and production build all green (count recorded with the shipping PR).

## 9. Known issues / optional improvements
- **Daily generation trigger** — the WC-odds / MLB-board fetches are still manual GitHub Actions
  `workflow_dispatch` (no cron). Settlement IS cron-automated; adding a generation cron would make the daily
  refresh fully unattended (operator/CI decision — it spends paid API credits).
- **WC projection MODEL probability** is inverted vs market (P1, mitigated — the selectors use de-vigged
  market outlook; the raw model prob is not used for selection). Quarantine is the next hardening.
- **Homer Score** is a "Partial Model" (0/7 Statcast inputs wired). Data-gated.
- **Premium UI redesign** — the site is clean (no broken assets/console errors, consistent vault theme), but
  a deeper visual redesign (spacing/typography system, animations, empty-state polish) is an open, lower-risk
  enhancement beyond this pass.
- **Local dev-server HMR** intermittently throws stale-chunk 500s after many edits — a `.next` rebuild clears
  it; it does not affect the production build or deploy.

## 10. Deployment notes
Static export (`output: "export"`) auto-deploys from `main` via Vercel (`gametime-picks.vercel.app`, 308 →
trailing slash; verify with `curl -sL`). The nightly-settle cron (05:30/07:30 UTC) now includes the World
Cup / Mr-Dub settlement (`settle_soccer_day.sh`, idempotent, official-gated, no-op without the API key).
