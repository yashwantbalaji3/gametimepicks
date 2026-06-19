# June 19 — Odds API key audit + credit-guard repair + risk odds bands

_Branch `june19-fix-mlb-provider-risk-odds-bands` off main `b052193b`. Audit at 2026-06-19 ~15:30 UTC._

## Key audit (suffix-only — keys never printed/committed)
| env var | source | suffix | quota (used/remaining/total) | plan | used by |
|---|---|---|---|---|---|
| `ODDS_API_KEY` | `.env` (only Odds key present) | `****4309` | 389 / **111** / **500** | **FREE (500/mo)** | WC `odds_api`/`build_odds_only_projections`, `build_player_props`, MLB `mlb_odds`, credit guard |

- **Free key was being used.** The dashboard's paid **20K** key is **not configured** in the project env — only the free `****4309` key exists. The "~111 remaining" the pipeline reported is the free key's quota.
- **No separate paid var** (`THE_ODDS_API_KEY` etc.) exists in `.env`. So the only fix that switches plans is for the owner to set `ODDS_API_KEY` to the **paid** key (locally + on Vercel). The key value cannot be added by automation (not available to it; and per the security note it must be rotated first).

## Security
The owner's screenshots exposed both Odds API keys → **rotate/regenerate both keys** on the Odds API dashboard, then set the new **paid** key as `ODDS_API_KEY` locally and in Vercel. This branch never prints or commits any key value (suffix-only).

## Key resolution (this branch)
`pipeline/config.py` now resolves the Odds key as: **canonical `ODDS_API_KEY` first**, else fall back to `THE_ODDS_API_KEY` **with a one-line suffix-only warning** (`****<last4>`) telling the owner to rename it. So the two keys can never silently diverge, and the canonical var always wins when both are set.

## Credit-guard repair (this branch)
The MLB board's floor was a hard-coded `350` — sensible for a 500-credit free plan, wrong for a 20K paid plan, and it silently skipped the MLB odds fetch. Repaired to be **env-configurable + plan-aware**:
- `ODDS_API_MIN_CREDITS_REMAINING` (**default 2000** — a conservative floor for the paid 20K plan) — the floor.
- `ODDS_API_ALLOW_BELOW_FLOOR` (default false) — explicit override (also accepted as `--allow-below-floor`).
- The guard now **detects free vs paid** (total quota ≤ 600 → free) and **fails closed on the free key for paid pipeline runs** *before* the floor check (so the 2000 default never over-blocks a free run — the free key is refused with a clearer `free_key_blocked` reason), unless explicitly overridden. It reports `key suffix · plan · used/remaining · floor · events` (suffix only).
- Verified on the current (free) key: `[odds] key ****4309 · plan=free · remaining=111 · floor=2000 · events=14` → writes a **pending, schedule-only** board (`pendingReason: free_key_blocked`, `oddsSource: null`, `eventsWithOdds: 0`, `credits.spent: 0`) — no fabricated odds, no paid credits burned.

## Risk odds bands + leg guards (this branch, credit-free)
New `lib/parlays/risk-odds-bands.ts` (pure, tested) enforces the owner's bands + leg guards on every generated card:
- **Low** `-200 ≤ odds ≤ +100` · **Medium** `+100 < odds ≤ +300` · **High** `+300 < odds ≤ +600` · **Longshot** `odds > +600` (non-overlapping).
- Individual legs: reject shorter than **-500** (`leg_too_short_price`), reject above **+1200** unless Longshot (`leg_too_long_price`).
- **Two enforcement points in `ui-loader.ts`:** (a) the eligible-leg pool drops every leg outside the leg guards *before* parlay generation; (b) a **combined-odds re-bucket pass** re-homes each generated card to the band its *combined* odds actually fit and drops any card priced shorter than -200 (`combined_odds_out_of_bucket`) — so a card can never surface in a bucket whose payout band it doesn't fit.
- The counts are **surfaced, not silent**: `slate.oddsBandDiagnostics` + `card-factory-diagnostics.oddsBandGuards` report `legsDroppedTooShort / legsDroppedTooLong / cardsRebucketed / cardsDroppedOutOfBucket`, shown in the Parlay Lab "Why are some buckets empty?" drawer.
- **June 19 live result:** 39 legs dropped too short (e.g. Brazil -1100, Brazil-or-Draw -7000), 1 too long, 6 cards re-homed, 0 dropped. World Cup now bands honestly to `medium 11 / high 4 / longshot 5` (**Low is legitimately empty** — no 2+-leg WC combo prices into -200..+100; the old even 5/5/5/5 was mis-bucketed). MLB/Mixed inherit the bands the moment the paid key unblocks their odds.

## MLB / Mixed / Bank Builder (blocked on paid key)
- MLB provider is confirmed **fixed** (correct generator `pipeline.mlb.generate_mlb_board`, statsapi → **14 June 19 games**), but the **odds fetch is blocked**: free key, 111 < floor. **No paid MLB fetch run** (per the owner directive). MLB board stays schedule-only (`odds_unavailable`).
- Mixed cards: need MLB odds-backed legs → empty (documented).
- Bank Builder Lane A Step 2 / Lane B Step 1: no diversified WC+MLB card → **both lanes remain awaiting**. No placement; no fabrication; protected history untouched.

## Next action (owner) — env-setup checklist
No key value can be set by automation (only the owner has the paid key, and it must be rotated first). Steps, in order:
1. **Rotate both keys** on the Odds API dashboard (the free `****4309` and the paid 20K) — the screenshots exposed them.
2. **Local `.env`** (project root, git-ignored — never commit): set `ODDS_API_KEY=<new paid key>`. Remove any `THE_ODDS_API_KEY` (or keep it = the same paid key; canonical wins either way). Do **not** keep the free key as `ODDS_API_KEY`.
3. **Vercel** → Project → Settings → Environment Variables: set `ODDS_API_KEY` = the new paid key for Production (and Preview if used). Redeploy so the new value is picked up. Optionally set `ODDS_API_MIN_CREDITS_REMAINING` (default 2000) there too.
4. **Verify without burning paid credits**: `pipeline/.venv/bin/python -m pipeline.check_odds_key` (free `/sports` probe) — confirm it reports the paid plan (total quota ~20000), suffix only.
5. **Rerun MLB**: `pipeline/.venv/bin/python -m pipeline.mlb.generate_mlb_board --date <today>` — now allowed by the paid-aware guard (plan=paid, remaining ≥ floor). Regenerate Mixed cards (bands auto-enforced via `risk-odds-bands.ts`).
6. **Attempt Bank Builder placement** only if a valid pre-event diversified WC+MLB card exists; never after start time; never fabricate.

Never print or commit the key value at any step — suffix-only (`****<last4>`).

## Guards
No fabrication; no full keys printed/committed; protected `public/data/bank-builder/*` untouched; no settlement changes; no new BB legs; stale UFC results-only; canonical risk labels; no banned copy.
