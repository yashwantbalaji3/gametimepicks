# Recommendation: enforce required CI on `main` without adding an approval bottleneck

**Status:** recommendation only. Nothing has been configured; repository settings are the founder's to change.
**Date:** 2026-10-17

## Today
`main` has **no branch protection and no ruleset**: `GET /branches/main/protection` returns 404. Because of that:
- GitHub auto-merge gives no safety. It would merge immediately, without waiting for CI.
- Anyone or anything with push access can push code to `main` without a green run.
- The only gate is discipline: verified exact-head merges with `--match-head-commit`.

Constraints any rule has to respect:
1. **Bot data writers push straight to `main`, many times a day.**
   - The commits are `auto: … [skip ci]`, from GitHub Actions workflows such as nightly-settle, mlb-daily-production, mlb-lineup-refresh, auto-refresh and nfl-*.
   - A rule that requires a PR or status checks on *every* push would break all of them during live windows.
2. **PR CI tests `refs/pull/N/merge`, and GitHub can leave that ref stale after `main` moves.** See memory `pr-ci-stale-merge-ref`.
3. **No founder review gate.** Required reviews would recreate the bottleneck this policy removes.

## Recommended: one repository ruleset, "main: require CI for PRs"
Target `refs/heads/main`, with enforcement **Active**.

| Rule | Setting | Why |
|---|---|---|
| Require a pull request before merging | **on**, 0 required approvals, no code-owner review | Code changes go through PR CI, with no human approval gate |
| Require status checks to pass | **on**; required checks `quality` and `python` from the `quality-gate` workflow | The two jobs that run today |
| Require branches to be up to date | **off** | Data commits land every few minutes, so "up to date" would force constant branch updates and CI re-runs |
| Block force pushes | **on** | Protects history and the append-only ledgers |
| Restrict deletions | **on** | |
| Require linear history | **off** | Release stacks use merge commits so contained PRs auto-close as merged |
| **Bypass list** | the **GitHub Actions** integration (or the specific app or bot identity the writers push as, e.g. `gtp-ops[bot]`), set to *always* | Data writers keep pushing directly; the founder can also be listed for emergencies |

**Effect:**
- Code reaches `main` only through a PR whose `quality` and `python` checks passed.
- Bot data writers are unaffected.
- No human approval is required.
- GitHub auto-merge becomes *safe* to use, because it now waits for the required checks.

## Optional, after launch: merge queue
A merge queue tests each PR against the *current* `main` plus the PRs ahead of it. That fixes the stale merge-ref problem at the source, and turns "merge when green" into a guarantee instead of a convention.
- **Cost:** one extra CI run per merge, about 20 minutes of Actions time. There's no Vercel cost, because queue branches are not `main` or `preview/**`, so `vercel-ignore-build.sh` skips them.
- **Caveat:** the bypass for bot writers still has to apply. Check that queue-required checks don't block direct bot pushes.

## Before enabling (5-minute checklist)
1. Commit authors on `main` over the 2 days to 10-17:
   - `github-actions[bot]`: 168 commits, the data writers. **This is the bypass entry.**
   - `gtp-ops[bot]`: 9.
   - `yashwantbalaji3`: 5, merge commits made through `gh pr merge`.

   Before enabling, confirm which identity the writers push as. Use `git log --format='%an <%ae>' origin/main | sort | uniq -c` over recent `auto:` commits, plus the workflow `actions/checkout` token, so the bypass entry is exact.
2. Turn the ruleset on in **Evaluate** mode first. Watch one full day of writer pushes in the ruleset insights and confirm 0 would-be blocks on `auto:` commits.
3. Then switch it to **Active**.
4. Rollback is a single toggle back to Disabled.

## Until this is configured
Under the founder's standing authorization (2026-10-17), the integration session keeps doing **verified exact-head merges** (`gh pr merge N --merge --match-head-commit <sha>`). Each one runs only after independently checking:
- CI and mergeability;
- a local combined-candidate gate;
- workflow timing;
- data integrity.

It does not use unprotected auto-merge.
