# GameTimePicks — Autonomous Operations Activation Checklist

> The autonomous operating system is **built and proven credential-free**. Everything below is the
> **only** remaining work, and all of it is owner-side configuration (secrets, a variable, a merge).
> The code requires no further changes to operate a weekend unattended.

---

## What is already done (no action needed)

- **One canonical lifecycle** — `scripts/roll_to_next_day.sh`, scheduled by `.github/workflows/daily-lifecycle.yml`.
  It owns the whole day: verify money → settle the prior day (official, free) → reconcile → **health gate** →
  fetch odds → generate **all four products** (Bank Builder, Moonshot, WC Specials, Homer Nukes) → rebuild the
  Mr. Dub ledger → benchmark → money+health gate → tests → build → deploy → **production smoke** → run report.
- **Honest-skip** — every credential-backed stage NO-OPs (writes nothing, exits 0) when its key is missing.
  Proven: a 3-day credential-free simulation (Jun 24→25→26) completed end-to-end, money intact, 3/3.
- **Deploy is gated** — the lifecycle publishes only if the production smoke test passes (5 pages 200 + the
  live bankroll/crown match the committed canonical data, no `$8,228` regression).
- **No overlapping orchestrators** — the duplicate product crons (`mlb-daily`, `lineup-aware-refresh`) were
  retired to dispatch-only; the dead `daily-product-refresh.mjs` was removed.

---

## STEP 1 — Add the repository **secrets** (Settings → Secrets and variables → Actions → Secrets)

Exactly three. Nothing else is required, and none are invented — these are the only `secrets.*` any workflow reads.

| Secret | Required for | If absent |
|---|---|---|
| `ODDS_API_KEY` | Live odds → Bank Builder, Moonshot, WC Specials, Homer Nukes board | those product stages honest-skip |
| `API_FOOTBALL_KEY` | Official World Cup final scores → soccer settlement | settlement NO-OPs (no money moves) |
| `BALLDONTLIE_API_KEY` | NBA fallback data (legacy boards only) | NBA fallback disabled |

**Money settlement (the part that moves the bankroll) needs only `API_FOOTBALL_KEY`** and uses free official
endpoints. The other key drives product generation, not money.

---

## STEP 2 — Set the activation **variables** (same screen → Variables)

| Variable | Set to | Effect |
|---|---|---|
| `ENABLE_AUTONOMOUS_DEPLOY` | `true` | Lets the scheduled lifecycle **push to main + deploy** after a green smoke. **Leave unset** to run settle+generate+gate+report nightly while keeping publish manual (safe default — this is the one irreversible action). |
| `ODDS_DRY_RUN` | `false` | Allow real (paid) odds calls. Defaults to a defensive value if unset. |
| `MLB_MODE` | `write_board` | Only if you want the on-demand `mlb-daily` workflow to post a real MLB board. Not needed for the canonical lifecycle. |

`MAX_PER_RUN` (75) and `MIN_REMAINING` (300) credit guards already have safe defaults — override only to retune spend.

---

## STEP 3 — Enable the workflow

`daily-lifecycle.yml` only fires on a schedule from the **default branch**. To activate:

1. Merge the `automation-health-gate` branch into `main` (PR).
2. In the Actions tab, confirm **daily-lifecycle** is enabled (GitHub disables scheduled workflows after long repo
   inactivity — re-enable if prompted).

Until merged it is dormant; you can still run it manually anytime via **Actions → daily-lifecycle → Run workflow**
(inputs: `date`, `apply`, `deploy`) to smoke-test activation before trusting the cron.

---

## Expected cron after activation (UTC)

| Time (UTC) | Workflow | Role |
|---|---|---|
| **08:30** | **daily-lifecycle** (canonical) | settle prior day → generate all products → gate → deploy → smoke → report |
| 05:30 / 07:30 | nightly-settle (legacy) | NBA/MLB results grading for the legacy boards |
| 13:30 | morning-projections (legacy) | NBA/MLB board refresh |
| 13:00 | daily-refresh (legacy) | NBA trend data |
| every 2h | auto-refresh (legacy) | NBA trend data |

The canonical lifecycle runs at **08:30 UTC**, deliberately after nightly-settle's repair pass so the two never
push to main together.

> **Note on the four legacy NBA-era crons:** they are a *separate* settlement engine for the deprecated NBA/MLB
> board pages and do not touch the World-Cup product money path. They are free and (except `auto-refresh`)
> low-frequency, but they still commit data to main — which triggers a Vercel rebuild. If you want a quiet
> autonomous weekend, disable them in the Actions tab; their proper removal is part of the v1 deprecated-page
> cleanup (P0.5). Leaving them on is harmless to money integrity.

---

## How to confirm it is working (remotely, no log-diving)

- Each run writes `app/public/data/ops/run-reports/<date>.json` (+ `latest.json`): settled day, products
  generated (per-product honest skip flags), money snapshot, smoke result, runtime, deploy URL. Also uploaded
  as a workflow artifact (`run-report-<date>`).
- A failed money or health gate, a still-pending prior-day lane, or a failed production smoke **aborts the run
  loudly** — the lifecycle never publishes a corrupted bankroll or an unverified deploy.

---

*Canonical money state at activation: bankroll **$20,065.40** · crown **$20,465.40** · record **14-4**.*
