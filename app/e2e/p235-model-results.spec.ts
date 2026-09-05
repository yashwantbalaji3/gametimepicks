/**
 * THE FULL MODEL HISTORY, IN A BROWSER — Program 235 · Release D.
 *
 * The aggregate published 60 picks beside a 37,958-row denominator. These prove a reader can now
 * reach the rest: filter it, see the counts move, and open a single day's picks — and that the
 * numbers they see are the ones the rest of the site publishes.
 */
import { test, expect, type Page } from "@playwright/test";

const section = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Every settled model pick" }) });

const open = async (page: Page) => {
  await page.goto("/results/model-audit/");
  const s = section(page);
  await s.scrollIntoViewIfNeeded();
  return s;
};

test.describe("P235 · full model results", () => {
  test("the whole population is stated, not a sample", async ({ page }) => {
    const s = await open(page);
    await expect(s).toContainText(/All [\d,]+ graded picks across \d+ settled days/);
    await expect(s).toContainText(/not a sample of them/i);
    await expect(s).toContainText(/Pushes are neither a win nor a loss/i);
  });

  test("THE HEADLINE MATCHES THE PUBLISHED AGGREGATE", async ({ page }) => {
    const s = await open(page);
    /* Read the SUMMARY block, not the whole section: a loose scan matched the "2026-05" of a date
       before it reached the record and compared 2026 against 19,015. */
    const text = (await s.locator("div").filter({ hasText: /decisive/ }).first().innerText()).replace(/\s+/g, " ");
    const rec = /(\d{1,3}(?:,\d{3})+)-(\d{1,3}(?:,\d{3})+)/.exec(text);
    expect(rec, `no record in the summary block: ${text.slice(0, 160)}`).not.toBeNull();
    const wins = Number(rec![1].replace(/,/g, ""));
    const losses = Number(rec![2].replace(/,/g, ""));
    /* The same counts the audit page's own aggregate reports. */
    expect(wins).toBe(19015);
    expect(losses).toBe(18943);
    const dec = /([\d,]+) decisive/.exec(text);
    expect(Number(dec![1].replace(/,/g, ""))).toBe(wins + losses);
  });

  test("A DATE RANGE NARROWS THE NUMBER, not just the label", async ({ page }) => {
    const s = await open(page);
    const readDecisive = async () => {
      const m = /([\d,]+) decisive/.exec((await s.innerText()).replace(/\s+/g, " "));
      return Number(m![1].replace(/,/g, ""));
    };
    const all = await readDecisive();
    await s.getByLabel("From").fill("2026-09-01");
    await s.getByLabel("To", { exact: true }).fill("2026-09-04");
    await page.waitForTimeout(150);
    const narrowed = await readDecisive();
    expect(narrowed).toBeLessThan(all);
    expect(narrowed).toBeGreaterThan(0);
  });

  test("A MARKET FILTER NARROWS IT TOO, and cannot exceed the whole", async ({ page }) => {
    const s = await open(page);
    const readDecisive = async () => {
      const m = /([\d,]+) decisive/.exec((await s.innerText()).replace(/\s+/g, " "));
      return Number(m![1].replace(/,/g, ""));
    };
    const all = await readDecisive();
    const options = await s.getByLabel("Market").locator("option").all();
    const values = (await Promise.all(options.map((o) => o.getAttribute("value")))).filter((v) => v && v !== "all") as string[];
    expect(values.length, "no market families are offered").toBeGreaterThan(0);
    let summed = 0;
    for (const v of values) {
      await s.getByLabel("Market").selectOption(v);
      await page.waitForTimeout(120);
      const n = await readDecisive();
      expect(n).toBeLessThanOrEqual(all);
      summed += n;
    }
    expect(summed, "the market families must partition the whole, not overlap it").toBe(all);
  });

  test("A REVERSED RANGE IS REFUSED", async ({ page }) => {
    const s = await open(page);
    await s.getByLabel("From").fill("2026-09-01");
    await s.getByLabel("To", { exact: true }).fill("2026-06-01");
    await expect(s.getByRole("alert")).toContainText(/starts after it ends/i);
  });

  test("OPENING A DAY FETCHES THAT DAY AND SHOWS ITS PICKS", async ({ page }) => {
    const s = await open(page);
    const opener = s.getByRole("button", { name: /Open \d+ picks/ }).first();
    await expect(opener).toBeVisible();
    const label = await opener.innerText();
    const expected = Number(/Open (\d+) picks/.exec(label)![1]);
    await opener.click();

    /* The detail table appears with that day's rows — player, game, selection, both probabilities. */
    const rows = s.locator("table").last().locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const count = await rows.count();
    expect(count).toBe(Math.min(expected, 250));
    await expect(rows.first()).toContainText(/%/);
  });

  test("an empty combination says so rather than showing a rate", async ({ page }) => {
    const s = await open(page);
    await s.getByLabel("From").fill("2020-01-01");
    await s.getByLabel("To", { exact: true }).fill("2020-01-02");
    await page.waitForTimeout(150);
    await expect(s).toContainText(/No decided pick in this selection/i);
  });

  test("filters survive a share and a refresh", async ({ page }) => {
    const s = await open(page);
    await s.getByLabel("Market").selectOption("batter_hits");
    await expect(page).toHaveURL(/market=batter_hits/);
    const shared = page.url();
    await page.goto(shared);
    const s2 = section(page);
    await s2.scrollIntoViewIfNeeded();
    await expect(s2.getByLabel("Market")).toHaveValue("batter_hits");
  });
});
