/**
 * Parlay Lab V2 · Smart Betslip browser verification on the DEV fixture route. LOCAL ONLY, opt-in.
 *
 * FIXTURE — not real picks, not real prices. The route (/dev/parlay-lab-fixture) renders the REAL TierBoard and
 * SmartBetslip over fixture cards (lib/parlays/v2/__fixtures__/lab-fixture-page.mjs), with a QUALIFIED High Risk card,
 * a fixed reader clock (`?now=<ISO>`, default 2026-10-19T18:00:00Z) and a `?scenario=none` day. It carries content only
 * when the server sets GTP_DEV_ROUTES=1, so in the default suite and in CI this file SKIPS.
 *
 *   GTP_DEV_ROUTES=1 <dev server or GTP_DEV_ROUTES=1 static export served on :4183>
 *   GTP_PARLAY_E2E=1 npx playwright test e2e/parlay-lab-v2.spec.ts --project=chromium
 *
 * Env: GTP_PARLAY_E2E=1 (opt in) · GTP_PARLAY_BASE_URL (default http://localhost:4183). The default config's
 * webServer (the 4173 export server) still starts and is unused by this file.
 *
 * Covers: fixture banner · add / remove / reorder legs · snapshot invalidation message · expired-price hiding under a
 * fixed clock · same-game exclusion message (slip) and same-game refusal (Medium tier) · the no-qualified state · no
 * outbound links and a disabled sportsbook handoff · 320 / 390 / 768 / 1440 px (no horizontal overflow, ≥44 px
 * controls) · no console errors.
 */
import { test, expect, type Page } from "@playwright/test";

const ENABLED = process.env.GTP_PARLAY_E2E === "1";
const BASE = process.env.GTP_PARLAY_BASE_URL ?? "http://localhost:4183";
const PAGE = "/dev/parlay-lab-fixture/";
const LABEL = "FIXTURE — not real picks, not real prices";
const EXPIRED_NOW = "2026-10-20T01:00:00.000Z"; // 7 h after the fixture prices were recorded
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const;

const TEXT = {
  priced: "Every leg shows the price it was recorded at.",
  changed: "You changed the slip, so its recorded prices no longer describe it. Re-verify before comparing.",
  hidden: "One or more prices cannot be verified, so they are hidden.",
  empty: "Your slip is empty. Open a card to compare its prices here.",
  sameGame: "Some legs are from the same game. Their outcomes move together, so no combined price is shown.",
  unavailable: "Combined price unavailable",
  notVerified: "Price not verified",
  expired: "Recorded more than 6 hours ago",
};
const LEG1 = "Fixture Pitcher 1 — Outs recorded Over 15.5";
const LEG2 = "Fixture Hosts 2 — Moneyline home";

test.skip(!ENABLED, "parlay lab v2 spec: set GTP_PARLAY_E2E=1 and serve a GTP_DEV_ROUTES=1 build or dev server (see header)");
test.use({ baseURL: BASE });

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
});
test.afterEach(() => { expect(errors, "no console errors").toEqual([]); });

async function open(page: Page, query = "") {
  await page.goto(`${PAGE}${query}`);
  await expect(page.locator('[data-fixture-ready="1"]')).toBeVisible();
}
const slip = (page: Page) => page.locator('section[aria-labelledby="smart-betslip-heading"]');
const slipLegs = (page: Page) => slip(page).getByRole("list", { name: "Legs in the compare slip" }).locator(":scope > li");
const status = (page: Page) => slip(page).getByRole("status");
const compareHigh = (page: Page) => page.getByRole("button", { name: "Compare this High Risk card in the slip" }).click();

test("the page is labelled a fixture and shows one QUALIFIED High Risk card", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-fixture-banner]")).toHaveText(LABEL);
  await expect(page.locator('[data-tier="high"]')).toHaveAttribute("data-tier-status", "QUALIFIED");
  for (const t of ["low", "medium", "longshot"]) await expect(page.locator(`[data-tier="${t}"]`)).toHaveAttribute("data-tier-status", "NO_QUALIFYING_PARLAY");
  await expect(status(page)).toHaveText(TEXT.empty);
});

test("open a card: legs prefilled at their recorded prices, snapshot current", async ({ page }) => {
  await open(page);
  await compareHigh(page);
  await expect(slipLegs(page)).toHaveCount(2);
  await expect(slip(page)).toHaveAttribute("data-slip-state", "PRICED_AS_RECORDED");
  await expect(status(page)).toContainText(TEXT.priced);
  await expect(slip(page)).toContainText("Combined: +320");
});

