/**
 * Market Center navigation + pagination coverage (Sprint 030 · Phase 4).
 *
 * Kept in its own spec rather than appended to navigation.spec.ts because these assertions are about
 * a data-dense interactive surface, not about routing: the properties worth protecting are that
 * every matching row stays reachable and that a filter count keeps describing the DATASET rather
 * than the visible page. Those are the two ways a paginated list quietly starts lying.
 *
 * Run: cd app && npx playwright test e2e/markets.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }: { page: Page }) => {
  errors.length = 0;
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
});

test("the Market Center loads with a heading and no console errors", async ({ page }) => {
  await page.goto("/markets/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByText(/Sportsbook prices next to our simulations/i)).toBeVisible();
  expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
});

test("the snapshot frame is stated, never left implicit", async ({ page }) => {
  await page.goto("/markets/");
  // Either "Current snapshot" or an explicit historical frame — but always one of them, so the
  // reader is never left to assume the prices are today's.
  await expect(page.getByText(/Current snapshot|Snapshot from \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
});

test("nav exposes the Market Center", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href="/markets"], a[href="/markets/"]').first()).toBeVisible();
});

test("every matching row is reachable — no arbitrary render ceiling", async ({ page }) => {
  await page.goto("/markets/");
  await page.getByRole("button", { name: /Player props/i }).click();

  const range = page.getByText(/\d+–\d+ of [\d,]+ matching rows?/);
  await expect(range).toBeVisible();
  const first = (await range.textContent()) ?? "";
  const total = Number((first.match(/of ([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  expect(total).toBeGreaterThan(200); // the old cap would have hidden these

  // Paging forward advances the window rather than repeating it.
  await page.getByRole("button", { name: "Next" }).click();
  const second = (await range.textContent()) ?? "";
  expect(second).not.toEqual(first);
  expect(second).toContain(`of ${first.match(/of ([\d,]+)/)?.[1]}`);
});

test("a filter reports the dataset count and resets to the first page", async ({ page }) => {
  await page.goto("/markets/");
  await page.getByRole("button", { name: /Player props/i }).click();

  // Read the dataset-wide count off the mode filter itself.
  const modeButton = page.getByRole("button", { name: /Model \+ market \(\d+\)/ });
  const label = (await modeButton.textContent()) ?? "";
  const declared = Number(label.match(/\((\d+)\)/)?.[1] ?? "0");
  expect(declared).toBeGreaterThan(0);

  // Move off page 1 first, so the reset is actually exercised.
  await page.getByRole("button", { name: "Next" }).click();
  await modeButton.click();

  const range = page.getByText(/\d+–\d+ of [\d,]+ matching rows?/);
  const text = (await range.textContent()) ?? "";
  const shown = Number((text.match(/of ([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  expect(shown).toBe(declared); // the count describes the dataset, not the page
  expect(text).toMatch(/^1–/); // and filtering returned to the first page

  // The mode counts themselves must not shrink to the filtered subset.
  await expect(page.getByRole("button", { name: /Market only \(\d+\)/ })).toBeVisible();
});

test("a search with no matches degrades honestly instead of showing an empty page", async ({ page }) => {
  await page.goto("/markets/");
  await page.getByRole("button", { name: /Player props/i }).click();
  await page.getByLabel("Search player or team").fill("zzzzz-no-such-player");
  await expect(page.getByText(/No rows match these filters/i)).toBeVisible();
});

test("no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/markets/");
  await page.getByRole("button", { name: /Player props/i }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
