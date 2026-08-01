# daily-rebuild Disposition (Program 092-095 Lane E — RETIRED)

**Retired 2026-07-31** (file deleted; recover with git if ever needed).

- **Original purpose:** force one Vercel build/day via a deploy hook so the static export's
  "today" clock advances on days when no data changes.
- **Last successful unique effect: NONE, ever.** `VERCEL_DEPLOY_HOOK_URL` was never configured;
  every run logged a notice and exited 0 — a daily green no-op since creation.
- **Why the need is gone:** data commits touch `app/` every single day (nightly settle + slate),
  so the canonical Git-integrated project rebuilds daily regardless; the no-data-change day the
  workflow was written for does not occur in practice. If it ever does, the ignored-build step
  builds any app-touching push, and a manual dashboard "Redeploy" covers the true edge case.
- **No new secret was created to preserve it** (per program boundary). If the founder later wants
  a scheduled freshness rebuild: create a deploy hook on **`gametime-picks`**, store it as
  `VERCEL_DEPLOY_HOOK_URL`, and restore the workflow from git history — it worked as written.
- **Rollback:** `git revert` of the retirement commit restores the file byte-identically; the
  ownership guard (`settlement-writer-ownership.test.mjs`) intentionally fails if the file
  reappears, so restoration is a deliberate reviewed act, not an accident.