test("add a leg: the snapshot is invalidated and says so", async ({ page }) => {
  await open(page);
  await compareHigh(page);
  await page.locator('[data-add-leg="new-game"]').click();
  await expect(slipLegs(page)).toHaveCount(3);
  await expect(slip(page)).toHaveAttribute("data-slip-state", "PRICE_CHANGED_REVERIFY");
  await expect(status(page)).toHaveText(TEXT.changed);
  await expect(slip(page)).toContainText(`Combined: ${TEXT.unavailable}`);
  await expect(page.locator('[data-add-leg="new-game"]')).toBeDisabled();
});

test("remove a leg: the snapshot is invalidated", async ({ page }) => {
  await open(page);
  await compareHigh(page);
  await slip(page).getByRole("button", { name: `Remove ${LEG1} from the slip` }).click();
  await expect(slipLegs(page)).toHaveCount(1);
  await expect(slipLegs(page).first()).toContainText(LEG2);
  await expect(status(page)).toHaveText(TEXT.changed);
});

test("reorder legs: order changes and the snapshot is invalidated; edge buttons are disabled", async ({ page }) => {
  await open(page);
  await compareHigh(page);
  await expect(slip(page).getByRole("button", { name: `Move ${LEG1} up` })).toBeDisabled();
  await expect(slip(page).getByRole("button", { name: `Move ${LEG2} down` })).toBeDisabled();
  await slip(page).getByRole("button", { name: `Move ${LEG1} down` }).click();
  await expect(slipLegs(page).nth(0)).toContainText(LEG2);
  await expect(slipLegs(page).nth(1)).toContainText(LEG1);
  await expect(status(page)).toHaveText(TEXT.changed);
});

test("same game: the slip says so and withholds the combined price; the same-game card is refused on the board", async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-tier="medium"]')).toContainText("Two legs come from the same game");
  await compareHigh(page);
  await page.locator('[data-add-leg="same-game"]').click();
  await expect(slip(page)).toContainText(TEXT.sameGame);
  await expect(slip(page)).toContainText(`Combined: ${TEXT.unavailable}`);
});

test("fixed clock 7 h later: expired prices and their books are hidden", async ({ page }) => {
  await open(page, `?now=${encodeURIComponent(EXPIRED_NOW)}`);
  await expect(page.locator("[data-fixture-clock]")).toHaveAttribute("data-fixture-clock", EXPIRED_NOW);
  await compareHigh(page);
  await expect(slip(page)).toHaveAttribute("data-slip-state", "PRICE_NOT_VERIFIED");
  await expect(status(page)).toHaveText(TEXT.hidden);
  for (const li of await slipLegs(page).all()) {
    await expect(li).toContainText(TEXT.notVerified);
    await expect(li).toContainText(TEXT.expired);
    await expect(li).not.toContainText(/ at (DraftKings|FanDuel)/);
  }
  await expect(slip(page)).toContainText(`Combined: ${TEXT.unavailable}`);
});

test("no-qualified day: four honest empty tiers, nothing to compare", async ({ page }) => {
  await open(page, "?scenario=none");
  await expect(page.locator('[data-fixture-scenario="none"]')).toBeVisible();
  for (const t of ["low", "medium", "high", "longshot"]) {
    const s = page.locator(`[data-tier="${t}"]`);
    await expect(s).toHaveAttribute("data-tier-status", "NO_QUALIFYING_PARLAY");
    await expect(s).toContainText(/No qualifying parlay today/i);
  }
  await expect(page.getByRole("button", { name: /^Compare this .* card in the slip$/ })).toHaveCount(0);
  await expect(status(page)).toHaveText(TEXT.empty);
});

test("no outbound links; the sportsbook handoff is a disabled button", async ({ page }) => {
  await open(page);
  await compareHigh(page);
  const root = page.locator('[data-dev-route="parlay-lab-fixture"]');
  const hrefs = await root.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  const origin = new URL(BASE).origin;
  for (const h of hrefs) expect(new URL(h).origin, h).toBe(origin);
  const all = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href.toLowerCase()));
  for (const h of all) expect(h).not.toMatch(/draftkings|fanduel|betmgm|caesars|betrivers|fanatics|espnbet|bovada|betonline|mybookie/);
  const handoff = slip(page).locator("[data-handoff-status]");
  await expect(handoff).toBeDisabled();
  await expect(handoff).toHaveText("Sportsbook handoff not available");
});

for (const [w, h] of WIDTHS) {
  test(`${w}px: no horizontal overflow, controls ≥ 44 px, banner visible`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    await expect(page.locator("[data-fixture-banner]")).toBeVisible();
    await compareHigh(page);
    await page.locator('[data-add-leg="new-game"]').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
    const controls = slip(page).locator("button:not([disabled])");
    for (const b of await controls.all()) {
      const box = await b.boundingBox();
      expect(box, "control is rendered").not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });
}
