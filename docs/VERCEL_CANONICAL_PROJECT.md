# Vercel Canonical Project — Durable Declaration (2026-07-31)

**Canonical production project: `gametime-picks`** (WITH dash), Vercel account scope
`yashwantbalaji33-7164s-projects`.

| Field | Canonical value |
|---|---|
| Project | `gametime-picks` |
| Custom production domain | `gametimepicks.yashwantbalaji.com` (CNAME → `c099500b2442b08e.vercel-dns-017.com`) |
| Public vercel.app alias | `gametime-picks.vercel.app` |
| Git integration | GitHub `yashwantbalaji3/gametimepicks`, production branch `main`, auto-deploy on push |
| Root directory | `app/` (build runs `app/package.json` scripts; reads `app/vercel.json`) |
| Ignored build step | `bash scripts/vercel-ignore-build.sh` (in-repo, `app/vercel.json`) |
| Deployment protection | OFF for canonical (per-deployment URLs publicly reachable) |
| Required env vars for correct production output | **none** (static export; `VERCEL_*` build metadata is auto-provided; analytics/newsletter vars intentionally absent) |

**The duplicate:** `gametimepicks` (NO dash) — same repo, same account, created 2026-05-04. It
serves **no public surface** (its `gametimepicks.vercel.app` alias returns `404 NOT_FOUND`; its
per-deployment URLs are SSO-protected) but built every push for ~3 months. Classification and
consolidation: `VERCEL_DUPLICATE_PROJECT_INVESTIGATION.md`,
`VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md`. As of 2026-07-31 it is **build-skipped in-repo** by the
duplicate guard in `app/scripts/vercel-ignore-build.sh`; dashboard disconnect is the founder step.

## How to verify canonical serving (2 commands, no credentials)

```bash
curl -sL https://gametimepicks.yashwantbalaji.com/data/build-info.json | python3 -c "import json,sys; print(json.load(sys.stdin)['builtAt'])"
curl -sL https://gametime-picks.vercel.app/data/build-info.json | python3 -c "import json,sys; print(json.load(sys.stdin)['builtAt'])"
```

Identical `builtAt` ⇒ same deployment ⇒ the custom domain is attached to `gametime-picks`.
(`builtAt` is stamped per-build, so two projects can never collide on it.)

## Rules going forward

1. **One canonical spelling.** In living docs, `gametime-picks` = the Vercel project;
   `gametimepicks` = the repo/product name only. Historical reports keep their original text.
2. **Merge/deploy gate** is the `Vercel – gametime-picks` check — never the no-dash check.
3. **Nobody creates or imports a second Vercel project** for this repo without a founder
   decision and a documented staging naming convention (`gametimepicks-staging-*`).
4. Guard test: `app/src/lib/vercel-canonical-project.test.mjs` fails the suite if the ignore
   script's skip patterns drift, the canonical declaration is removed, or living docs re-invert
   the labels (this exact inversion happened once — a June handoff mislabeled the no-dash
   project as "the gate" and three living docs carried it for two months).
5. **Local linking:** developers run `vercel link` → scope `yashwantbalaji33-7164s-projects` →
   project `gametime-picks`. `.vercel/` stays untracked (gitignored); never commit it.
