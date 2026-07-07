# Vercel Deployment Cleanup — Duplicate Project (2026-06-02)

> **Docs-only. No product/data/model/workflow change.** Records which Vercel
> project is canonical, which is the duplicate causing double deploys + the
> free-tier rate-limit, and the **operator dashboard steps** to disable the
> duplicate. No Vercel settings were changed by this doc (no CLI access).

## TL;DR

- **Canonical production project: `gametime-picks` (WITH dash).** It serves the
  custom production domain **`gametimepicks.yashwantbalaji.com`** and the public
  fallback **`gametime-picks.vercel.app`**.
- **Duplicate / redundant project: `gametimepicks` (NO dash).** Its bare alias
  `gametimepicks.vercel.app` returns **404 NOT_FOUND** (no production
  deployment), yet it is still linked to the GitHub repo and posts a
  `Vercel – gametimepicks` check + a deployment on **every push/PR** — doubling
  Vercel deploy usage and triggering the **"Deployment rate limited — retry in
  24 hours"** free-tier failures.
- **Fix (operator, in the Vercel dashboard):** disconnect the **no-dash**
  `gametimepicks` project's GitHub integration (or disable its auto-deploys).
  This halves deploy usage and stops the duplicate check. **Do not touch the
  canonical `gametime-picks` (dash) project.**

## Evidence (current, objective — 2026-06-02)

Both projects live under the Vercel account `yashwantbalaji33-7164s-projects`
(from the GitHub check target URLs):
- `Vercel – gametime-picks` → `…/gametime-picks/<deploymentId>`
- `Vercel – gametimepicks` → `…/gametimepicks/<deploymentId>`

| Probe | `gametime-picks` (dash) | `gametimepicks` (no-dash) |
|-------|------------------------|---------------------------|
| Bare `*.vercel.app` HTTP | **200 OK** | **404 NOT_FOUND** (`x-vercel-error: NOT_FOUND`) |
| Serves custom prod domain `gametimepicks.yashwantbalaji.com` | **Yes** — byte-identical hashed chunks (`chunks/2117-1ebf384d020b9f28.js`, `2972-…`, `4690-…`) ⇒ same deployment | No (a 404 project can't serve the 200 custom domain) |
| `README.md` | "Vercel fallback → gametime-picks.vercel.app" | not referenced |
| Posts a PR check | Yes | Yes (redundant) |

The custom domain `gametimepicks.yashwantbalaji.com` returns **200** and serves
the **identical** build as `gametime-picks.vercel.app` → the custom domain is
attached to the **dash** project. The no-dash project's bare alias **404s**, so
it serves no production traffic.

> **Note on the historical record (why prior reports disagreed):** May-2026
> handoffs correctly called `gametime-picks` (dash) canonical; a June-2026
> handoff mislabeled `gametimepicks` (no-dash) as "the production gate." The
> current HTTP evidence above supersedes that — the **dash** project is
> canonical. The earlier merge-gating on the no-dash check still confirmed a
> successful **build** (both projects build the same commit), so no bad code
> shipped — but the correct gate going forward is the **dash** check.

## Why the duplicate caused the rate-limit

Every push/PR triggered **two** Vercel deployments (one per linked project).
On the free (Hobby) tier the **rolling 24-hour deployment cap** was reached
roughly twice as fast. During an active multi-PR sprint (#256–#262, each with
PR-open + merge + re-triggers) this exhausted the cap and produced repeated
`Deployment rate limited — retry in 24 hours` failures on **both** checks —
including blocking PR #261.

## Cleanup steps (operator — Vercel dashboard)

**Safety-first order (reversible before destructive):**

1. **Verify the canonical project owns the production domain.**
   Vercel dashboard → project **`gametime-picks`** (dash) → **Settings → Domains**
   → confirm `gametimepicks.yashwantbalaji.com` **and** `gametime-picks.vercel.app`
   are listed here. (Expected per the evidence above.)
2. **Disconnect the duplicate's GitHub integration (reversible).**
   Dashboard → project **`gametimepicks`** (no-dash) → **Settings → Git** →
   **Disconnect** the connected GitHub repository (or, if you want to keep it
   linked, set **Settings → Git → Ignored Build Step** to always skip, or turn
   off **Production/Preview deployments**). This immediately stops the duplicate
   `Vercel – gametimepicks` check and its deployment on future PRs.
3. **Confirm the fix.** Open a trivial test PR (or wait for the next one) and
   verify only **`Vercel – gametime-picks`** (+ `Vercel Preview Comments`) posts
   — no `Vercel – gametimepicks`.
4. **(Optional, later — destructive)** Only after confirming the no-dash project
   is truly unused (no domains, no traffic), you may **delete** it:
   project `gametimepicks` → **Settings → (bottom) Delete Project**. Do this
   **only** once you're certain — deletion is irreversible.

**Do NOT** disconnect or delete `gametime-picks` (dash) — it serves production.

## Future deploy policy

- **Merge gate going forward:** require **`Vercel – gametime-picks`** (the
  canonical/dash check) = SUCCESS + `mergeStateStatus = CLEAN`. (Until the
  duplicate is disconnected, the no-dash check may still appear; once
  disconnected, only the dash check remains.)
- **Avoid burst deploys** on the free tier: batch doc changes, don't re-trigger
  rate-limited deploys repeatedly (each rejected attempt still counts and pushes
  the rolling-window reset later), and don't open multiple PRs back-to-back
  while the cap is tight.
- If deploy volume stays high, consider upgrading the Vercel plan or reducing
  preview deploys (deploy only `main` + PRs, not all branches).

## PR #261 implications

PR #261 (docs-only post-settle checklist) is blocked because **both** Vercel
checks rate-limited at `2026-06-03T02:01:18Z`. After the duplicate is
disconnected, future PRs use **half** the deploys, so the cap will be far less
likely to block. To unblock #261: wait for the rolling 24-h cap to clear
(safest ≈ **2026-06-03 22:01 ET**, 24 h after the last failed attempt), then a
**single** re-trigger (one empty commit) → merge on `Vercel – gametime-picks`
green + CLEAN. Do not re-trigger early (it re-consumes the cap).
