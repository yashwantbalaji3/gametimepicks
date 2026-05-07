# Phase 13 — public QA, newsletter signup, and launch polish

This package focuses on making the site feel public-ready: end-to-end browser tests, a newsletter signup, copy fixes for stale messaging, and a clean fix for the confidence tooltip leak users were seeing on the live board.

## Summary

- **Newsletter signup is live** at the bottom of `/`, `/board`, and `/results`. Default state shows a graceful "coming soon" — no emails are captured until an operator wires a real provider via a one-line config edit.
- **Confidence tooltip fix** ships. The previous component was rendering its hidden popover content flat into the board hero paragraph in some browsers. Replacement uses a native HTML5 `<details>`/`<summary>` disclosure pill — bulletproof, no JS dependency for the hide/show.
- **`/trends` retired** with a clean "moved to /board" notice. The page still responds (no broken external links) but is no longer in the nav.
- **Footer demo-data leak fixed.** When `meta.isDemo === false`, any "demo data" entry in `meta.dataSources` is now filtered out of the visible list — no more "live data" status alongside "demo data" in sources.
- **Responsible Use page** updated for Parlay Lab. Removed the stale "No parlays in v1" block; replaced with educational framing that explains Parlay Lab is analysis, not advice.
- **Playwright e2e foundation** added. Four spec files cover navigation smoke, board interactions, Parlay Lab paste flow, and newsletter form behavior. Tests are gated behind `npx playwright install chromium` — apply script tries to run them and skips cleanly with a hint if browsers aren't installed.

## What changed

### Newsletter

- `app/src/lib/newsletter.ts` — provider-agnostic adapter with three modes: `none` (default — no email captured), `buttondown` (CORS POST to Buttondown's public endpoint, no API key), `mailchimp_form` (no-cors POST to Mailchimp's classic form endpoint).
- `app/src/components/newsletter-signup.tsx` — variants `full` (home page hero block) and `compact` (board / results bottom CTAs).
- Wired into `app/src/app/page.tsx`, `app/src/app/board/page.tsx`, `app/src/app/results/page.tsx`.
- Default behavior: form shows "Daily slate alerts aren't live yet — we'll announce when they are." We **do not** pretend to capture emails.
- Privacy: no localStorage, no cookies, no third-party scripts loaded by the component itself.

### Confidence tooltip fix

- `app/src/app/board/page.tsx` lines 110–172 — replaced the previous `<ConfidenceTooltip />` component (which was leaking its hidden popover content into the hero paragraph due to Tailwind class compilation issues in production) with a native HTML5 `<details>`/`<summary>` disclosure pill.
- The previous `app/src/components/confidence-tooltip.tsx` is no longer imported anywhere and has been removed from the codebase.
- Visual: a small "i confidence ▾" pill in the board hero strip. Click to expand and see the High / Medium / Low / No Play criteria. Closes on click-outside (browser native).

### /trends retired

- `app/src/app/trends/page.tsx` — replaced its content with a clean retirement notice that points users to `/board` (where the trend data is already accessible per-player via the "Show last 10 trends" toggle on each player card).
- Static export means we can't use Next.js `redirects()`. The retirement page is the safest path — it preserves the URL for any external links, displays a polite explanation, and links forward.

### Footer demo-data leak

- `app/src/components/footer.tsx` — added `visibleSources` filter that strips any `dataSources` entry whose `name` matches `/demo/i` when `meta.isDemo === false`. The footer's data sources list now only shows real, currently-active sources in live mode.

### Responsible Use refresh

- `app/src/app/responsible-use/page.tsx` — removed the outdated "No parlays in v1" block (Parlay Lab now exists). Replaced with a "Parlay Lab is educational analysis" block that explicitly states: paste-only (no scraping), educational (no recommendations), same-game-correlated, high-variance.

### E2E tests

Four Playwright spec files in `app/e2e/`:

| Spec | Coverage |
|---|---|
| `navigation.spec.ts` | All 6 routes load, render expected heading, no hydration / duplicate-key errors. Footer doesn't show "demo data" in live mode. /trends returns 200 or 404 without server error. |
| `board.spec.ts` | Date tabs clickable, filter pills toggle, trend toggle expands a card, **confidence pill does NOT leak its popover content into the hero paragraph** (regression guard). |
| `parlay-lab.spec.ts` | Educational disclaimer visible, risk profile buttons clickable, paste flow parses 1/3 legs, malformed input shows "check format", unknown player shows "not on slate". |
| `newsletter.spec.ts` | Form renders on home, invalid email triggers validation (no network call), valid email in default state shows "coming soon" copy, no third-party tracking scripts loaded. |

Run locally:
```
cd app
npx playwright install chromium    # one-time
npm run e2e
```

