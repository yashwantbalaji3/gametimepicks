# Vercel Duplicate Consolidation Plan (2026-07-31)

Canonical: `gametime-picks`. Duplicate: `gametimepicks`. Proof:
`VERCEL_DUPLICATE_PROJECT_INVESTIGATION.md`. Rollback:
`VERCEL_DUPLICATE_ROLLBACK_CHECKLIST.md`.

## Phase 1 — Freeze & document ✅ DONE (2026-07-31, this session)

Canonical declared durably (`VERCEL_CANONICAL_PROJECT.md`); configuration-name comparison
recorded; living docs corrected; guard test added. Dashboard screenshot/export of the
duplicate's settings = founder item F2 below (no CLI access here).

## Phase 2 — Stop duplicate work without deleting ✅ repo-side DONE · dashboard-side = FOUNDER

- ✅ **In-repo skip rule** shipped: the shared Ignored Build Step skips any build where Vercel
  identifies the project as the duplicate slug. Reversible by deleting one block.
- ✅ Deploy hooks: none exist (`VERCEL_DEPLOY_HOOK_URL` absent); nothing schedules calls at the
  duplicate. Env vars: untouched by design (rollback capability preserved).
- **F1 (founder, ~2 min, reversible — the authoritative fix):** Vercel dashboard → project
  **`gametimepicks`** (NO dash) → Settings → Git → **Disconnect** the repository *(or set
  Production & Preview deployments off)*. Do **not** touch `gametime-picks`.
- **F2 (founder, ~3 min):** before or right after F1, capture redacted screenshots: General,
  Domains (expect none), Environment Variables (names/count only), Git, and the Usage page
  showing plan name + build minutes.
- **F3 (founder, optional):** if a daily freshness rebuild is still wanted, create the deploy
  hook on **`gametime-picks`** and store it as the `VERCEL_DEPLOY_HOOK_URL` secret —
  `daily-rebuild` starts working; otherwise delete `daily-rebuild.yml`.

## Phase 3 — Observation window (7 days: 2026-07-31 → 2026-08-07)

Daily (or one pass at the end), all public/no-credential:

1. Custom domain serves current data:
   `curl -sL https://gametimepicks.yashwantbalaji.com/data/build-info.json` — `buildEtDate` is
   today's slate day and sha matches the newest app-affecting commit on `main`.
2. Canonical keeps deploying: GitHub → repo → Deployments → `Production – gametime-picks` gains
   new entries on data pushes.
3. Duplicate goes quiet: `Production – gametimepicks` gains **zero** new *built* deployments.
   (If the in-repo guard is inert because Vercel does not expose the project URL to the Ignored
   Build Step, this stays noisy until founder step F1 — that outcome decides nothing except
   urgency of F1.)
4. Docs-only commits still skip the canonical build (proven working 2026-07-31).
5. Ops webhook + observer stay green (`npm run ops:public-beta-observe`).

## Phase 4 — Permanent removal (SEPARATE founder approval required; NOT this session)

Prerequisites, all must hold:
- 7-day observation clean; duplicate received no built deployments after F1.
- F2 screenshots confirm: **no unique domains**, no unique deploy hooks, no billing/team
  dependency, and the duplicate's env-var **names** are a subset of canonical's or confirmed
  obsolete (values never copied through docs).
- Rollback archive exists (F2 captures + `VERCEL_DUPLICATE_ROLLBACK_CHECKLIST.md`).

Then: dashboard → `gametimepicks` → Settings → Delete Project → verify it disappears from the
account project list and GitHub stops receiving its environment. Deletion is irreversible —
that is why it is a separate, explicit approval.

## Recurrence prevention (live now)

- Guard test `vercel-canonical-project.test.mjs` in the suite (runs in the scheduled CI).
- One canonical spelling rule + developer `vercel link` instructions in
  `VERCEL_CANONICAL_PROJECT.md`.
- Second-project policy: founder decision + explicit `gametimepicks-staging-*` naming, else no
  new imports.
