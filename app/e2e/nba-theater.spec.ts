/**
 * NBA Simulation Theater · PROJECTED FINAL BOX SCORE · browser verification of the DEV route. LOCAL ONLY, opt-in.
 *
 * The NBA Theater is a dev-only PRIVATE CANDIDATE (/dev/simulation-theater/nba/[eventId], GTP_DEV_ROUTES=1): public NBA
 * model output is blocked by the September preregistration (lib/simulation-theater/nba/feature-manifest.mjs). So this
 * file SKIPS in the default suite, in CI, and on the public target. To run it against a dev server (the coordinator's,
 * on 4182 by default):
 *
 *   GTP_DEV_ROUTES=1 <dev server on :4182>
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts e2e/nba-theater.spec.ts
 *
 * Env: GTP_THEATER_BASE_URL (default http://localhost:4182), GTP_NBA_THEATER_EVENT (default 401909090: OKC @ SA, whose
 * typical run #245 goes to overtime, so the OT column is exercised).
 *
 * Covers, at 320 / 390 / 768 / 1440: the "Box score" control opens a labelled modal dialog (a full-height sheet below
 * 720 px) with the exact watermark, both teams' tables, focus moved in and contained, Escape closing it with focus back
 * on the opener; no page-level horizontal overflow; on phones the table scrolls sideways with the player column sticky;
 * tabular numerals; sort buttons ≥ 44 px with aria-sort following PTS / REB / AST / 3PM / MIN; DNP rows always last;
 * and the FINAL card's "Projected box score" button (Escape closes the box score, not the card).
 */
import { test, expect, type Page } from "@playwright/test";

const ENABLED = process.env.GTP_THEATER_E2E === "1" && process.env.GTP_THEATER_TARGET !== "public";
const EVENT = process.env.GTP_NBA_THEATER_EVENT ?? "401909090";
const PAGE = `/dev/simulation-theater/nba/${EVENT}/`;
const WATERMARK = "PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL";
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const;
const SORT_KEYS = ["PTS", "REB", "AST", "3PM", "MIN"] as const;

test.skip(!ENABLED, "NBA theater spec: set GTP_THEATER_E2E=1 and serve a GTP_DEV_ROUTES=1 build or dev server (see header); never on the public target");

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(PAGE + query, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-nba-theater][data-nba-ready]");
  return errors;
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "Projected box score" });
const focusInDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][data-nba-boxscore]'));
const sortButton = (page: Page, team: number, label: string) =>
  dialog(page).locator(".nba-bx-table").nth(team).locator("thead th button.nba-bx-sort").filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });

