# Owner Actions — Yash (one-time setup, ~5 min)

*The only things GameTime Picks needs from you by hand. Everything else Claude Code runs. Setting these
three GitHub secrets activates the scheduled daily automation; until then the workflows run but no-op or
skip the paid/deploy steps. **Money movement and daily card approval stay manual by design** (ADR-0007) —
these secrets do NOT let automation move canonical money or approve a Bank Builder card.*

## Where to set them
GitHub → your `gametimepicks` repo → **Settings → Secrets and variables → Actions → New repository secret**.
Paste the name exactly as below and the value from the provider. Never commit a value; never paste one into
a doc, an issue, or a chat. GitHub masks secrets in logs automatically — keep it that way.

---

## 1. `VERCEL_DEPLOY_HOOK_URL`
- **What it is:** a Vercel Deploy Hook URL (Vercel → Project → Settings → Git → Deploy Hooks → create one for `main`).
- **Why it matters:** lets the scheduled rebuild trigger a fresh production deploy so the static export picks up new slates without a manual push.
- **Workflows that depend on it:** `daily-rebuild.yml`.
- **What breaks if missing:** the nightly rebuild can't redeploy — the site keeps serving the last pushed build (the client `FreshnessBadge` still self-corrects the clock, so it's honest, just not auto-refreshed).
- **How to verify:** Actions → **daily-rebuild** → **Run workflow** (manual dispatch) → it should finish green and a new deployment should appear in Vercel within a couple of minutes.

## 2. `ODDS_API_KEY`
- **What it is:** your [the-odds-api.com](https://the-odds-api.com) key (free tier gives credits/month).
- **Why it matters:** every real-odds fetch (WC + MLB boards, projections, props, specials) needs it.
- **Workflows that depend on it:** `world-cup-odds.yml`, `mlb-daily.yml`, `morning-projections.yml`, `daily-lifecycle.yml`, `auto-refresh.yml`, `lineup-aware-refresh.yml`, `game-outlook.yml`, `world-cup-stats-discovery.yml`, plus the UFC/NBA probes.
- **What breaks if missing:** refresh jobs fail-closed (they refuse a keyless fetch); boards go stale. The **credit-floor guard** (below) also needs it to read the balance.
- **How to verify (no credits burned):** `python3 -m pipeline.check_odds_key` — prints `key is valid` + remaining quota (uses the FREE `/v4/sports` endpoint). Or `python3 -m pipeline.check_odds_key --emit-remaining` for just the number.

## 3. `API_FOOTBALL_KEY`
- **What it is:** your [API-Football](https://www.api-football.com) key (v3).
- **Why it matters:** official World Cup results (the source of truth for settlement) and lineups come from here.
- **Workflows that depend on it:** `nightly-settle.yml`, `daily-lifecycle.yml`, `world-cup-stats-discovery.yml`, `lineup-aware-refresh.yml`.
- **What breaks if missing:** `settle_soccer_day.sh` NO-OPs (it refuses to settle without official results) — settlement stalls, but **no money moves** and nothing is fabricated. It's safe-but-stuck until the key is set.
- **How to verify:** Actions → **nightly-settle** → **Run workflow** with a past date that has final games → it should fetch official FT results and, if a lane is settle-able, apply through the money gate (or NO-OP cleanly if nothing is final).

---

## Rotating a secret
Replace the value in the same **Settings → Secrets** screen (create-new overwrites). No code change is
needed — workflows read the current value on their next run. After rotating `ODDS_API_KEY` or
`API_FOOTBALL_KEY`, run the verify step above; after rotating `VERCEL_DEPLOY_HOOK_URL`, dispatch
`daily-rebuild` once.

## Confirming the scheduled automation ran
- **Actions tab:** each scheduled workflow shows its last run + status. Green = ran clean.
- **`/ops`:** the **Workflow health** card shows the last automated run's status + phase (from the ops
  heartbeat), and **Next settlement / Next refresh** dates. If a run failed, treat it as an incident
  (see `docs/DAILY_CLAUDE_RUNBOOK.md` → incident path) and root-cause it — don't just re-run.

## What stays manual (by design)
- **Settlement** moves canonical money and runs official-results-only — you (or Claude Code on your
  instruction) trigger it; automation only settles what's officially final and pends the rest.
- **Bank Builder / Moonshot card approval** — you approve each day's card; automation never invents one.
- These are guardrails, not gaps. See `docs/CLAUDE_TEAM_OPERATING_SYSTEM.md`.
