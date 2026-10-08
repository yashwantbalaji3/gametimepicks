# OPS-002 — Bot commit identity and blocked Production deployments

**Date:** 2026-10-08 · **Roadmap task:** `OPS-002` (GAMETIMEPICKS_MASTER_ROADMAP_V2.md §18)
**Base:** `origin/main` = `a20ec45c79` · **Branch:** `claude/ops-002-bot-commit-identity`
**Evidence sources (all read-only):** Vercel REST API `GET /v6/deployments` for project `gametime-picks`
(4,254 deployments, 2026-08-20 → 2026-10-08T04:00Z, fields `readyState`, `seatBlock`, `attribution`,
`meta.githubRepoVisibility`, `meta.githubCommitAuthor*`); GitHub REST `GET /repos/…/commits/{sha}` and
`GET /users/{login}`; the workflow files on `main`. Re-run with `scripts/ops-002-identity-report.mjs`.

---

## 1. Root cause

The block was **not intermittent**. It happened every time, and only when the repository was private.

1. **Vercel's rule.** For a **private** repository, a Git deployment is created only if the GitHub account
   that GitHub resolves from the **commit author email** belongs to the Vercel team. Otherwise the
   deployment is `BLOCKED` with `seatBlock.blockCode: TEAM_ACCESS_REQUIRED`. Public repositories are not
   checked.
2. **The identity.** `gtp-bot <bot@users.noreply.github.com>` is a legacy `<login>@users.noreply.github.com`
   address. GitHub resolves it **by login** to the unrelated user **`bot`** (id 58210622, created 2019).
   GitHub's commit API shows `author.login: bot` for these commits, and Vercel records
   `attribution.gitUser = {login: bot, id: 58210622, type: user}`.
3. **The trigger.** `meta.githubRepoVisibility` was **`private`** from 2026-10-07T17:09Z to
   2026-10-08T00:08Z. That is the only private period in the 4,254 deployments since 08-20; the repo was
   public before and after it.

| `gtp-bot` Production deployments | BLOCKED | not blocked |
|---|---:|---:|
| repo **private** (10-07 17:09Z → 10-08 00:08Z) | **21** | **0** |
| repo **public** (all other times since 08-20) | **0** | **1,616** |

Other authors deployed normally in the same private period: `github-actions[bot]` (GitHub type **Bot**,
Vercel `gitUser.type: bot`: `dpl_8gZDEGumuxFxtZx5kRh7bUC6niTG` READY 18:45Z), `noreply@anthropic.com` →
Anthropic's `claude` account (Vercel `type: ai-agent`, 3 READY), and the founder's merge (team member). The
COST-001 audit had already linked the blocks to `gtp-bot`. It saw them stop at 00:08Z without knowing
why, so it called them "intermittent". The visibility field explains it. No API available here records
who changed the visibility or why. The founder's GitHub security log (`repo.access`) would show it.

**Impact.** Bot data waited until a non-blocked author's commit built (the ignore script diffs against
the last successful deploy). The data was delayed, never lost. This was a Production freshness defect,
not a cost defect.

### Same latent defect in other producers
| Identity used by workflows | GitHub resolves to | Vercel type | Private-repo outcome |
|---|---|---|---|
| `gtp-bot <bot@users.noreply.github.com>` (25 workflows) | stranger `bot` | user | **BLOCKED 21/21** |
| `GametimePicks Bot <noreply@github.com>` (8) | GitHub's `web-flow` | user | not observed; expected BLOCKED by the same rule (`web-flow` is not a team member) |
| `gtp-mlb-production-bot` / `gtp-pregame-bot <noreply@anthropic.com>` (2) | Anthropic's `claude` (id 81847) | ai-agent | READY. Still attributes our data commits to a third party's account, and depends on Vercel continuing to treat AI agents this way |
| `gtp-lifecycle[bot] <gtp-lifecycle@users.noreply.github.com>` (1, manual) | **unregistered** login: anyone can register it and capture the attribution | — | not observed |
| `github-actions[bot] <41898282+github-actions[bot]@…>` (auto-refresh) | `github-actions[bot]` (Bot, id 41898282) | bot | **READY** |

Each workflow pushes with the job's `GITHUB_TOKEN`, so every push is already authenticated as
`github-actions[bot]`. Only the author/committer text pointed somewhere else.

## 2. Solution chosen: author and commit as `github-actions[bot]`

```
git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
```

- **Author = committer = authenticated pusher.** No new account, seat, secret, token or permission.
- **The `<id>+<login>` noreply form resolves by account id**, so no one can claim it by registering a
  login. The `bot@…` failure came from the login-based form.
- Vercel attributes it as `type: bot`. It built during the private period, and it has never been blocked in
  328 deployments since 08-20.
- Vercel's team-access protection is **unchanged**. The bot passes the check legitimately; it does not
  get around it.

**Alternatives considered and rejected**
| Option | Why not |
|---|---|
| Add `bot` to the Vercel team | A stranger's account. Needs a paid seat and would weaken access control |
| Keep the repo public "so the check never runs" | Repo visibility is a founder decision. The fix must not depend on it |
| Dedicated machine-user account + Vercel seat | A paid seat plus a new long-lived credential, to fix a configuration-string problem |
| New GitHub App (`<app>[bot]`) | Needs an App, a private-key secret and a token-minting step in 35 workflows. Vercel would treat it as the same `bot` type, so it adds complexity without adding protection |
| Keep the old display names with the new email | GitHub/Vercel would show the name and the account disagreeing. The `auto: <lane> …` subject plus the Actions run already identify the producer |
| Change only the 25 `gtp-bot` workflows | Leaves `web-flow`, a third-party `claude` attribution and a claimable login in place. One identity is simpler to guard |

