# Vercel Pro Utilization Audit (2026-07-31)

**Plan evidence:** founder screenshot shows a **Pro** team badge — treated as a clue, not
billing proof (June evidence said Hobby, so an upgrade happened in between or scopes differ).
Verified billing (price, seats, cycle, add-ons) still requires the founder's Billing/Usage
screenshots (checklist item F2/#1). Pro list price reference: $20/seat/mo — **estimate until
evidenced**.

## Deployment volume (GitHub deployment records — hard counts)

| Window | Production deployments (both projects) | Notes |
|---|---|---|
| Lifetime since 2026-05-04 | 1,373 (canonical) + 1,372 (duplicate) = **2,745** | every push × 2 |
| Last ~30 days (from ~601 commits/30d) | ~1,200 (both) | ~40/day peak era |
| After 2026-07-31 fixes | **~3–6/day, canonical only** | skip guard + dedupe + duplicate disconnect |

Useful-build ratio: **before** ≈ 50% at best (duplicate = 0 value) and far lower counting
docs-only builds; **after** ≈ ~100% by construction (only app/data changes build, one project).

## Build behavior

- Build = full Next.js static export of a 424 MB checkout; measured locally ≈ 2.5–4 min.
  Estimated canonical-only build minutes now: ~10–25 min/day (~300–750 min/mo) vs
  ~2,800–4,800 min/mo across two projects pre-fix — **~85–90% reduction, dominated by the
  duplicate removal and docs-skip**.
- Ignored-build decisions are near-instant and cost no build minutes.
- Cache: Vercel's build cache applies per project; with the duplicate dormant, cache churn
  halves. (Vercel-side cache hit metrics live in the dashboard — F2 screenshot item.)
- **No serverless functions, edge, ISR, image optimization, KV/Blob/Postgres, or Vercel
  Analytics** are in use — bandwidth + builds are the only meaningful Pro meters. Static-export
  fit on Pro is excellent; the plan's function/edge allowances are simply unused.

## Preview policy (4.3)

Previews exist for both projects' PR/branch pushes (5 per 100 recent deployments each — low).
Bot pushes go straight to `main` (no PRs), so preview volume is inherently small. Policy going
forward: previews only from human PRs on the canonical project (duplicate previews already
stopped — its env is disconnected + slug-guard skips). No dashboard branch-restriction change
needed at this volume; revisit if preview count grows.

## Seats / add-ons / hygiene (4.5)

Unverifiable from here (no CLI/token): seats in the team, paid add-ons, toolbar features.
Founder captures under F2. **Expected right answer at this scale: 1 paid seat, zero add-ons.**
Verdict pending evidence: **RIGHT_SIZED (provisional)** — with one caveat: if the June Hobby
evidence is still the truth and the Pro badge is a trial/other team, Hobby limits were the June
rate-limit cause; with today's ~3–6 builds/day even Hobby caps would hold, making a paid→Hobby
**DOWNGRADE_CANDIDATE** question worth one founder look at the Usage page.

## Budget controls (4.6)

Vercel-native usage notifications (Pro team owners can set category thresholds — percentage or
dollar) → founder enables per email-proof doc §3, suggested 75%/100% warning levels, **no hard
spend cap** (a cap that halts deploys would silently stop daily data publication — explicitly
rejected). Repo-side, the credit-budget warning covers the other metered resource (Odds API).

## Verdict

**RIGHT_SIZED (provisional, pending billing screenshot)** — with the duplicate dormant and the
skip rule live, utilization is now: every build serves production, every deploy is meaningful,
unused platform features cost nothing extra on the plan. The only open money question is the
plan tier itself ($0 Hobby vs $20/mo Pro vs Pro-with-seats), which one screenshot closes.
