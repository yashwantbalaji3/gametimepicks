/**
 * THE RESULTS JOURNEY — Program 233 · Release C.
 *
 * `/results` shipped with zero filter controls: no record-type selector, no sport filter, no risk
 * tier. Every number was a headline with no path to the rows underneath, and a reader who wanted
 * "how have the medium-risk UFC cards done?" had nowhere to go.
 *
 * These assertions are about the two things the journey must never do: blend populations, and turn
 * an absence of graded cards into a zero result.
 */
import { test, expect } from "@playwright/test";

const PAGE = "/results/";

async function explorer(page: import("@playwright/test").Page) {
  const heading = page.getByRole("heading", { name: "Explore the record" });
  await heading.scrollIntoViewIfNeeded();
  return page.locator("section").filter({ has: heading });
}

test.describe("P233 · results journey", () => {
  test("the record can be narrowed by type, sport and risk tier", async ({ page }) => {
    await page.goto(PAGE);
    const s = await explorer(page);
    await expect(s.getByLabel("Record type")).toBeVisible();
    await expect(s.getByLabel("Sport")).toBeVisible();

    /* Suggested parlays carry tiers; the control exists for them. */
    await s.getByLabel("Record type").selectOption("suggested-parlay");
    await expect(s.getByLabel("Risk tier")).toBeVisible();

    const rows = s.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
  });

  test("URL STATE is shareable — a filtered link reopens filtered", async ({ page }) => {
    await page.goto(`${PAGE}?record=suggested-parlay&sport=ufc&tier=medium`);
    const s = await explorer(page);
    await expect(s.getByLabel("Record type")).toHaveValue("suggested-parlay");
    await expect(s.getByLabel("Sport")).toHaveValue("ufc");
    await expect(s.getByLabel("Risk tier")).toHaveValue("medium");

    /* And changing a filter writes the URL back, so the next share carries the new view. */
    await s.getByLabel("Sport").selectOption("all");
    await expect(page).toHaveURL(/record=suggested-parlay/);
    await expect(page).not.toHaveURL(/sport=ufc/);
  });

  test("AN EMPTY COMBINATION SAYS SO — it never renders 0%", async ({ page }) => {
    /*
     * The most misleading number this page could show. A tier with nothing graded has no hit rate;
     * "0%" there reads as "this strategy loses every time".
     */
    await page.goto(PAGE);
    const s = await explorer(page);
    await s.getByLabel("Record type").selectOption("suggested-parlay");

    const sports = await s.getByLabel("Sport").locator("option").allInnerTexts();
    if (!sports.some((o) => /NFL/i.test(o))) test.skip(true, "no NFL stream in this ledger");
    await s.getByLabel("Sport").selectOption("nfl");
    await s.getByLabel("Risk tier").selectOption("low");

    await expect(s.getByText(/no settled cards yet/i).first()).toBeVisible();
    await expect(s.getByText("0 decisive")).toBeVisible();
    /* The claim: no percentage is rendered for an empty population. */
    await expect(s.locator("strong", { hasText: /^\d+\.\d%$/ })).toHaveCount(0);
  });

  test("POPULATIONS DO NOT BLEND — switching type replaces the record and its note", async ({ page }) => {
    await page.goto(PAGE);
    const s = await explorer(page);

    await s.getByLabel("Record type").selectOption("suggested-parlay");
    await expect(s.getByText(/A slip wins only if every leg does/i)).toBeVisible();

    await s.getByLabel("Record type").selectOption("model-pick");
    await expect(s.getByText(/No stake is recorded for these/i)).toBeVisible();
    /* Model picks have no risk tiers — the control must not linger from the previous population. */
    await expect(s.getByLabel("Risk tier")).toHaveCount(0);
  });

  test("every rate is shown with its denominator", async ({ page }) => {
    await page.goto(PAGE);
    const s = await explorer(page);
    await s.getByLabel("Record type").selectOption("model-pick");

    /* A percentage with no sample size beside it is the shape this journey exists to replace. */
    const pooled = s.getByText(/decisive/).first();
    await expect(pooled).toBeVisible();
    await expect(s.getByText(/\d+-\d+/).first()).toBeVisible();
  });
});
