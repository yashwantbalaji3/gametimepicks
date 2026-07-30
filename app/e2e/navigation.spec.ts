import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 13 e2e — navigation smoke.
 *
 * For each top-level route, verifies:
 *   1. Page returns a successful response and renders.
 *   2. The expected heading is present.
 *   3. No critical console errors fire during initial render.
 *      We allow third-party "warning"-level noise, but fail on hydration
 *      mismatches and React duplicate-key warnings.
 */

const PAGES = [
  // Sprint 035: the visible brand is "GameTime Picks" (spaced). The one-word form appears only in
  // meta/URLs, never in rendered text, so the old regex could never match.
  { path: "/", heading: /GameTime\s*Picks/i },
  // 2026-07-30 route audit: /board was the NBA model board and is now an alias for the MLB
  // board (the one sport with a live model). Asserted as a redirect below.
  { path: "/mlb/board/", heading: /MLB games|model leans|off-day/i },
  // Sprint 035: /parlay-lab is a client redirect to /picks (the suggested-card lobby moved).
  // Asserted as a redirect below rather than as a page with its own heading.
  { path: "/results/", heading: /results/i },
  { path: "/methodology/", heading: /methodology/i },
  { path: "/responsible-use/", heading: /responsible use/i },
];

// /trends is a soft-retired route post-Phase 12. It must still respond
// (we don't want broken external links) but shows the retirement notice.
// Legacy aliases that must keep working rather than 404 — they client-redirect to their new home.
const REDIRECTS = [
  { path: "/parlay-lab/", lands: /\/picks\/?$/ },
  { path: "/board/", lands: /\/mlb\/board\/?$/ },
  { path: "/sports/", lands: /\/mlb\/?$/ },
  { path: "/nba/", lands: /\/results\/nba\/?$/ },
];

const RETIRED = [
  { path: "/trends/", expect: /trends|moved|retired|model board/i },
];

function attachConsoleListener(
  page: Page,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") errors.push(text);
    if (msg.type() === "warning") warnings.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return { errors, warnings };
}

for (const { path, heading } of PAGES) {
  test(`${path} loads, renders heading, no critical console errors`, async ({
    page,
  }) => {
    const { errors, warnings } = attachConsoleListener(page);

    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();

    // Expect at least one h1 matching
    await expect(page.locator("h1").first()).toBeVisible();

    // Expect the heading regex matches somewhere on the page (not just h1
    // because the home page hero has an h1 separate from the page heading)
    await expect(page.locator("body")).toContainText(heading);

    // Hydration warnings or duplicate-key warnings would show up as
    // console errors. Fail the test if any appear.
    const criticalErrors = errors.filter(
      (e) =>
        /hydrat/i.test(e) ||
        /Encountered two children with the same key/i.test(e) ||
        /Each child in a list should have a unique/i.test(e),
    );
    expect(criticalErrors, `Critical console errors:\n${criticalErrors.join("\n")}`).toEqual([]);

    // Also fail on hydration warnings even if logged at warn level
    const criticalWarnings = warnings.filter((w) =>
      /hydrat|same key/i.test(w),
    );
    expect(criticalWarnings, `Critical warnings:\n${criticalWarnings.join("\n")}`).toEqual([]);
  });
}

for (const { path, expect: bodyMatch } of RETIRED) {
  test(`${path} responds (soft-retired route)`, async ({ page }) => {
    const response = await page.goto(path);
    // /trends still serves a page in static export — must not 500.
    // Acceptable: 200 (retirement page renders) or 404 (page deleted).
    expect([200, 404]).toContain(response?.status() ?? 0);
    if (response?.status() === 200) {
      await expect(page.locator("body")).toContainText(bodyMatch);
    }
  });
}

test("nav exposes all primary routes", async ({ page }) => {
  await page.goto("/");
  // Sprint 035: asserted against the PRIMARY group of NAV_ITEMS in src/components/nav.tsx. The old
  // list (/board, /parlay-lab, /methodology, /responsible-use) predates the sim-led navigation —
  // /board and /parlay-lab are no longer in any nav surface, and /parlay-lab is now a redirect.
  for (const link of [
    "/today",
    "/simulate",
    "/markets",
    "/results",
    "/learn",
  ]) {
    await expect(
      page.locator(`a[href="${link}"], a[href="${link}/"]`).first(),
    ).toBeVisible();
  }
});

test("footer shows live mode (not 'demo data') when meta.isDemo is false", async ({
  page,
}) => {
  await page.goto("/");
  // Footer is on every page. When live, "demo data" should NOT appear.
  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(/live data/i);

  // If we are live, "demo data" should not appear in the footer's
  // visible data sources list. (We don't have programmatic access to
  // meta here, so we infer from the visible mode label.)
  const modeText = await footer.getByText(/live data|demo data/i).first().textContent();
  if (modeText && /live/i.test(modeText)) {
    // Verify the data sources section does NOT list "demo data"
    const sourcesSection = footer.locator("ul").first();
    await expect(sourcesSection).not.toContainText(/demo data/i);
  }
});

// Sprint 035: the suggested-card lobby moved to /picks; these aliases must not break old links.
for (const { path, lands } of REDIRECTS) {
  test(`${path} redirects to its current home`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await page.waitForURL(lands, { timeout: 10_000 });
    await expect(page.locator("h1").first()).toBeVisible();
  });
}
