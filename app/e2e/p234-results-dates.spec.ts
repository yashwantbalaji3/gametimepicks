/**
 * THE RECORD, ASKED BY DATE — Program 234 · Release E.
 *
 * P233 made `/results` filterable by record type, sport and risk tier. This adds the dimension a
 * reader actually asks first — "what happened over this period" — and the drill-down to the slips
 * behind whatever the filters land on.
 *
 * The assertions are about the ways a date filter lies: showing an unfiltered number under a
 * filtered label, reading an empty period as 0%, silently widening a reversed range, or offering the
 * control at all for a population whose ledger has no dated rows to filter.
 */
import { test, expect, type Page } from "@playwright/test";

const explorer = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Explore the record" }) });

async function parlays(page: Page) {
  await page.goto("/results/");
  const s = explorer(page);
  await s.scrollIntoViewIfNeeded();
  await s.getByLabel("Record type").selectOption("suggested-parlay");
  return s;
}

/** "3-10" style records anywhere in a container. */
const records = async (loc: ReturnType<Page["locator"]>) =>
  [...(await loc.innerText()).matchAll(/\b(\d+)-(\d+)\b/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

test.describe("P234 · results by date", () => {
  test("the date controls exist, and state what a date MEANS", async ({ page }) => {
    const s = await parlays(page);
    await expect(s.getByLabel("From")).toBeVisible();
    await expect(s.getByLabel("To", { exact: true })).toBeVisible();
    for (const p of ["Today", "Yesterday", "Last 7 days", "Last 30 days", "All history"]) {
      await expect(s.getByRole("button", { name: p, exact: true })).toBeVisible();
    }
    /* The attribution basis sits beside the control that depends on it, not in a footer. */
    await expect(s).toContainText(/published and graded as a cohort/i);
    await expect(s).toContainText(/legs cross midnight stays in one day/i);
  });

  test("A POPULATION WITH NO DATED ROWS GETS NO DATE CONTROL, and is told why", async ({ page }) => {
    await page.goto("/results/");
    const s = explorer(page);
    await s.scrollIntoViewIfNeeded();
    await s.getByLabel("Record type").selectOption("model-pick");
    await expect(s.getByLabel("From")).toHaveCount(0);
    await expect(s).toContainText(/publishes a total rather than the individual dated rows/i);
  });

  test("THE HEADLINE AND THE TABLE COUNT THE SAME PERIOD", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "Last 7 days", exact: true }).click();

    const headline = /(\d+)-(\d+)\s*\n?\s*(\d+) decisive/.exec((await s.innerText()).replace(/\s+/g, " "))
      ?? /(\d+)-(\d+)[^\d]*(\d+) decisive/.exec((await s.innerText()).replace(/\s+/g, " "));
    expect(headline, "the selected period must state a record").not.toBeNull();
    const [, w, l, dec] = headline!.map(Number) as unknown as number[];
    expect(w + l).toBe(dec);

    /* Every per-sport row must sum to that headline — the defect this replaces showed a 7-day
       headline above all-time rows, with nothing saying they counted different periods. */
    /* The RECORD cell only. Scanning the whole row also matched the Period column's dates —
       "2026-08-30" parsed as 2026-08, which summed to a four-figure record. */
    const rows = s.locator("table").first().locator("tbody tr");
    let sw = 0, sl = 0;
    for (const r of await rows.all()) {
      const m = /\b(\d+)-(\d+)\b/.exec(await r.locator("td").first().innerText());
      if (m) { sw += Number(m[1]); sl += Number(m[2]); }
    }
    expect([sw, sl], "the per-sport rows must sum to the headline for the same period").toEqual([w, l]);
  });

  test("narrowing the range NARROWS THE NUMBER", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "All history", exact: true }).click();
    const all = (await records(s))[0];
    await s.getByRole("button", { name: "Last 7 days", exact: true }).click();
    const week = (await records(s))[0];
    expect(week[0] + week[1], "a narrower period cannot contain more decided cards than all of history")
      .toBeLessThanOrEqual(all[0] + all[1]);
  });

  test("A REVERSED RANGE IS REFUSED, not silently widened", async ({ page }) => {
    const s = await parlays(page);
    await s.getByLabel("From").fill("2026-09-01");
    await s.getByLabel("To", { exact: true }).fill("2026-08-01");
    await expect(s.getByRole("alert")).toContainText(/starts after it ends/i);
    /* And no record is shown while the range is nonsense. */
    await expect(s).not.toContainText(/decisive ·/);
  });

  test("AN EMPTY PERIOD IS EMPTY, NOT 0%", async ({ page }) => {
    const s = await parlays(page);
    await s.getByLabel("From").fill("2020-01-01");
    await s.getByLabel("To", { exact: true }).fill("2020-01-02");
    await expect(s).toContainText(/No card in this selection\./i);
    await expect(s).not.toContainText(/0\.0%/);
  });

  test("URL STATE survives a share and a refresh, and back walks the filters", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "Last 7 days", exact: true }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
    const shared = page.url();

    await page.goto(shared);
    const s2 = explorer(page);
    await s2.scrollIntoViewIfNeeded();
    await expect(s2.getByLabel("From")).not.toHaveValue("");

    await s2.getByRole("button", { name: "All history", exact: true }).click();
    await expect(page).not.toHaveURL(/from=/);
    await page.goBack();
    await expect(page).toHaveURL(/from=/);
  });

  test("THE GRID'S POPULATED CELLS LEAD TO THEIR OWN SLIPS", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "All history", exact: true }).click();
    const cell = s.getByRole("button", { name: /Show the \d+ \w+ \w+ cards? for/ }).first();
    await expect(cell).toBeVisible();
    const label = await cell.getAttribute("aria-label");
    const expected = Number(/Show the (\d+)/.exec(label!)![1]);
    await cell.click();

    /* The slip table below now holds exactly the cards that cell counted. */
    await expect(s.getByRole("heading", { name: new RegExp(`The ${expected} cards? behind this record`) })).toBeVisible();
    const slipRows = s.locator("table").last().locator("tbody tr");
    await expect(slipRows).toHaveCount(Math.min(expected, 50));
  });

  test("every slip row carries the evidence a reader needs to check it", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "All history", exact: true }).click();
    const first = s.locator("table").last().locator("tbody tr").first();
    await expect(first).toContainText(/\d{4}-\d{2}-\d{2}/);        // when
    await expect(first).toContainText(/slip_|-\d{4}-\d{2}-\d{2}/); // which slip
    await expect(first).toContainText(/win|loss|pending|push|void/i); // how it settled
  });

  test("THE SPORT FILTER FILTERS THE TABLE, not only the headline", async ({ page }) => {
    /*
     * My own date tests all ran with "all sports" selected, so none of them exercised narrowing —
     * and the per-sport table went on listing every sport beside a headline that had narrowed to
     * one. P233's empty-combination guard caught it. This is that gap, closed.
     */
    const s = await parlays(page);
    await s.getByRole("button", { name: "All history", exact: true }).click();

    const options = await s.getByLabel("Sport").locator("option").all();
    const values = (await Promise.all(options.map((o) => o.getAttribute("value")))).filter((v) => v && v !== "all") as string[];
    test.skip(!values.length, "no sport streams in this ledger");

    for (const sport of values.slice(0, 3)) {
      await s.getByLabel("Sport").selectOption(sport);
      const rows = s.locator("table").first().locator("tbody tr");
      const headers = await rows.locator("th").allInnerTexts();
      expect(headers.length, `${sport} produced no row at all — an empty stream is still information`).toBeGreaterThan(0);
      expect(headers.length, `selecting ${sport} still lists ${headers.length} sports`).toBe(1);
    }
  });

  test("an empty grid cell is a dash, never a zero record", async ({ page }) => {
    const s = await parlays(page);
    await s.getByRole("button", { name: "All history", exact: true }).click();
    const grid = s.locator("table").nth(1);
    await expect(grid).toContainText("—");
    await expect(s).toContainText(/A dash is an empty cell/i);
  });
});
