# July 21 — Morning MLB Refresh (post-books) Runbook

**Why:** on the night of July 20 only **3 of 15** July‑21 MLB games had odds posted, so only those 3 got
de‑vigged team markets + 10,000‑run player‑prop simulations. Books post the remaining lines through the
morning. Re‑running the refresh + sims **after** more books post picks up the newly‑priced games. It fetches
**only what the books have actually posted** — unpriced games get **no fabricated odds and no fabricated
sims**, ever.

Everything here is **display/data only**. It does **not** place money, change exposure ($0), touch the
official record (19‑14), or auto‑activate the Step‑1 review cards. Product activation stays operator‑gated.
The refresh has a hard money‑md5 guard (`affe6b21…`) that aborts if canonical money moves.

## Commands (run from the repo root)

```bash
# 1. Confirm the real ET date first (missions/dates can drift).
date

# 2. One-command refresh — WC (archived) + MLB. Credit-guarded (fail-closed) + money-md5-guarded.
#    Re-fetches the MLB board, ingests player props, and — for every game that now has a real matchup +
#    posted odds — writes de-vigged team markets (moneyline / run line / total). Unpriced games are skipped,
#    not invented.
bash scripts/refresh_daily_products.sh --date 2026-07-21

# 3. Regenerate the deterministic 10,000-run player-prop simulations for whatever now has board+prop data.
#    (The refresh writes team markets; this step (re)writes mlb/game-simulations/2026-07-21.json.)
cd app
npx tsx scripts/generate-mlb-game-simulations.mjs --write --date 2026-07-21 --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cd ..

# 4. Re-verify money + health, then rebuild the static site.
md5 -q app/public/data/mr-dub/portfolio.json          # MUST still be affe6b21071f2b3be96bb2774eb347c3
npx tsx app/scripts/forensic-money-audit.mjs           # MUST say MATHEMATICALLY PERFECT
npx tsx app/scripts/health-check.mjs --today 2026-07-21 # MUST be HEALTHY
cd app && npm run build && cd ..                        # next build + prune internal routes
```

## What changes vs. what doesn't

- **Changes:** `mlb/boards`, `mlb/player-props`, `mlb/team-markets`, `mlb/game-simulations`, `mlb/schedule`
  for 2026‑07‑21 — more of the 15 games get real markets + sims as books post lines. `/mlb`, `/simulate`,
  `/games/mlb/*`, and the **Top‑10 → Team markets** tab (MLB market‑context fallback) all widen automatically.
- **Does NOT change:** official money / `portfolio.json` / `banked-ladders.json` (md5‑guarded), exposure
  ($0), the 19‑14 record, or the Step‑1 **review** cards in
  `public/data/methodology/launch/dual-bank-builder-active.json` (those are pinned; the refresh reads money
  state, it does not re‑author the review legs). Turning a review card into a real placed card is a separate,
  explicit operator step (the md5‑guarded promoter) — never a side effect of the refresh.

## Honesty guardrails (do not break)

- **Never fabricate odds or sims for unpriced games.** If a game has no posted market, it stays uncovered.
  Coverage returns automatically when the book posts — no manual "filling in".
- **MLB team markets are market context, not a model edge.** The full‑game model mirrors the market; the
  Top‑10 Team‑markets fallback labels these rows "Market context / watchlist," never a pick or an edge.
- **Public MLB = 10k player‑prop sim + market‑anchored full‑game snapshot.** No public projected score / win
  probability / distributions (those stay internal under `data/internal/`).
- If credits are near the floor the refresh **refuses** the paid fetch (override only intentionally with
  `ODDS_CREDIT_FLOOR`). Re‑running is idempotent and money‑safe.

## Related

- `docs/DAILY_OPS.md` — the general daily operating checklist.
- `docs/JULY21_REVIEW_BUILD_AND_FLAGSHIP_RESTART.md` — tonight's restart + review-card state.
- `docs/FOUNDER_PUBLIC_REVIEW_CHECKLIST_JULY21.md` — the founder review walk-through.
