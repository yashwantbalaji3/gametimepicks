# Public Beta — Daily Operations Runbook

_The operator's daily checklist for running GameTimePicks in public beta. Deeper pipeline detail:
[docs/DAILY_OPS.md](DAILY_OPS.md) and [docs/MLB_DAILY_PIPELINE.md](MLB_DAILY_PIPELINE.md)._

**Invariants that must hold every day** — money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, exposure $0,
research modeling gate BLOCKED. Every command below is money-safe (md5-guarded) or read-only. Never hand-edit
`portfolio.json`, Bank Builder, Moonshot, or research status files.

Commands run from the repo root unless noted. `D` = the slate date, e.g. `2026-07-22`.

---

## Morning (pre-slate)

1. **Production health (the deploy gate).**
   `npx tsx app/scripts/health-check.mjs` → must print `✓ HEALTHY … Deploy may proceed.` (money integrity +
   reconciliation + hygiene + freshness). If it fails, STOP and fix the reported item before anything else.
2. **Confirm the active date.** The site derives "today" from the freshest ingested board; verify `D` is today (ET)
   and not a stale slate. The homepage/`/mlb` FreshnessBadge should read the current slate.
3. **Refresh the slate (money-safe).** `bash scripts/refresh_daily_products.sh --date D` — the ONE-command
   MLB refresh; it md5-guards money and never deploys. Paid ingests (Odds API) run in CI, not locally.
4. **Verify slate completeness.** `node app/scripts/mlb-slate-completeness-gate.mjs` (or check the four artifacts
   exist for `D`): `boards/D.json`, `team-markets/D.json`, `player-props/D.json`, `game-simulations/D.json`.
   A complete public slate needs all four.
5. **Build + review the social pack (internal drafts).**
   `node app/scripts/build-mlb-social-content.mjs --date D` then `node app/scripts/build-mlb-social-pack.mjs --date D`.
   Review `data/internal/mlb/social/pack-D.json`. Read the drafts before anything is posted — they are drafts only,
   never auto-posted. Confirm the language is analytical (no "edge/value/lock/best bet/profitable/guaranteed", no
   claim the simulation is superior).

## Pregame (near first pitch)

6. **Confirm late lineup coverage.** `node app/scripts/capture-window-health.mjs` — checks the pregame capture
   windows are healthy. Late scratches can move player props.
7. **Freeze the social copy.** Once you decide to post, freeze the pack for `D`. Do NOT regenerate a frozen
   comparison after any game on the slate has started — a simulation is a PREGAME artifact. The social builder
   already refuses to export a game whose market was not captured strictly before first pitch (`marketCapturedAt <
   commenceTime`); respect the same rule when posting manually.
8. **Post is a human action.** Nothing publishes automatically. Copy the frozen draft to the platform yourself.

## Postgame (after games finalize)

9. **Verify public results.** `npx tsx app/scripts/smoke-test-production.mjs` and spot-check `/results` +
   `/mlb/results`. The public numbers must match the official artifacts (see the four record families below).
10. **Run research settlement INDEPENDENTLY.** The internal research warehouse settles on its own cadence — it is a
    separate family from the public product. `npx tsx app/scripts/monitor-mlb-research-quality.mjs` reports the
    internal data-quality status. It is internal (`public:false`); do not surface it.
11. **Do NOT publish model-performance conclusions from one date.** The simulation's single-date projection accuracy
    (`comparison_report_D.json`) is noisy and the modeled markets are not market-proven. Report it, if at all, as a
    neutral single-date figure — never as proof the model works or beats the market.

## The four record families — never combine them

| Family | Source | Public? |
|---|---|---|
| Official paper-product record (19-14, bankroll, crown, exposure $0) | `portfolio.json` (canonical) | yes |
| Public simulation projection accuracy | `mlb/results/comparison_report_<date>.json` | yes, neutral |
| Research observation settlement | `data/internal/mlb/pregame-archive` | no (internal) |
| Market-baseline benchmark | `…/status/benchmark.json` (INSUFFICIENT) | no (internal) |

Reported separately, never summed/averaged/re-labelled. Guarded by `record-family-separation.test.mjs`.

## Failure recovery

- **Missing markets (`team-markets/player-props` absent).** Odds API ingest failed or ran out of credits. Re-run the
  paid ingest in CI (`ingest-mlb-slate`); locally it 401s without a live key. If markets can't be fetched, the slate
  is incomplete — do not fabricate; the site shows honest no-play / empty states.
- **Missing simulations (`game-simulations/D.json` absent).** Player-prop props are the seed. Re-run the sim step
  after markets land. Games without both a projection and a market probability are simply not simulated — never faked.
- **Failed build.** `npm --prefix app run typecheck` then `npm --prefix app run build`. The build prunes internal
  routes/data from `out/`; if it fails, do not deploy. Check the first `error TS…` line.
- **Low Odds API credits.** Prefer `--dry-run` on the ingest to inspect without spending; guard credits (memory:
  live odds via `--dry-run` + credit guards). Skip the paid step and run with the last good slate rather than
  burning the budget on a partial refresh.
- **Stale deployment.** The nightly bot's archive commits are `[skip ci]` and do NOT redeploy. A code/content change
  needs a real deploy (Vercel build). Confirm the live domains serve the new build — the `/research` route is a good
  fingerprint (it only exists as of the public-beta launch). `curl -sL` (both domains 308 to trailing slash).
- **Incomplete social artifact.** If `build-mlb-social-content.mjs` reports "no simulations … honest no-op" or the
  pack's `excludedGames` is large, the slate isn't pregame-frozen yet — wait for the market capture, don't post a
  partial pack.

## Daily done-checklist

- [ ] health-check HEALTHY · [ ] active date correct · [ ] four slate artifacts present · [ ] social pack reviewed
- [ ] lineups healthy pregame · [ ] copy frozen before first pitch · [ ] public results match official artifacts
- [ ] research settled independently (internal) · [ ] no single-date model-performance claim published
- [ ] money md5 `affe6b21…` unchanged · [ ] gate still BLOCKED
