# Vercel Duplicate Project Investigation (2026-07-31)

**Verdict: the founder's hypothesis is PROVEN.** `gametime-picks` (dash) is
**CANONICAL_PRODUCTION**; `gametimepicks` (no-dash) is an **ACCIDENTAL_DUPLICATE** (with the
origin narrative below ranked by evidence). No account credentials were used or requested; no
secret or env value was read. Vercel CLI is not installed locally and no `.vercel/` metadata
exists — all evidence is from GitHub deployment records, public HTTP probing, DNS, git history,
and the repository's own documents.

## 1. Canonical proof (each criterion scored)

| Criterion | `gametime-picks` (dash) | `gametimepicks` (no-dash) |
|---|---|---|
| Serves custom production domain | **YES — PROVEN.** `gametimepicks.yashwantbalaji.com` and `gametime-picks.vercel.app` return byte-identical `build-info.json` (`builtAt 2026-07-31T17:13:52.985Z`, sha `8df72085`). `builtAt` is per-build, so identity ⇒ same deployment | NO — its alias `gametimepicks.vercel.app` returns `404 NOT_FOUND` (server: Vercel) |
| Public vercel.app alias serving | YES (HTTP 200) | NO (404) |
| GitHub production deployment statuses | YES — `Production – gametime-picks`, 1,373 deployments | YES — `Production – gametimepicks`, 1,372 deployments (**builds, serves nothing**) |
| Deployment protection | OFF — per-deployment URL returns HTTP **200** publicly | ON (default) — per-deployment URL returns HTTP **302** to SSO. Consistent with a project nobody ever configured |
| Complete env-var set | The build provably requires **none** (CI builds green with no Vercel vars; served output is complete and health-checked). Dashboard enumeration = founder checklist item | unknown (dashboard); irrelevant to serving — nothing routes to it |
| Correct branch/root | YES (builds `main`/`app` and serves the correct export) | builds the same — but output unreachable |
| Current production SHA | YES (`8df72085`, the latest app-affecting commit) | builds it too; serves nowhere |
| Referenced by current docs/workflows | YES — `smoke-test-production.mjs`, `write-run-report.mjs`, README fallback URL all use `gametime-picks.vercel.app` | referenced only as "duplicate" (and in three stale living docs, now corrected) |
| Deploy hook | `VERCEL_DEPLOY_HOOK_URL` secret is ABSENT — `daily-rebuild` no-ops. **Neither** project owns an active hook | none |
| Founder operational use | Matches founder hypothesis | — |

## 2. Timeline (from GitHub environment + deployment records, all UTC)

| When | Event |
|---|---|
| 2026-05-01 04:05:07 | First-ever Vercel deployment of the repo — plain env **"Production"** (single-project era), sha `4b23b98d` (*"GametimePicks v1"* initial commit, now orphaned by a later history rewrite) |
| 2026-05-04 17:34:54 | Env **`Production – gametime-picks`** appears; its first record carries the **original May-1 sha** — the suffixed naming Vercel uses once a second project exists |
| 2026-05-04 18:28:26 | Founder commits `e877ac2e` *"Phase 6: polish live demo and public project docs"* — the README that documents "Import the repo in Vercel → add the custom domain" and names `gametime-picks.vercel.app` as the public fallback |
| 2026-05-04 18:29:56 | Env **`Production – gametimepicks`** appears — the duplicate's first build, ~90 seconds after that push |
| 2026-05-08 16:52/16:53 | Both Preview envs created (PR/branch previews double too) |
| 2026-06-02 | `VERCEL_DEPLOYMENT_CLEANUP_2026-06-02.md` independently proves dash = canonical after free-tier **rate-limit blocked PR #261**; documents dashboard disconnect steps. **Steps were never executed** |
| June–July | Three living docs drift into the inverted labels ("`gametimepicks` gate + `gametime-picks` legacy"); duplicate keeps building every push |
| 2026-07-31 | This investigation re-proves canonical from live evidence; in-repo skip guard shipped; living docs corrected; guard test added |

## 3. Why the duplicate exists — ranked narrative

- **PROVEN:** the duplicate project began deploying 2026-05-04 18:29:56 UTC, within ~90 s of the
  push of the commit that added public "import this repo in Vercel" instructions; the repo moved
  from single-project ("Production") to two-project (suffixed envs) naming that same afternoon;
  both projects sit in the same account scope.