for (const [w, h] of WIDTHS) {
  test(`${w}px: Box score opens a labelled dialog with the watermark, both teams and no page overflow; Escape returns focus`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page);
    const opener = page.getByRole("button", { name: "Box score", exact: true });
    await expect(opener).toBeVisible();
    await opener.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("aria-modal", "true");
    await expect(d.locator("[data-nba-boxscore-watermark]")).toHaveText(WATERMARK);
    expect(await focusInDialog(page)).toBe(true);
    await expect(d.locator(".nba-bx-table")).toHaveCount(2);
    await expect(d.locator("[data-nba-boxscore-provenance]")).toContainText(/Run #[\d,]+ of 10,000/);
    // the run in the dialog is the run the theater has selected
    const run = await page.locator("[data-nba-theater]").getAttribute("data-nba-run");
    await expect(d.locator(".nba-card-eyebrow")).toContainText(`run #${Number(run).toLocaleString("en-US")}`);

    // no page-level horizontal overflow; the dialog fits the viewport (full width as a sheet below 720 px)
    const metrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(metrics.sw).toBeLessThanOrEqual(metrics.iw + 1);
    const box = (await d.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(w + 0.5);
    if (w < 720) expect(Math.round(box.width)).toBe(w);
    else expect(box.width).toBeLessThanOrEqual(1040.5);

    // tabular numerals on the stat cells
    const fvn = await d.locator(".nba-bx-table tbody td").first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(fvn).toContain("tabular-nums");

    // sort targets are ≥ 44 px
    for (const k of SORT_KEYS) {
      const b = (await sortButton(page, 0, k).boundingBox())!;
      expect(b.height, k).toBeGreaterThanOrEqual(44);
      expect(b.width, k).toBeGreaterThanOrEqual(44);
    }

    // phones: the table scrolls sideways and the player-name column stays put
    if (w <= 390) {
      const scroller = d.locator(".nba-bx-team .nba-bx-scroll").first();
      const dims = await scroller.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(dims.sw).toBeGreaterThan(dims.cw);
      const name = scroller.locator("tbody th.nba-bx-name").first();
      const x0 = (await name.boundingBox())!.x;
      await scroller.evaluate((el) => { el.scrollLeft = 240; });
      await page.waitForTimeout(80);
      expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      expect(Math.abs((await name.boundingBox())!.x - x0)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }

    // Tab stays inside the dialog
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page), `Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("sorting: PTS / REB / AST / 3PM / MIN set aria-sort on their header, toggle direction, and keep DNP rows last", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole("button", { name: "Box score", exact: true }).click();
  const d = dialog(page);
  const table = d.locator(".nba-bx-table").first();
  await expect(table.locator('thead th[aria-sort="descending"]')).toContainText("MIN");
  const colIndex = async (label: string) => table.locator("thead th").evaluateAll((ths, l) => ths.findIndex((th) => (th.querySelector("button")?.textContent ?? "").startsWith(l)), label);
  for (const k of SORT_KEYS) {
    const btn = sortButton(page, 0, k);
    await btn.click();
    const want = k === "MIN" ? "ascending" : "descending"; // MIN starts sorted descending, so one click flips it
    await expect(table.locator(`thead th[aria-sort="${want}"]`)).toContainText(k);
    await expect(table.locator("thead th[aria-sort]")).toHaveCount(1);
    await expect(btn).toBeFocused();
    const idx = await colIndex(k);
    const rows = await table.locator("tbody tr").evaluateAll((trs, i) => trs.map((tr) => ({
      status: tr.getAttribute("data-status"),
      v: tr.getAttribute("data-status") === "played" ? Number((tr.children[i] as HTMLElement).textContent) : null,
    })), idx);
    const played = rows.filter((r) => r.status === "played").map((r) => r.v as number);
    for (let i = 1; i < played.length; i++) expect(want === "descending" ? played[i - 1] >= played[i] : played[i - 1] <= played[i], `${k} at ${i}`).toBe(true);
    const firstOther = rows.findIndex((r) => r.status !== "played");
    if (firstOther >= 0) expect(rows.slice(firstOther).every((r) => r.status !== "played")).toBe(true);
    await btn.click();
    await expect(table.locator(`thead th[aria-sort="${want === "descending" ? "ascending" : "descending"}"]`)).toContainText(k);
  }
  // both teams follow the one sort
  await expect(d.locator(".nba-bx-table").nth(1).locator("thead th[aria-sort]")).toHaveCount(1);
  // DNP is not 0: DNP rows carry no number
  const dnp = d.locator('tr[data-status="dnp"]');
  if (await dnp.count()) await expect(dnp.first().locator("td")).toHaveText(/^DNP · 0 modeled minutes in this run$/);
});

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  test(`${w}px: the FINAL card offers the box score; Escape closes the box score and leaves the card`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page, "?label=typical&t=100000");
    const card = page.locator('[data-st-card="FINAL"]');
    await expect(card).toBeVisible();
    const btn = card.getByRole("button", { name: "Projected box score" });
    await btn.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.locator(".nba-bx-linescore thead th")).toContainText(["Q1", "Q2", "Q3", "Q4"]);
    if (EVENT === "401909090") {
      await expect(d.locator(".nba-bx-linescore thead th.is-ot")).toHaveText("OT1");
      await expect(d.locator(".nba-card-eyebrow")).toContainText("SIMULATED FINAL/OT");
      await expect(d.locator(".nba-bx-table tfoot td").first()).toHaveText("265");
    }
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(card).toBeVisible();
    await expect(btn).toBeFocused();
    expect(errors).toEqual([]);
  });
}
