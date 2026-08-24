# Daily Ops — Settle → Refresh → Verify → Deploy

> **RETIRED (P204).** This is the June-era MANUAL loop, kept as history. The live process is the
> automated cadence described in [OPERATOR_ONBOARDING.md](OPERATOR_ONBOARDING.md) — nightly-settle
> owns money, daily-products owns the boards, and the commands below must not be run against the
> current system without reading that page first.

The one-page runbook for keeping GameTime Picks current every day. **Money is sacred**: only the
official settlement path may change canonical money; the refresh script is display-only and
md5-guards the canonical files.

## The daily loop (evening, after games finish)

```bash
# 0) Always from the repo root, keys come from .env (ODDS_API_KEY, API_FOOTBALL_KEY).

# 1) SETTLE yesterday/today's completed slate (official API-Football, 90'-regulation policy).
bash scripts/settle_soccer_day.sh --date <completed-date>            # dry-run: fetch + grade, writes nothing to money
#    → hand-check the per-leg output against score.fulltime, then:
bash scripts/settle_soccer_day.sh --date <completed-date> --apply    # applies + rebuilds Mr. Dub ledger + money gates

# 2) REFRESH the next slate's display products (never touches money — md5-guarded).
bash scripts/refresh_daily_products.sh --date <next-date> --dry-run  # print the plan
bash scripts/refresh_daily_products.sh --date <next-date>            # run it (WC + MLB; --sport wc|mlb to scope)

# 3) VERIFY (all must be green — refresh already ran health):
cd app && export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
npx tsx scripts/verify-money-integrity.mjs
npx tsx scripts/forensic-money-audit.mjs        # must say MATHEMATICALLY PERFECT
npx tsx --test $(find src -name '*.test.mjs')   # full suite
npm run build                                   # static export, exit 0

# 4) DEPLOY (only after ALL gates pass):
git add app/public/data && git commit -m "Roll to <date> slate (display-only, money untouched)"
git push origin HEAD:main
npx tsx scripts/smoke-test-production.mjs       # after Vercel finishes (~3-7 min)
```

## When to settle vs regenerate
- **Settle** when a slate's games are officially FINAL (FT/AET/PEN on API-Football). Team markets
  grade on the **90-minute regulation score** (`score.fulltime`) — extra time/penalties never flip
  a 90' total or moneyline. If official data is unavailable → HALT, never guess.
- **Regenerate** (refresh) only *after* the completed slate is settled — the settle script blocks
  money mutations when the daily portfolio has already rolled forward (idempotent by design).
- A settlement changes canonical (record/bankroll/md5) → ~20-40 pinned tests need migration to the
  new official values (delegate with the authoritative new-state table; flag-don't-mask).

## Guards you can rely on
| Guard | Where | What it stops |
|---|---|---|
| Official-results gate | settle_soccer_day.sh | settling without complete API-Football finals |
| Money md5 guard | refresh_daily_products.sh | a display refresh ever moving canonical money |
| Approved-card lock | bank-builder-approved.json (date-gated) | auto-selector drifting an approved card |
| Idempotence | settle re-run = NO-OP; ledger idempotence test | double settlement |
| health-check.mjs | end of both scripts | deploying an inconsistent state |
| Fail-closed keys | refresh script preflight | half-refreshing with missing API keys |

## Known gotchas (learned the hard way)
- Money scripts run via `npx tsx` (they import `.ts`) — bare `node` throws ERR_UNKNOWN_FILE_EXTENSION.
- WC specials + daily portfolio must re-run AFTER player props exist (else stale $0/awaiting states).
- MLB ingest overwrites `schedule/<date>.json` in ingest-shape — the refresh script rewrites it to
  board-shape and removes `home-run-props/<date>.json` (Homer Nukes is retired, permanently).
- `build_round_of_32_board.py` needs `PYTHONPATH=pipeline/world_cup`; slate-label MUST equal the
  projections date (else game-detail slugs 404).
- Never hand-edit `bank-builder-approved.json` after the user approves a card — the only drift
  source has ever been a manual rewrite.
- The static export freezes the build clock — a daily rebuild (deploy) is what keeps "today" honest;
  the dormant `daily-rebuild.yml` needs the `VERCEL_DEPLOY_HOOK_URL` secret to automate this.
