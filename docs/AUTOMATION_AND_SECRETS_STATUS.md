# Automation & Secrets Status — 2026-07-13

Supersedes the "everything dormant" framing in `JULY13_DAILY_AUTOMATION_STATUS.md` / `GH_ACTIONS_SECRETS_SETUP.md`:
several workflows are in fact **active**, and the nightly-settle bot **ran twice this morning** (it produced the
`fda66764` / `840f9d08` commits). The gap is the *paid* refresh + the *deploy-hook*, not settlement.

## Active workflows (live cron)
| workflow | cron (UTC) | does | secrets | deploys? |
|---|---|---|---|---|
| `nightly-settle.yml` | 05:30 + 07:30 daily | settle newly-final games, push allowlisted results paths to `main` (`[skip ci]`) → Vercel auto-deploy on new finals | `API_FOOTBALL_KEY` | yes (on finals; money-checked) |
| `daily-lifecycle.yml` | 08:30 daily | autonomous roll: settle→generate→gate→(deploy)→smoke | `ODDS_API_KEY`, `API_FOOTBALL_KEY`, `BALLDONTLIE_API_KEY` | deploy **opt-in** via repo var `ENABLE_AUTONOMOUS_DEPLOY==true` |
| `auto-refresh.yml` | every 2h | odds/board refresh; fail-closed if key unset | `ODDS_API_KEY` | no |
| `morning-projections.yml` | 13:30 daily | paid morning projections; hard refusal if key unset / over cost cap | `ODDS_API_KEY`, `BALLDONTLIE_API_KEY` | no |
| `daily-refresh.yml` | 13:00 daily | keyless refresh from cached/demo data | none | no |
| `daily-rebuild.yml` | 09:20 daily | fire Vercel deploy hook to advance the static clock | `VERCEL_DEPLOY_HOOK_URL` | **DORMANT** (no hook secret) |

Dispatch-only (manual): `game-outlook`, `lineup-aware-refresh` (retired cron), `mlb-daily` (retired cron),
`nba-market-probe`, `world-cup-odds`, `world-cup-stats-discovery`, and all UFC workflows (`ufc-odds-refresh`,
`ufc-pre-card`, `ufc-post-card`, `ufc-prop-discovery`, `ufc-fighter-stats-refresh`, `ufc-results-refresh`).
**UFC automation being dispatch-only is why UFC results are frozen at May-16** — nothing self-heals.

## Secrets — required vs present
| secret | needed by | in repo-root `.env`? | GH Actions? |
|---|---|---|---|
| `ODDS_API_KEY` | refresh, projections, auto-refresh, UFC/WC odds | **yes** | unknown (founder to confirm) |
| `API_FOOTBALL_KEY` | WC + nightly-settle | **yes** | likely (nightly-settle ran) |
| `BALLDONTLIE_API_KEY` | daily-lifecycle, projections (NBA off-season) | **no** | unknown |
| `VERCEL_DEPLOY_HOOK_URL` | daily-rebuild clock-advance | **no** | **no** → daily-rebuild dormant |

(Key **names** only — no values read or printed.) `.env.example` lists many more provider placeholders
(injury/news/props/soccer-stats), unused in the current pipeline.

## Safety invariants (verified in the scripts)
- **`refresh_daily_products.sh`**: fail-closed if `ODDS_API_KEY` unset; Odds credit-floor guard (abort < 5000);
  **md5-guards** `portfolio.json`+`banked-ladders.json` before/after (dies on change — "can never settle");
  **never deploys**; **0-game empty-slate guard** (skip team-markets/sims, exit 0).
- **`settle_soccer_day.sh`**: no key / no official bundle → no-op exit 0; FT-final gated; money-integrity gate
  aborts on inconsistent bankroll; settles paper only; never deploys.
- **`health-check.mjs`** (pre-deploy gate): composes `checkMoneyIntegrity`; exit 1 aborts deploy; staleness
  warnings never hard-fail (default `--max-staleness-days 3`).
- **`forensic-money-audit.mjs`**: reconstructs $100→$19,065.40 from the canonical ledger; non-zero on any
  mismatch. Money-integrity chain (`verify-money-integrity → forensic → health`) runs before AND after any roll.
- Deploy path is `roll_to_next_day.sh --deploy` (push `main` → Vercel) only after prod smoke; the deploy-hook
  path (`daily-rebuild.yml`) is separate + dormant.

## Answers to the mission's questions
- **Which workflows active?** nightly-settle (+ produced today's commits), daily-lifecycle, auto-refresh,
  morning-projections, daily-refresh. daily-rebuild dormant.
- **Secrets present?** Local `.env` has 2 of 4 (`ODDS_API_KEY`, `API_FOOTBALL_KEY`); missing `BALLDONTLIE_API_KEY`
  + `VERCEL_DEPLOY_HOOK_URL`. GH Actions secret config is not inspectable from here → **founder action to confirm**.
- **Handles no-game days?** Yes (empty-slate guard). **Fails closed?** Yes. **Guards money?** Yes (md5 + forensic
  + health). **Deploys or generates?** Refresh generates only; nightly-settle + daily-lifecycle can deploy (gated).

## Founder actions
1. Confirm/add GH Actions secrets: `ODDS_API_KEY`, `API_FOOTBALL_KEY`, `BALLDONTLIE_API_KEY`, `VERCEL_DEPLOY_HOOK_URL`.
2. Decide `ENABLE_AUTONOMOUS_DEPLOY` (repo var) for hands-off daily deploys.
3. Enable UFC results automation (or accept UFC as a manual experimental archive).