CI integration is not added in Phase 13 (deferred to Phase 14 — would need to extend `daily-refresh.yml` with a separate browser-test job, ~20 minutes of work).

## Files added

| Path | Purpose |
|---|---|
| `app/src/lib/newsletter.ts` | Provider-agnostic newsletter adapter (already existed in sandbox; wired up in Phase 13) |
| `app/src/components/newsletter-signup.tsx` | Form component with `full` / `compact` variants (already existed; wired up) |
| `app/playwright.config.ts` | Playwright configuration |
| `app/e2e/navigation.spec.ts` | Page load smoke for 6 routes |
| `app/e2e/board.spec.ts` | Board interactivity + confidence pill regression |
| `app/e2e/parlay-lab.spec.ts` | Parlay paste-and-analyze smoke |
| `app/e2e/newsletter.spec.ts` | Newsletter form smoke |
| `docs/NEWSLETTER.md` | Provider integration guide (Buttondown, Mailchimp, deferred providers) |
| `docs/PHASE13_NOTES.md` | This file |

## Files modified

| Path | Change |
|---|---|
| `app/src/app/page.tsx` | Newsletter `<NewsletterSignup variant="full" />` section after KPI strip |
| `app/src/app/board/page.tsx` | Newsletter compact variant before footer; confidence tooltip already replaced with `<details>` |
| `app/src/app/results/page.tsx` | Newsletter compact variant before footer |
| `app/src/components/footer.tsx` | `visibleSources` filter — drop "demo data" entries when not in demo mode |
| `app/src/app/responsible-use/page.tsx` | "No parlays in v1" → "Parlay Lab is educational analysis" |
| `app/src/app/trends/page.tsx` | Page content replaced with retirement notice |
| `app/package.json` | `@playwright/test` devDependency, `e2e` / `e2e:install` / `e2e:ui` scripts |
| `app/.gitignore` | Playwright report dirs |

## Files deleted

None this phase. (`app/src/components/confidence-tooltip.tsx` was already removed in a prior session.)

## Tests

Python suites — unchanged, all 444 assertions still pass:

| Suite | Assertions |
|---|---|
| filter_test | 58 |
| settle_test | 66 |
| grouping_test | 69 |
| diagnostics_test | 43 |
| recent10_test | 23 |
| export_results_test | 38 |
| confidence_guardrails_test | 43 |
| inspect_trends_test | 29 |
| grouping_collision_test | 31 |
| parlay_lab_test | 44 |
| **Total** | **444** |

E2E tests are new — count varies as you run them. ~20 test cases across 4 spec files.

## Data freshness diagnostic

Pages show "last refresh May 5, 1:10 PM EDT" because **the daily-refresh workflow has not produced a newer board JSON since then**. This is operational, not a bug. Possible causes:

1. **No new slate available.** May 5 was the last day with NBA games before a scheduling gap (playoffs structure or off-day). Check `pipeline/inspect_trends` output and `app/public/data/slate.json` to confirm.
2. **Workflow runs but commits no changes** because the board output is byte-identical. The `git diff --quiet` guard in `automation_refresh.sh` correctly suppresses no-op commits.
3. **Workflow fails silently.** Check the Actions tab for red runs. The Phase 11 inspect_trends step makes coverage problems visible in workflow logs.

Phase 13 does NOT add a "data is N days stale" UI badge — the existing `DataSourceBadge` already shows the timestamp. Adding a heuristic stale-warning would require deciding what "stale" means (1 day? 2? depends on whether NBA had games), which is best done after settling a few real slates.

## Known acceptable limitations after Phase 13

- **Newsletter signups go nowhere by default.** This is intentional — the operator must explicitly wire a provider before users can subscribe. The "coming soon" message is honest about this state.
- **No CI integration for Playwright yet.** `daily-refresh.yml` doesn't run e2e tests. Adding it requires an additional workflow step with browser installation (~250MB) and is best done after the e2e suite has stabilized through a few real iterations.
- **`/trends` is a soft-retirement, not a redirect.** Static export can't redirect; the retirement page is the safest path.
- **Internal `--vault-*` CSS token names remain.** Not user-visible, deferred cosmetic refactor.
- **Mailchimp form mode shows "subscribed" even if Mailchimp silently rejects.** Inherent CORS limitation; Buttondown is the cleaner choice.

## What was intentionally NOT built

- **No real provider wired** — that's an operator decision (see suggestions section).
- **No daily-email-sending automation** — separate from signup; deferred to Phase 14.
- **No multi-sport** — NBA must be excellent first.
- **No paid APIs**.
- **No sportsbook scraping**.
- **No internal CSS token rename** — cosmetic only, deferred.
- **No aggressive UI redesign** — the existing premium gold/navy direction is solid; touchups only this phase.