- **MOST_LIKELY:** a second **manual import of the same repo** performed that afternoon (the
  README flow being written/tested end-to-end). Vercel auto-named the new project after the repo
  (`gametimepicks`), which is why the *duplicate* carries the "clean" name while the original
  carries the dashed name. Its never-touched default settings (deployment protection still on,
  alias never made to serve) fit an import that was completed and then forgotten.
- **POSSIBLE:** a rename or account-scope re-import produced the second project; or the no-dash
  project was intended as a staging/gate environment but never documented as such. (The June-era
  "gate" labeling in three docs is *consistent with* someone later rationalizing its PR check as
  a gate — the check was real, the "authoritative" part was not.)
- **UNSUPPORTED:** any intentional load-bearing role for the no-dash project. Nothing routes to
  it; no hook targets it; no doc instructs deploying to it; it has never served the domain.

## 4. Configuration & hidden-dependency comparison

Repository-side (complete): see §1 rows for domains, hooks, tooling references. `.vercel/` — no
local link metadata exists anywhere (nothing to leak, nothing pointing at either project).
`vercel.json` (added 084-087) is read by **both** projects from `app/` — proven when both
projects skipped the same docs-only commits on day one.

Dashboard-side (requires founder — no CLI/token available; **redacted screenshots or CSV only**):

| Item to capture (per project) | Why |
|---|---|
| Settings → General: created date, framework, root directory | confirms import provenance |
| Settings → Domains | proves domain list; duplicate must show none |
| Settings → Environment Variables — **names and count only** | rollback-safety inventory; never values |
| Settings → Git: connected repo, production branch, deploy hooks | hook + integration census |
| Deployments tab: last 30 days count | verifies build-volume math and the post-skip quiet |
| Usage/Billing page: plan name, build minutes | closes the "Hobby vs Pro" unknown from the cost baseline |

## 5. Cost / operational impact (verified vs estimated)

| Impact | Verified evidence | Monthly effect | Risk | 
|---|---|---|---|
| Build duplication | 1,372 production deployments since 2026-05-04 (GitHub records) — every push built twice | ~460 duplicate builds/mo; est. ~1,400–1,800 duplicate build-minutes/mo (est. 3–4 min/build) | Consumes the shared Hobby build/deploy caps |
| Rate-limit incident | **PROVEN**: June free-tier "Deployment rate limited — retry in 24 hours" on both checks; blocked PR #261 (`VERCEL_DEPLOYMENT_CLEANUP_2026-06-02.md`) | recurrence risk during any PR burst | HIGH (was realized) |
| Preview duplication | 5 preview deployments each in last 100 records | doubles PR preview noise | low |
| Bandwidth/storage | duplicate serves no traffic (404 alias, protected URLs) | ≈none | low |
| Operational confusion | **PROVEN**: three living docs inverted canonical/duplicate for ~2 months; June cleanup doc existed and was not executed | — | **HIGH** — debugging/gating against the wrong check |
| Secret/config drift | duplicate's env vars un-enumerable from here; nothing serving depends on them | — | MED until founder screenshots close it |
| Dollar cost | **$0 verified today** (Hobby evidence as of June; no paid seat observed) | $0 | the waste is caps/minutes/attention, not dollars |

## 6. What changed today (all reversible, no account access)

1. **Duplicate guard in the in-repo Ignored Build Step** (`app/scripts/vercel-ignore-build.sh`):
   when Vercel identifies the running project's production URL as `gametimepicks.vercel.app` /
   `gametimepicks-*.vercel.app`, the build is skipped. Fails OPEN (builds) on any other or
   absent identity, so the canonical project can never be frozen by it. Reversal = delete the
   block.
2. **Guard test** `app/src/lib/vercel-canonical-project.test.mjs` — pins the skip patterns, the
   canonical declaration, corrected living docs, and canonical tooling hosts.
3. **Living docs corrected** (`ARCHITECTURE.md`, `PROJECT_OVERVIEW.md`,
   `KNOWN_LIMITATIONS_AND_RISKS.md`, `METHODOLOGY_V2_POST_SETTLE_CHECKLIST.md`); historical
   reports left as written.
4. `VERCEL_CANONICAL_PROJECT.md` (durable declaration), consolidation plan + rollback checklist
   written; waste register updated.

**Caveat resolved same-day — the guard is PROVEN LIVE.** The first app-touching push after the
guard landed (`9e17733b`) produced exactly **one** deployment — `Production – gametime-picks`,
which built and now serves the custom domain — and **zero** deployment records for the
duplicate. Vercel does expose the project identity to the Ignored Build Step, and duplicate
builds have stopped entirely, with no dashboard access required. The founder's F1 disconnect
remains recommended as the authoritative account-level fix (belt over the in-repo braces).
