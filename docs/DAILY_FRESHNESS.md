# Daily freshness — how GameTime Picks stays honest about "today"

The site is a **static export** (`output: "export"`). Every page is HTML generated at
**build time**, so `currentEtDate()` — and everything derived from it ("today", "live",
kickoff-vs-now filters, "latest slate") — is **frozen at the moment of the last deploy**.

Two independent mechanisms keep the site truthful:

## 1. Client-side freshness labels (shipped, always on)

`lib/freshness-display.ts` + `components/ui/freshness-badge.tsx` render a badge that
compares the **slate/artifact date** against the **real browser wall clock**, not the
frozen build clock.

- Server render seeds the badge with the build-date guess (so first paint matches SSR —
  no hydration mismatch).
- After mount, a `useEffect` re-computes with `currentEtDate()` (real time) and re-labels.

Result: a July-1 slate viewed on July-5 reads **"Latest slate · 4 days ago"**, never a
false "Live today", even if no redeploy has happened. Applied on `/today`, `/games`,
`/mlb`, `/world-cup`. States: `Live today` · `Latest slate · N days ago` (awaiting
refresh) · `Upcoming` · `No current slate`.

This fixes the **label**. It cannot change date-gated HTML (a section that only renders
for `date === today`, or a kickoff filter) — that needs an actual rebuild ↓.

## 2. Daily rebuild (dormant — one secret to activate)

`.github/workflows/daily-rebuild.yml` pings a **Vercel Deploy Hook** once a day so a fresh
build is produced even on a day with no data change. The fresh build's clock is *today*,
so date-gated HTML refreshes and finished games stop rendering as live.

**It is safe:** it deploys the current `main` (no code/data mutation, no money, no API
credits). It is **dormant** until the secret is set — without it the job logs a notice and
exits 0.

### Activate (repo owner, one-time)

1. Vercel → your Project → **Settings → Git → Deploy Hooks** → create a hook for branch
   `main`. Copy the URL.
2. GitHub → repo **Settings → Secrets and variables → Actions** → **New repository secret**
   → name `VERCEL_DEPLOY_HOOK_URL`, value = the hook URL.

After that the workflow rebuilds production daily at ~09:20 UTC (≈5:20 AM ET). You can also
run it on demand from the **Actions** tab → *daily-rebuild* → *Run workflow*.

### Manual one-off rebuild

If you just want to bump the clock right now without the secret, trigger a redeploy of the
latest `main` from the Vercel dashboard (Deployments → ⋯ → Redeploy), or push any commit.

## Best case: also generate a fresh daily slate

The rebuild advances the clock, but the *data* is only as fresh as the last pipeline run.
For a genuinely current board, run the daily data pipelines (see `AUTOMATION.md` and the
World-Cup / MLB refresh recipes) so a new slate exists for the new "today" — then the daily
rebuild publishes it. The freshness badge makes the in-between state honest either way.
