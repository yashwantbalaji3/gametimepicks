// The signup follows the board it advertises. It moved from the homepage to /board (Sprint 035), and
// again to /mlb/board when the stale NBA board was retired (2026-07-30 route audit). The assertions
// themselves are unchanged and run against the surface that actually mounts it.
import { test, expect } from "@playwright/test";

/**
 * Phase 13 e2e — Newsletter signup smoke.
 *
 * Verifies the newsletter form works end-to-end in the default
 * (no-provider) state. Behavior under a real provider should be
 * validated manually after wiring NEWSLETTER_CONFIG.
 *
 * Default state assertions:
 *   - Form is rendered on the home page
 *   - Invalid email triggers a validation error
 *   - Valid email shows the "coming soon" message (no provider configured)
 *   - The form does NOT pretend to capture the email (key requirement)
 *   - No third-party scripts are loaded for tracking
 */

test("the newsletter form renders where it actually lives (/mlb/board)", async ({ page }) => {
  await page.goto("/mlb/board/");
  // The signup uses the heading "Get a daily email when the model board refreshes."
  await expect(page.locator("body")).toContainText(/daily email|daily slate alerts/i);
  // Email input is present and typed correctly
  const input = page.locator("input[type='email']").first();
  await expect(input).toBeVisible();
  // Submit button is present
  const button = page.getByRole("button", { name: /^(subscribe|notify me)$/i }).first();
  await expect(button).toBeVisible();
});

test("invalid email shows validation error (no submission)", async ({
  page,
}) => {
  await page.goto("/mlb/board/");
  const input = page.locator("input[type='email']").first();
  await input.fill("not-an-email");
  const button = page.getByRole("button", { name: /^(subscribe|notify me)$/i }).first();

  // Watch for any fetch — there should be NO network request because
  // the email is invalid (validation fires client-side first).
  let networkCallCount = 0;
  page.on("request", (req) => {
    if (req.method() === "POST") networkCallCount++;
  });

  await button.click();
  await page.waitForTimeout(300);

  // SPRINT 035: the custom React message is unreachable for an invalid address. The input is
  // `type="email"` on a form with no `noValidate`, so the browser's native constraint validation
  // blocks submission BEFORE onSubmit runs — the handler that would set that message never fires.
  // The assertion that actually matters is preserved and is the security-relevant one: nothing is
  // submitted. Also assert the browser itself considers the field invalid, so this still fails if
  // the email type or the validation is ever removed.
  const isInvalid = await input.evaluate((el) => !(el as HTMLInputElement).checkValidity());
  expect(isInvalid).toBe(true);

  // No POST request should have been made
  expect(networkCallCount).toBe(0);
});

test("valid email in default (no-provider) state shows 'not live yet'", async ({
  page,
}) => {
  await page.goto("/mlb/board/");
  const input = page.locator("input[type='email']").first();
  await input.fill("test+phase13@example.com");
  const button = page.getByRole("button", { name: /^(subscribe|notify me)$/i }).first();
  await button.click();
  await page.waitForTimeout(300);

  // In the default config (provider="none"), the form returns a graceful
  // "thanks, daily slate alerts aren't live yet" state. We assert on
  // either of the two acceptable copy variants.
  await expect(page.locator("body")).toContainText(
    /aren't live yet|coming soon|we'll let you know|we'll announce/i,
  );

  // Verify NO third-party tracking script loaded as a side effect
  const trackingScripts = page.locator(
    'script[src*="googletag"], script[src*="facebook"], script[src*="hotjar"], script[src*="segment"]',
  );
  await expect(trackingScripts).toHaveCount(0);
});

test("compact newsletter on /board has its own form instance", async ({
  page,
}) => {
  await page.goto("/mlb/board/");
  // The compact variant on /board uses its own input id but should still
  // be a working form.
  const inputs = page.locator("input[type='email']");
  const count = await inputs.count();
  expect(count).toBeGreaterThanOrEqual(1);
  // Last one should be the compact form (after the board content)
  await inputs.last().fill("board+test@example.com");
  const buttons = page.getByRole("button", { name: /^(subscribe|notify me)$/i });
  await buttons.last().click();
  await page.waitForTimeout(300);
  // Should not crash; confirmation visible
  await expect(page.locator("body")).toContainText(
    /aren't live yet|coming soon|we'll let you know|we'll announce|check your email/i,
  );
});
