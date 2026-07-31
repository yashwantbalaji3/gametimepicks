# Vercel Duplicate — Rollback Checklist (2026-07-31)

Everything done in the consolidation is reversible until Phase 4 deletion. This is the exact
undo path for each action, newest first.

## Undo the in-repo duplicate skip guard

1. Edit `app/scripts/vercel-ignore-build.sh` and delete the block labeled
   *"Duplicate-project guard"* (the `case "$DUP_HOST"` block).
2. Delete the corresponding assertions in `app/src/lib/vercel-canonical-project.test.mjs`
   (test: *"the ignore script skips ONLY the known duplicate slug…"*), or the suite will fail.
3. Commit + push. The duplicate resumes building on the next push. No dashboard access needed.

## Undo the whole ignored-build step (return to build-every-push)

1. Delete `app/vercel.json` (or just its `ignoreCommand` key) and
   `app/scripts/vercel-ignore-build.sh`; remove `vercel-canonical-project.test.mjs`'s
   vercel.json assertion.
2. Commit + push. Both projects build every push again, exactly the pre-2026-07-31 behavior.

## Undo a dashboard Git disconnect (founder step F1)

1. Vercel dashboard → project `gametimepicks` → Settings → Git → Connect →
   `yashwantbalaji3/gametimepicks`, production branch `main`.
2. It resumes receiving pushes immediately. Env vars, domains (none), and deployment history
   were never touched, so nothing else needs restoring.

## Undo doc corrections

`git revert` the docs commit(s) of 2026-07-31 (they are docs-only). Historical reports were
never modified, so no history needs reconstructing.

## What has NO undo (and is therefore gated)

Phase 4 project deletion. Do not perform it without: the 7-day quiet observation, the F2
redacted settings archive, and a separate explicit founder approval. If deletion has happened
and proves wrong, recovery = re-import the repo as a new project and reconfigure from the F2
archive — deployment history is unrecoverable.

## State to verify after ANY rollback

```bash
curl -sL https://gametimepicks.yashwantbalaji.com/data/build-info.json
cd app && npm test && npx tsx scripts/health-check.mjs --today "$(TZ=America/New_York date +%F)"
```

Custom domain serves a fresh build; suite green; health gate HEALTHY; protected money hashes
unchanged (`affe6b21…`, `cb80473f…`).
