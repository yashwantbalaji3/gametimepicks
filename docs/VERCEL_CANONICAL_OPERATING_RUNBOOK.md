# Vercel Canonical Operating Runbook (2026-07-31)

One page for operating the single production project. Identity & proof:
`VERCEL_CANONICAL_PROJECT.md`. History: `VERCEL_DUPLICATE_PROJECT_INVESTIGATION.md`.

## The one production project

`gametime-picks` (team `yashwantbalaji33-7164s-projects`) ← Git auto-deploy from
`yashwantbalaji3/gametimepicks@main`, root `app/`, static export. Serves
`gametimepicks.yashwantbalaji.com` + `gametime-picks.vercel.app`. The no-dash `gametimepicks`
project is Git-disconnected (2026-07-31 ~17:30 ET), skip-guarded in-repo, dormant, pending
deletion review after 2026-08-07.

## What builds and what skips (in-repo, reviewable, tested)

`app/vercel.json` → `app/scripts/vercel-ignore-build.sh`:
1. Running project identifies as the duplicate slug → **skip** (always).
2. No `app/` changes since the last **deployed** SHA (`VERCEL_GIT_PREVIOUS_SHA`) → **skip**
   (docs/, vp/, scripts/, .github/, data/internal/ churn never builds).
3. Everything else — app code, `app/public/data` slates, unknown identity, missing SHA —
   → **build** (fail-open, so production can never be silently frozen).

Behavioral tests: `app/src/lib/vercel-ignore-build.behavior.test.mjs` (docs-skip, data-build,
push-batch stranding, fail-open, duplicate-skip). Static guard:
`vercel-canonical-project.test.mjs`.

## Daily rhythm (who causes deployments)

| Cause | Builds? | Typical/day |
|---|---|---|
| Nightly settle commits (app/public/data) | YES | 1–2 |
| Morning projections + production slate commits | YES | 2–4 |
| Pregame-capture commits (data/internal only) | no | 0 (7–8 pushes skipped) |
| Docs/program/vp commits | no | 0 |
| PR previews (human app changes) | YES (preview) | rare |

Expected steady state: **~3–6 useful production builds/day**, every one serving a real data or
app change — down from ~40 builds/day across two projects at the July peak.

## Verifying production (no credentials)

```bash
curl -sL https://gametimepicks.yashwantbalaji.com/data/build-info.json   # sha + buildEtDate
cd app && npm run verify:deployment                                      # full check
node scripts/public-beta-observe.mjs                                     # platform observation
```

## Notifications

- **Email (Vercel-native):** deployment failures + promotions, domain errors, usage thresholds —
  founder toggles per `VERCEL_DEPLOYMENT_EMAIL_NOTIFICATIONS_PROOF.md` §3.
- **Discord ops webhook:** workflow failures (5 wired) + credit-budget warnings; contract in
  `docs/OPS_ALERTING_CONTRACT.md`, redaction guard-tested.
- **Dashboard:** Vercel deployments list is authoritative for build/skip decisions ("[ignore-build]…"
  lines appear in the ignored-build output).

## Recovery moves

| Situation | Move |
|---|---|
| Site stale (buildEtDate behind) | check newest bot push touched `app/`; if a needed build was skipped, push any app-touching commit or hit "Redeploy" in dashboard |
| Skip rule misbehaving | delete `ignoreCommand` from `app/vercel.json` (build-every-push resumes); rollback doc has exact steps |
| Duplicate wakes up (new deployment appears) | someone reconnected its Git — disconnect again; guard still skips its builds |
| Wrong-project debugging | the ONLY production check is `Vercel – gametime-picks` |
| Deploy hook wanted (freshness rebuild) | create on `gametime-picks` only → store as `VERCEL_DEPLOY_HOOK_URL` secret → `daily-rebuild` starts working |

## Boundaries

Never: reconnect/delete the duplicate without the quiet-window review + founder approval; add a
second project without the staging naming convention; commit `.vercel/` or any token; configure
a spend cap that could halt data publication.
