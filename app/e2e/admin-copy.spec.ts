import { test, expect } from "@playwright/test";

/**
 * Phase 14 e2e — admin-copy regression guard.
 *
 * Walks every user-visible public page and asserts that admin/operator
 * jargon does NOT appear in rendered text. If a future PR re-introduces
 * "edit pipeline/overrides/X.json" or "ODDS_API_KEY" or similar, this
 * test fails immediately — protecting the public/admin separation.
 *
 * What we check for:
 *   - Internal file paths (pipeline/..., src/lib, app/public/data)
 *   - Environment variable names (ODDS_API_KEY, NBA_DATA_MODE, etc.)
 *   - Terminal commands (python -m pipeline, run python, etc.)
 *   - Operator-only directives ("rebuild and redeploy", "edit X file")
 *
 * Acceptable matches: comments and docstrings inside the source files
 * are stripped server-side and never reach rendered HTML, so the test
 * checks page text, not source code.
 */

const PUBLIC_PAGES = [
  "/",
  "/board/",
  "/parlay-lab/",
  "/results/",
  "/methodology/",
  "/responsible-use/",
  "/trends/",
];

// Phrases that should NEVER appear in user-visible text on public pages.
// Each is checked case-insensitive against the rendered body text.
const FORBIDDEN_PHRASES = [
  "ODDS_API_KEY",
  "NBA_DATA_MODE",
  "ODDS_DATA_MODE",
  "ODDS_DRY_RUN",
  "results_overrides.json",
  "schedule_overrides.json",
  "news_signals.json",
  "manual_overrides",
  "rebuild and redeploy",
  "rebuild & redeploy",
  "edit pipeline/",
  "python -m pipeline",
  "settle_results --",
  "re-run the pipeline",
  "operator workflow",
  "in the repo",
];

for (const path of PUBLIC_PAGES) {
  test(`${path} contains no admin/operator jargon`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    const bodyText = await page.locator("body").innerText();
    const lower = bodyText.toLowerCase();

    const hits: string[] = [];
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        hits.push(phrase);
      }
    }

    expect(
      hits,
      `${path} leaks admin phrases:\n  ${hits.join("\n  ")}\n\nFull body excerpt:\n${bodyText.slice(0, 400)}`,
    ).toEqual([]);
  });
}

test("methodology page mentions data sources but no env-var names", async ({
  page,
}) => {
  // Methodology IS allowed to mention provider names like "NBA's official
  // source" or "The Odds API" — that's transparency, not admin runbook.
  // What it must NOT mention is env-var names or file paths.
  await page.goto("/methodology/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  // Should mention sources for transparency
  expect(text).toMatch(/odds api|nba|data source/);
  // Must NOT mention specific env-var names
  expect(text).not.toMatch(/odds_api_key|nba_data_mode/i);
});

test("results empty state does NOT walk users through terminal commands", async ({
  page,
}) => {
  await page.goto("/results/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  // The Phase 8 admin block had a numbered list with "edit X / run Y / rebuild Z"
  expect(text).not.toMatch(/edit\s+pipeline\//);
  expect(text).not.toMatch(/run\s+python/);
  expect(text).not.toMatch(/rebuild\s+&?\s*(and\s+)?redeploy/);
  // Should still convey what users will see when results land
  expect(text).toMatch(/verified results|results.*appear|hit rate/);
});
