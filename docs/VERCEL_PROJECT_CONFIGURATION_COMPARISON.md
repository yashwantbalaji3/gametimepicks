# Vercel Project Configuration Comparison — redacted (2026-07-31)

Names/counts/states only; no env values, tokens, hook URLs, or account identifiers beyond the
already-public project scope slug. Source per row: [GH] GitHub API, [HTTP] public probe,
[REPO] repository content, [DASH] founder dashboard evidence still needed.

| Field | `gametime-picks` (dash) | `gametimepicks` (no-dash) |
|---|---|---|
| Verdict | **CANONICAL_PRODUCTION** | **ACCIDENTAL_DUPLICATE** (dormant target) |
| Project ID fingerprint | not available without CLI/token [DASH] | not available [DASH] |
| Production env created [GH] | 2026-05-04 17:34:54Z (inherits the 2026-05-01 plain-"Production" era, first sha `4b23b98d`) | 2026-05-04 18:29:56Z (first sha `e877ac2e`) |
| Creator/import source | Git integration, `vercel[bot]` [GH]; original import MOST_LIKELY | second import ~90 s after the "how to import" README push [GH+REPO] |
| Framework / build | Next.js static export via `app/package.json` build (output verified served) [HTTP] | builds same repo/branch (statuses `success`) [GH]; output unreachable |
| Root directory | `app/` (reads `app/vercel.json` — proven by docs-only skip) [HTTP+GH] | same (skipped the same docs-only commits) [GH] |
| Git repository | `yashwantbalaji3/gametimepicks` [GH] | same [GH] |
| Production branch | `main` [GH] | `main` [GH] |
| Auto-deploy | ON — every push (proven repeatedly) [GH] | ON — every push until today's guard [GH] |
| Ignored-build command | in-repo `bash scripts/vercel-ignore-build.sh` [REPO] | same file; includes the duplicate-skip guard [REPO] |
| Custom domains | `gametimepicks.yashwantbalaji.com` — **PROVEN by builtAt fingerprint** [HTTP] | none observed; alias `gametimepicks.vercel.app` → `404 NOT_FOUND` [HTTP]; confirm empty list [DASH] |
| vercel.app alias serving | `gametime-picks.vercel.app` → 200 [HTTP] | 404 [HTTP] |
| Deployment protection | OFF (deployment URL → 200 public) [HTTP] | ON, default SSO (deployment URL → 302) [HTTP] |
| Production deployment SHA (latest) | `8df72085` — matches served site [GH+HTTP] | `8df72085` built, unreachable [GH] |
| Deployment count (production, lifetime) | 1,373 [GH] | 1,372 [GH] |
| Preview envs | `Preview – gametime-picks` since 2026-05-08 [GH] | `Preview – gametimepicks` since 2026-05-08 [GH] |
| Env vars (names/count) | [DASH] — build requires none for correct output (proven: CI builds with none; site complete) | [DASH] — must be captured before Phase 4 deletion |
| Deploy hooks | none (`VERCEL_DEPLOY_HOOK_URL` secret absent; `daily-rebuild` no-ops) [GH+REPO] | none known; confirm [DASH] |
| Team/account scope | `yashwantbalaji33-7164s-projects` [GH status URLs] | same [GH] |
| Build/usage last 30 days | ~460 production builds/mo each (from 1,372–1,373 over ~88 days) [GH]; minutes [DASH] | same volume, all waste [GH] |
| Unique settings worth preserving | the domain attachment (canonical) | none discovered; final check is F2 screenshots [DASH] |

Every [DASH] cell is listed as founder checklist items F1–F3 in
`VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md`, with the redacted-screenshot rule from
`FOUNDER_BILLING_EVIDENCE_CHECKLIST.md` applying (names and counts, never values).
