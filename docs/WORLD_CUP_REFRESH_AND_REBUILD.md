# World Cup — daily refresh, static rebuild, and Bank Builder restart

Operational runbook for keeping the World Cup product current and honest. Money is never mutated by any
step here; settlement is the ONLY thing that moves canonical money, and it is a separate, explicit action.

## 1. Daily refresh orchestrator — `refresh_world_cup.sh`

One command regenerates every World Cup product from a single live odds fetch, in the proven order, so all
pages land on the same slate.

```bash
# preview only (checks preconditions + credit balance, no odds spend, no writes):
./refresh_world_cup.sh --date 2026-07-02 --dry-run

# real run for a slate (defaults --horizon to date+3):
./refresh_world_cup.sh --date 2026-07-02 [--horizon 2026-07-05] [--min-credits 200]
```

Pipeline order (each step fail-closed; any non-zero exit aborts the whole run):

1. `odds_api` — live fetch (The Odds API, ~1–2 credits)
2. `build_odds_only_projections`
3. `build_round_of_32_board` (`--slate-label` MUST equal the projections date or game-detail slugs 404)
4. `build_player_props`
5. `refresh-world-cup-specials` (RE-RUN after player props exist so higher tiers can include them)
6. `build_suggested_parlays`
7. `activate-daily-portfolio --apply` (paper only)
8. `build-master-ledger`
9. `health-check`
10. `npm run build` (verify static export)

Guards:
- **credit guard** — a cheap `/sports` probe reads `x-requests-remaining`; aborts before spending if it is
  below `--min-credits`.
- **money-mutation guard** — snapshots `app/public/data/mr-dub/portfolio.json` md5 before/after and ABORTS
  if it changed. A refresh must NEVER move canonical crown/bankroll — only settlement does.
- The script does NOT push. Review the diff, then commit + deploy.

`PYTHONPATH` note: `build_round_of_32_board.py` does a bare `from build_odds_only_projections import …`, so
the script exports `PYTHONPATH=$REPO/pipeline/world_cup` (it fails under `python -m`).

## 2. Static-export freshness / rebuild plan

The site is a static export (`output: "export"`), so `Date.now()` freezes at build time. Two mechanisms keep
finished games from lingering as "live":

- **Runtime derivation (already implemented):** `effectiveRoundOf32Status()` (board) and
  `slateProgressFromKickoffs()` (slate status bar) derive status from KICKOFF vs the build clock — a game
  whose kickoff is >2.5h in the past renders "Completed — awaiting settlement", never live/bettable. So even
  a stale build degrades honestly rather than showing a finished game as active.
- **Recommended: a scheduled daily rebuild.** Add a cron (Vercel Deploy Hook or a scheduled GitHub Action)
  that triggers a production rebuild every morning ET so the frozen clock advances daily. Suggested:
  ```yaml
  # .github/workflows/daily-rebuild.yml (sketch)
  on: { schedule: [{ cron: "0 12 * * *" }] }   # 08:00 ET
  jobs:
    rebuild:
      steps:
        - run: curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL"   # secret; no code change, just a rebuild
  ```
  This is a REBUILD only (no data change, no money change) — it re-freezes the clock at "now".

## 3. Bank Builder restart — why it's operator-gated (and how to promote)

When both dual-ladder lanes are terminal (completed/stopped — e.g. after the June-29 losses),
`readLaneRungs()` returns `null` and the accounting path generates NO active Bank Builder lane. This is
deliberate: it stops the ladder from auto-restarting into a thin knockout slate right after a loss.

To keep the product legible, `buildBankBuilderProposal()` shows a **display-only** fresh daily proposal
(Lane A survival + Lane B value, from real team markets, `$0` placed). It reads/writes NO canonical money.

**Why promotion is an operator decision, not automatic:** `settle-daily-portfolio.mjs --apply` (run by the
nightly-settle workflow) grades whatever lanes are ACTIVE in `daily-portfolio.json` and MUTATES canonical
`portfolio.json` (crown / bankroll / record). So making the proposal a live lane would commit the paper
bankroll to a new cycle that settlement folds into the tracked record — a bankroll decision that must be a
human's, not a refresh side-effect.

**Operator promotion path (when you choose to start a fresh run):**
1. Reset the dual-ladder lanes to a fresh Step-1 cycle in
   `app/public/data/methodology/launch/dual-bank-builder-active.json` (`laneStatus` → active, `steps` → a
   fresh Step 1), preserving the prior completed/stopped lanes in history.
2. Re-run `activate-daily-portfolio --apply` — `readLaneRungs()` now yields a Step-1 rung and the accounting
   path builds the real Lane A/B card (the proposal legs) with real paper exposure.
3. From then on the nightly settle grades the run normally. The historical crown ($100→$10K) is preserved.

Until an operator does that, the proposal stays display-only and honest.
