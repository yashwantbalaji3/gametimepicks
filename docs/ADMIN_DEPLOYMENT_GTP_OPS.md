# Protected Operator Deployment — `gtp-ops` (Program 167 · Release A)

Implements OPTION_1_PROTECTED_INTERNAL_DEPLOYMENT from `ADMIN_ACCESS_DECISION.md`: a second
Vercel project deploying the internal build (`NEXT_PUBLIC_INTERNAL_ROUTES=1`) behind
host-managed authentication. The public project (`gametime-picks`) and its git integration are
untouched; the public export still prunes `/launch`, `/ops`, `/preview` (guards unchanged).

## What exists

| Field | Value |
|---|---|
| Project | `gtp-ops` (separate Vercel project, same team, **not** git-connected) |
| Build | local `vercel build --prod` from `app/` → `vercel deploy --prebuilt --prod` |
| Internal flag | `NEXT_PUBLIC_INTERNAL_ROUTES=1` project env (all targets) — prune script keeps internal routes, loudly |
| Protection | Vercel Authentication, Standard Protection (`ssoProtection.deploymentType: all_except_custom_domains`) — available on the current plan, no paid add-on |
| Production domain | **deliberately removed** (see incident below) — zero unprotected surfaces |
| Stable access | the team-scoped generated URL (tracks latest production deployment) — SSO-protected, shared privately, never committed to this public repository per the ADR |
| Headers | `X-Robots-Tag: noindex, nofollow, noarchive` + `Cache-Control: no-store, max-age=0` on `/launch|/ops|/preview` via `app/vercel.json` (public production 404s those paths, so the entries only take effect here) |

## Why the name is `gtp-ops`, not `gametimepicks-ops`

`app/scripts/vercel-ignore-build.sh` carries a duplicate-project guard that **skips every build**
on any host matching `gametimepicks-*.vercel.app`. A project named `gametimepicks-ops` would match
the glob and silently never build if it were ever git-connected or remote-built. `gtp-ops` stays
outside the glob; deploys are also `--prebuilt`, so no remote build step runs at all.

## Plan limits found (empirical, 2026-08-12)

- `ssoProtection.deploymentType: "all"` (protect production **domains**) is rejected on this plan:
  `invalid_sso_protection — Vercel Authentication is not available on your plan for production deployments`.
  That is the paid Advanced Deployment Protection tier — not purchased, per program boundaries.
- Standard Protection **does** cover every deployment URL and generated team-scoped URL; it does
  **not** cover production domains (including the auto-assigned `<project>.vercel.app`).

## Incident record — transient unauthenticated window (resolved)

For ≈4 minutes after the first production deploy (2026-08-12 ~18:4x UTC), the auto-assigned
production domain `gtp-ops.vercel.app` served the internal console unauthenticated (HTTP 200):
Standard Protection excludes production domains, which the create-time default made easy to
misread as fully covered. Containment: the domain was **deleted from the project**; it now
returns 404 with no content. Exposure assessment: brand-new project name never shared or linked
anywhere, `noindex/no-store` headers were on every response during the window, and no referrer
paths to it existed. Remaining surfaces (deployment URLs, team-scoped generated URL) verified
302 → Vercel SSO before content bytes.

**Rule going forward: never re-add a production domain (auto-assigned or custom) to `gtp-ops`**
while the plan lacks production-domain authentication. Redeploys inherit protection; domain
attachment is the only way to reopen the hole.

## Acceptance (run 2026-08-12, all pass)

`npx tsx scripts/ops/verify-admin-access.mjs --url https://<team-scoped-generated-url>`

- unauthenticated `/launch` → 302 to Vercel SSO, zero content bytes, `_vercel_sso_nonce` cookie
- deny responses carry `cache-control: no-store, max-age=0`
- public production `/launch` and `/ops` → 404 (unchanged)
- `gtp-ops.vercel.app` (removed domain) → 404, no content

Authenticated half (founder-run in a browser, per the ADR): log in with the Vercel account →
`/launch` renders; log out → re-challenged; non-member account → denied by Vercel SSO.

## Access

- **Yashwant**: team owner of the authenticated Vercel account — passes Vercel Authentication.
- **Dhruv**: PENDING_IDENTITY. The current plan is a solo (Hobby) team and cannot hold a second
  member. The one host action: founder upgrades the team plan and invites Dhruv's verified email
  as a Member (billing decision — founder-owned, not authorized in Program 167).

## Redeploy runbook

```
cd app
npx vercel pull --yes --environment=production   # link/env (project gtp-ops)
npx vercel build --prod                          # local build, internal routes kept
npx vercel deploy --prebuilt --prod --yes        # new protected deployment URL
npx tsx scripts/ops/verify-admin-access.mjs --url https://<team-scoped-generated-url>
```

`app/.vercel/` (the project link) is gitignored; the public project is never linked from this
checkout.
