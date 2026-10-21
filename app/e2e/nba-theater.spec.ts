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
 * Env: GTP_THEATER_BASE_URL (default http://localhost:4182), GTP_NBA_THEATER_DATE (default 2026-10-20),
 * GTP_NBA_THEATER_EVENT (default: the first game of the COMMITTED receipt).
 *
 * EXPECTATIONS DERIVE FROM THE COMMITTED PRIVATE RECEIPT (Cross-Product Prediction Consistency, 2026-10-20): the route
 * reads data/internal/research/nba/experimental-v1/forecasts/<date>.json, so the event, its stored runs, the overtime
 * check and the "no receipt yet" game are all read from that file here — never pinned runs, never the old dev copy.
 * The theater opens on the OFFICIAL REPRESENTATIVE SIMULATION (its box score is "Projected box score · official
 * representative simulation"); every other stored run is a what-if whose box score is "What-if box score ·
 * hypothetical" under the "Hypothetical scenario — not the forecast" banner.
 *
 * Covers, at 320 / 390 / 768 / 1440: the "Box score" control opens a labelled modal dialog (a full-height sheet below
 * 720 px) with the exact watermark, both teams' tables, focus moved in and contained, Escape closing it with focus back
 * on the opener; no page-level horizontal overflow; on phones the table scrolls sideways with the player column sticky;
 * tabular numerals; sort buttons ≥ 44 px with aria-sort following PTS / REB / AST / 3PM / MIN; DNP rows always last;
 * and the FINAL card's "Projected box score" button (Escape closes the box score, not the card).
 * V2 (2026-10-20): the three layers (official projection · simulated game · not modelled), the WITHHELD official team score
 * and win probability, the run-distance note, the what-if rule (the official layer key and the official card never
 * change when a what-if is chosen), keyboard layer-view radios, and prefers-reduced-motion.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const ENABLED = process.env.GTP_THEATER_E2E === "1" && process.env.GTP_THEATER_TARGET !== "public";
type Sample = { runIndex: number; label: string; overtimePeriods: number };
type Game = { providerEventId: string | number; forecast: { representativeSamples: Sample[] } };
type Receipt = { games: Game[]; runs?: { outcomes?: { providerEventId: string | number }[] }[] };
const DATE = process.env.GTP_NBA_THEATER_DATE ?? "2026-10-20";
const RECEIPT: Receipt | null = (() => {
  try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", `data/internal/research/nba/experimental-v1/forecasts/${DATE}.json`), "utf8")); } catch { return null; }
})();
const GAME = RECEIPT?.games.find((g) => !process.env.GTP_NBA_THEATER_EVENT || String(g.providerEventId) === process.env.GTP_NBA_THEATER_EVENT) ?? null;
const EVENT = GAME ? String(GAME.providerEventId) : "";
/** A slate game the receipt's run log names but the receipt does not hold yet (e.g. OUTSIDE_HORIZON), if any. */
const ABSENT = RECEIPT?.runs?.flatMap((r) => r.outcomes ?? []).map((o) => String(o.providerEventId)).find((id) => !RECEIPT.games.some((g) => String(g.providerEventId) === id)) ?? null;
const SAMPLES = GAME?.forecast.representativeSamples ?? [];
const PAGE = `/dev/simulation-theater/nba/${EVENT}/`;
const OFFICIAL_TITLE = "Projected box score · official representative simulation";
const WHAT_IF_TITLE = "What-if box score · hypothetical";
const WHAT_IF_BANNER = "Hypothetical scenario — not the forecast";
const WATERMARK = "PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL";
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const;
const SORT_KEYS = ["PTS", "REB", "AST", "3PM", "MIN"] as const;

test.skip(!ENABLED, "NBA theater spec: set GTP_THEATER_E2E=1 and serve a GTP_DEV_ROUTES=1 build or dev server (see header); never on the public target");
test.skip(ENABLED && !GAME, `no game in the committed receipt for ${DATE}${process.env.GTP_NBA_THEATER_EVENT ? ` matching ${process.env.GTP_NBA_THEATER_EVENT}` : ""}`);

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(PAGE + query, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-nba-theater][data-nba-ready]");
  return errors;
}
const dialog = (page: Page) => page.getByRole("dialog", { name: /box score/ });
/** A stat cell's own whole number (the official average rides in a nested span after it). */
const ownNumber = (td: Element) => Number(td.childNodes[0]?.textContent ?? "");
const focusInDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][data-nba-boxscore]'));
const sortButton = (page: Page, team: number, label: string) =>
  dialog(page).locator(".nba-bx-table").nth(team).locator('thead th[data-layer="simulated"] button.nba-bx-sort').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });

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
    // the run in the dialog is the run the theater has selected: by default the OFFICIAL REPRESENTATIVE, a stored run
    const run = await page.locator("[data-nba-theater]").getAttribute("data-nba-run");
    expect(SAMPLES.map((x) => String(x.runIndex))).toContain(run);
    await expect(d.locator(".nba-card-eyebrow")).toContainText(`run #${Number(run).toLocaleString("en-US")}`);
    await expect(d.locator(".nba-bx-title")).toHaveText(OFFICIAL_TITLE);
    // V2 three layers: official projection · simulated game (named supporting model) · not modelled; the official team
    // score is WITHHELD (official snapshot #1149) — no team comparison, no number — and the run's distance is reported
    for (const layer of ["official", "simulated", "not-modelled"]) await expect(d.locator(`.nba-bx-table thead th.nba-px-layerhead[data-layer="${layer}"]`)).toHaveCount(2);
    await expect(d.locator('[data-nba-px-teamscore="WITHHELD"]')).toContainText("Withheld");
    await expect(d.locator('[data-nba-px-winprob="WITHHELD"]')).toContainText("Withheld");
    await expect(d.locator("[data-st-compare]")).toHaveCount(0);
    await expect(d.locator("[data-nba-px-fit]")).toBeVisible();
    await expect(d.locator("[data-nba-px-explain]")).toContainText("One simulated game is not the median");

    // no page-level horizontal overflow; the dialog fits the viewport (full width as a sheet below 720 px)
    const metrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(metrics.sw).toBeLessThanOrEqual(metrics.iw + 1);
    const box = (await d.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(w + 0.5);
    if (w < 720) expect(Math.round(box.width)).toBe(w);
    else expect(box.width).toBeLessThanOrEqual(1040.5);
    // drawn on top along its bottom edge: the site's bottom navigation (phones) never covers it
    expect(await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"][data-nba-boxscore]')!;
      const r = el.getBoundingClientRect();
      const y = Math.min(r.bottom, innerHeight) - 12;
      return [0.25, 0.5, 0.75].every((fx) => { const hit = document.elementFromPoint(r.left + r.width * fx, y); return Boolean(hit && el.contains(hit)); });
    }), "nothing covers the box score").toBe(true);

    // tabular numerals on the stat cells
    const fvn = await d.locator('.nba-bx-table tbody td[data-layer="simulated"]').first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
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
  // the column's index in the column-header row (row 2 of thead lines up 1:1 with a played row's cells)
  const colIndex = async (label: string) => table.locator("thead tr:last-child > th").evaluateAll((ths, l) => ths.findIndex((th) => th.getAttribute("data-layer") === "simulated" && (th.querySelector("button")?.textContent ?? "").startsWith(l)), label);
  for (const k of SORT_KEYS) {
    const btn = sortButton(page, 0, k);
    await btn.click();
    // a column that is not the current sort starts descending (nextSort). MIN is the default sort, but by the time the loop
    // reaches it 3PM is sorted, so MIN is a new column again here.
    const want = "descending";
    await expect(table.locator(`thead th[aria-sort="${want}"]`)).toContainText(k);
    await expect(table.locator("thead th[aria-sort]")).toHaveCount(1);
    await expect(btn).toBeFocused();
    const idx = await colIndex(k);
    const rows = await table.locator("tbody tr[data-status]").evaluateAll((trs, i) => trs.map((tr) => ({
      status: tr.getAttribute("data-status"),
      v: tr.getAttribute("data-status") === "played" ? Number(tr.children[i]?.childNodes[0]?.textContent ?? "") : null,
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
  if (await dnp.count()) await expect(dnp.first().locator('td[data-layer="simulated"]')).toHaveText(/^DNP · 0 modeled minutes in this run$/);
});

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  test(`${w}px: the FINAL card offers the box score; Escape closes the box score and leaves the card`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // the default run (the official representative), seeked to its end
    const errors = await open(page, "?t=100000");
    const card = page.locator('[data-st-card="FINAL"]');
    await expect(card).toBeVisible();
    const btn = card.getByRole("button", { name: "Projected box score" });
    await btn.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.locator(".nba-bx-linescore thead th")).toContainText(["Q1", "Q2", "Q3", "Q4"]);
    // overtime, read from the receipt's own sample for the run on screen
    const run = Number(await page.locator("[data-nba-theater]").getAttribute("data-nba-run"));
    const ot = SAMPLES.find((x) => x.runIndex === run)?.overtimePeriods ?? 0;
    if (ot > 0) {
      await expect(d.locator(".nba-bx-linescore thead th.is-ot")).toHaveCount(ot);
      await expect(d.locator(".nba-card-eyebrow")).toContainText("SIMULATED FINAL/OT");
      await expect(d.locator('.nba-bx-table tfoot td[data-layer="simulated"]').first()).toHaveText(String(240 + 25 * ot));
    } else {
      await expect(d.locator(".nba-bx-linescore thead th.is-ot")).toHaveCount(0);
      await expect(d.locator('.nba-bx-table tfoot td[data-layer="simulated"]').first()).toHaveText(/^240/);
    }
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(card).toBeVisible();
    await expect(btn).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("the default run is the official representative; every other stored run is a labelled hypothetical what-if", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await open(page);
  const root = page.locator("[data-nba-theater]");
  const official = Number(await root.getAttribute("data-nba-run"));
  // the official numbers before any what-if is chosen: the theater's official card and the box score's official layer
  const officialCard = await page.locator("[data-st-official]").innerText();
  await page.getByRole("button", { name: "Box score", exact: true }).click();
  const officialKey = await dialog(page).locator("[data-nba-official-key]").getAttribute("data-nba-official-key");
  const officialLine = await dialog(page).locator("[data-nba-px-official]").innerText();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-st-role-note="official"]')).toContainText(/Official representative simulation · closest stored run to the official forecast · distance \d+\.\d\d/);
  await expect(page.locator("[data-st-official]")).toContainText("Official forecast");
  await expect(page.locator('.nba-chips [data-st-role="official"]')).toHaveCount(1);
  await expect(page.locator('.nba-chips [data-st-role="what-if"]')).toHaveCount(SAMPLES.length - 1);
  for (const s of SAMPLES.filter((x) => x.runIndex !== official)) {
    await page.goto(`${PAGE}?run=${s.runIndex}`, { waitUntil: "networkidle" });
    await page.waitForSelector(`[data-nba-theater][data-nba-ready][data-nba-run="${s.runIndex}"]`);
    await expect(page.locator('[data-st-role-note="what-if"] [data-st-whatif-banner]')).toHaveText(WHAT_IF_BANNER);
    await page.getByRole("button", { name: "What-if box score (hypothetical)" }).click();
    const d = dialog(page);
    await expect(d.locator(".nba-bx-title")).toHaveText(WHAT_IF_TITLE);
    await expect(d.locator("[data-st-whatif-banner]").first()).toHaveText(WHAT_IF_BANNER);
    expect(await d.innerText()).not.toMatch(/projected/i);
    // choosing a what-if never changes an official number
    await expect(d.locator("[data-nba-official-key]")).toHaveAttribute("data-nba-official-key", officialKey!);
    expect(await d.locator("[data-nba-px-official]").innerText()).toBe(officialLine);
    await expect(d.locator("[data-nba-px-whatif-note]")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await page.locator("[data-st-official]").innerText()).toBe(officialCard);
  }
  expect(errors).toEqual([]);
});

for (const [w, h] of WIDTHS) {
  test(`${w}px: layer view radios work from the keyboard; the table never widens the page; reduced motion is honoured`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page);
    await page.getByRole("button", { name: "Box score", exact: true }).click();
    const d = dialog(page);
    const sim = d.getByRole("radio", { name: "Simulated game — one run" });
    await sim.focus();
    await expect(sim).toBeFocused();
    await page.keyboard.press("Space");
    await expect(sim).toBeChecked();
    await expect(d.locator('.nba-bx-table td[data-layer="official"]')).toHaveCount(0);
    await page.keyboard.press("ArrowRight"); // wraps to "Both layers" in a native radio group
    await expect(d.getByRole("radio", { name: "Both layers" })).toBeChecked();
    await expect(d.locator('.nba-bx-table td[data-layer="official"]').first()).toBeVisible();
    // the focus ring is visible on the focused radio
    const ring = await d.getByRole("radio", { name: "Both layers" }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(["solid", "auto"]).toContain(ring);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const dur = await d.locator("button").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(dur.split(",").every((x) => parseFloat(x) === 0)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("a slate game the committed receipt does not hold yet says so, with no court, score or box score", async ({ page }) => {
  test.skip(!ABSENT, "every slate game of the receipt's run log is in the receipt");
  await page.goto(`/dev/simulation-theater/nba/${ABSENT}/`, { waitUntil: "networkidle" });
  await expect(page.getByText("No official forecast receipt for this game yet").first()).toBeVisible();
  await expect(page.locator("[data-nba-theater]")).toHaveCount(0);
  await expect(page.locator("[data-nba-private-banner]")).toBeVisible();
});
