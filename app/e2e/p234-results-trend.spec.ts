/**
 * THE TREND, AND THE WAYS A RECORD CHART LIES — Program 234 · Release F.
 *
 * The unit suite proves the series arithmetic. These prove the part only a browser can: that what is
 * DRAWN agrees with the headline above it, that a day with nothing on it is visibly a gap rather
 * than a zero, and — the one that matters most — that changing the filter cannot leave the previous
 * chart on screen under a new label.
 */
import { test, expect, type Page } from "@playwright/test";

const explorer = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Explore the record" }) });

async function parlays(page: Page) {
  await page.goto("/results/");
  const s = explorer(page);
  await s.scrollIntoViewIfNeeded();
  await s.getByLabel("Record type").selectOption("suggested-parlay");
  await s.getByRole("button", { name: "All history", exact: true }).click();
  return s;
}

const openTable = async (s: ReturnType<typeof explorer>) => {
  const sum = s.locator("summary", { hasText: "The numbers behind these charts" });
  if (await sum.count()) await sum.click();
};

test.describe("P234 · results trend", () => {
  test("the chart states its period, its population and how many days actually had a card", async ({ page }) => {
    const s = await parlays(page);
    await expect(s.getByRole("heading", { name: "Day by day" })).toBeVisible();
    await expect(s).toContainText(/\d+ of \d+ days had a settled card/);
    await expect(s).toContainText(/pooled from summed counts, never averaged across days/i);
  });

  test("THE TABLE UNDER THE CHART SUMS TO THE HEADLINE", async ({ page }) => {
    const s = await parlays(page);
    const head = /(\d+)-(\d+)[^\d]*(\d+) decisive/.exec((await s.innerText()).replace(/\s+/g, " "))!;
    const [w, l] = [Number(head[1]), Number(head[2])];

    await openTable(s);
    const rows = s.locator("table").filter({ has: page.locator("th", { hasText: "Cumulative" }) }).locator("tbody tr");
    let sw = 0, sl = 0;
    for (const r of await rows.all()) {
      const cell = await r.locator("td").first().innerText();
      const m = /^(\d+)-(\d+)$/.exec(cell.trim());
      if (m) { sw += Number(m[1]); sl += Number(m[2]); }
    }
    expect([sw, sl], "the daily rows must sum to the record stated above them").toEqual([w, l]);
  });

  test("A DAY WITH NO CARD READS 'no card' AND HAS NO RATE — never 0%", async ({ page }) => {
    const s = await parlays(page);
    await openTable(s);
    const rows = s.locator("table").filter({ has: page.locator("th", { hasText: "Cumulative" }) }).locator("tbody tr");
    let sawEmpty = false;
    for (const r of await rows.all()) {
      const cells = await r.locator("td").allInnerTexts();
      if (/no card/i.test(cells[0] ?? "")) {
        sawEmpty = true;
        expect(cells[1]?.trim(), "an empty day has zero decided outcomes").toBe("0");
        expect(cells[3]?.trim(), "and no day rate at all").toBe("—");
      }
    }
    expect(sawEmpty, "the committed range contains days with no settled card").toBe(true);
  });

  test("the cumulative column never falls across an empty day", async ({ page }) => {
    const s = await parlays(page);
    await openTable(s);
    const rows = s.locator("table").filter({ has: page.locator("th", { hasText: "Cumulative" }) }).locator("tbody tr");
    let prev: number | null = null;
    for (const r of await rows.all()) {
      const cells = await r.locator("td").allInnerTexts();
      const empty = /no card/i.test(cells[0] ?? "");
      const cum = /([\d.]+)%/.exec(cells[4] ?? "");
      if (!cum) continue;
      const v = Number(cum[1]);
      if (empty && prev != null) expect(v, "nothing happened, so the pooled rate cannot move").toBeCloseTo(prev, 5);
      prev = v;
    }
  });

  test("A FILTER WITH NO RECORDS CLEARS THE CHART — the previous one may not survive under a new label", async ({ page }) => {
    const s = await parlays(page);
    await expect(s.getByRole("heading", { name: "Day by day" })).toBeVisible();

    await s.getByLabel("From").fill("2020-01-01");
    await s.getByLabel("To", { exact: true }).fill("2020-01-02");
    await expect(s.getByRole("heading", { name: "Day by day" })).toHaveCount(0);
    await expect(s).toContainText(/No card in this selection/i);
  });

  test("switching to a population with no dated rows removes the trend entirely", async ({ page }) => {
    const s = await parlays(page);
    await expect(s.getByRole("heading", { name: "Day by day" })).toBeVisible();
    await s.getByLabel("Record type").selectOption("model-pick");
    await expect(s.getByRole("heading", { name: "Day by day" })).toHaveCount(0);
  });

  test("the chart carries its own caution about what a rising line is not", async ({ page }) => {
    const s = await parlays(page);
    await expect(s).toContainText(/not evidence the model learned/i);
    await expect(s).toContainText(/legs are not independent/i);
  });

  test("narrowing to one tier redraws the chart for that tier only", async ({ page }) => {
    const s = await parlays(page);
    await openTable(s);
    const rowsFor = async () =>
      (await s.locator("table").filter({ has: page.locator("th", { hasText: "Cumulative" }) }).locator("tbody tr").allInnerTexts()).join("|");
    const all = await rowsFor();
    await s.getByLabel("Risk tier").selectOption("longshot");
    await openTable(s);
    const one = await rowsFor();
    expect(one, "a tier filter must change the series, not merely its label").not.toBe(all);
  });
});