## 3. Change (producers only, no generated data)

- `.github/workflows/*.yml`: **34 files, 79 lines.** Every `git config user.name/email` now sets the pair
  above (90 settings, 45 pairs; `auto-refresh.yml` already used it). Parsing every changed file with
  js-yaml shows it is structurally identical to `origin/main` except for these strings. `permissions:` are
  unchanged, and no step, trigger, path scope or concurrency group changed.
- `app/src/lib/ops/bot-commit-identity.test.mjs` (new guard, 7 tests): every workflow identity is the
  bot pair; name and email are always set together; every committing workflow configures it; no
  `git -c user.*` or `GIT_AUTHOR_*` overrides; the retired addresses never return to workflows or
  commit scripts; the email keeps the id-bound form.
- `scripts/ops-002-identity-report.mjs` (new, read-only): attribution × outcome × visibility, BLOCKED list,
  post-cutover identity check, Production freshness. Exits 2 on any `TEAM_ACCESS_REQUIRED`, or on any data
  commit after the cutover that uses another identity.
- Docs: `docs/AUTOMATION.md` (expected author), `docs/deploy.md` (example snippet), this file, roadmap.

**Not changed:** historical commits, forecasts, receipts, settlement records and generated artifacts.
Vercel settings, GitHub settings, `app/vercel.json` and the ignore-build script are also unchanged.
Commits made by Claude sessions and the founder's local `.git/config` identity are untouched (follow-up
F1).

## 4. Local verification

| Check | Result |
|---|---|
| New guard on the branch | 7/7 pass |
| New guard against `origin/main` workflows | **3 fail** (catches the defect) |
| Mutation probes: email back to `bot@…`; name back to `gtp-bot`; identity removed from a committing workflow; `git -c user.email=` override; a commit script setting its own identity | each probe fails the guard (3/1/1/1/1 failing tests) |
| `js-yaml` parse of all 34 changed workflows + structural diff vs `origin/main` | 34/34 parse; 34/34 identical apart from identity strings; permissions identical |
| CI unit phase (`node scripts/ci/run-suite.mjs --phase unit`) | see roadmap Session Log |
| `ops-002-identity-report.mjs` on the incident window (10-07 12:00Z →) | lists all 21 `TEAM_ACCESS_REQUIRED`, exit 2 |
| Same, 10-08 00:08Z →, with that time as a pretend cutover | flags the 4+ `bot`-attributed data commits, exit 2; without cutover exit 0 |

**Cannot be proven locally:** how Vercel attributes the first real post-merge data commit. That is the
Production verification in §6, and it uses real scheduled data commits, not synthetic ones.

## 5. Vercel cost

The change sits in `.github/` (not a build input) plus one test under `app/src/` (a build input), so the
merge commit is **one normal Production build, ≈ 42–48 CPU-min ≈ $0.15–0.17**. Bot data commits build
every few minutes anyway, and the queue skips intermediate commits, so the marginal cost is about $0.
Branch pushes create no deployment (COST-001 gating). No Preview was requested.

## 6. Production verification and the seven-day acceptance

**Cutover:** workflow runs that started before the merge still check out the old workflow and commit as
`gtp-bot`. Take the cutover as the first data commit after the merge that is authored by
`github-actions[bot]`.

Daily, read-only, no builds:

```bash
node scripts/ops-002-identity-report.mjs --cli-auth --since <merge ISO> --cutover <first bot-identity data commit ISO>
```

**OPS-002 is DONE when all of these hold for ≥ 7 days after the cutover:**
1. 0 `TEAM_ACCESS_REQUIRED` (exit code 0).
2. Every `auto…` data deployment is attributed to `github-actions[bot]` / `type: bot`.
3. Production `build-info` keeps up with `main`. Lag is bounded by the build queue, as in COST-001
   (median about +4 min).
4. Data lanes keep publishing (MLB lineup/slate, NFL event window/settlement, NBA, EPL, UFC appear in the
   report).

**Honest limit:** while the repo is public, Vercel runs no team-access check at all, so seven clean days
prove **attribution**, not behaviour under private visibility. For that case the evidence is the one
`github-actions[bot]` deployment READY during the 10-07 private period, plus Vercel's `type: bot`
classification. Making the repo private just to test this is **not** recommended. If the repo becomes
private again for any reason, run the report that day.

## 7. Follow-ups (not OPS-002 scope)

- **F1 — local session identity.** This checkout's `.git/config` sets
  `gtp-ops[bot] <gtp-ops@users.noreply.github.com>`. GitHub resolves that to user `gtp-ops` (id 140865288,
  created 2023-07-29), whose ownership is not established. It has been the author on 1,157 deployments
  (Claude-session branches). Today only PR merge commits (author: founder) reach `main`, so Production is
  not affected. A direct push, or any preview while the repo is private, would be blocked the same way.
  **Founder decision:** confirm `gtp-ops` is yours, or switch local commits to an id-bound noreply address
  you own.
- **F2 — repository visibility change 10-07 17:09Z → 10-08 00:08Z.** The cause is unknown here. Besides
  this incident, a private repo uses GitHub Actions included minutes (COST-001 assumes Actions are free
  because the repo is public). Founder: check the security log, and decide whether visibility changes need
  a checklist entry.
- **F3 — contact address in HTTP User-Agents.** `app/src/lib/sports/weather/nws.mjs` and
  `app/scripts/ops/feed-health.mjs` send `bot@users.noreply.github.com` as the NWS contact. It is not a
  reachable mailbox. This is cosmetic, has no deployment impact, and belongs to OPS-001.
