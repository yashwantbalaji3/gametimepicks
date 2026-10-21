/**
 * NBA Simulation Theater · POSSESSION PLAYBACK · browser verification of the DEV route. LOCAL ONLY, opt-in.
 *
 * Route: /dev/simulation-theater/nba/<eventId>/possession/ (GTP_DEV_ROUTES=1 build or dev server). The public candidate
 * /nba/simulation/<eventId>/ is gated OFF (NBA_THEATER_PUBLIC_ENABLED = false), so it cannot be browsed; its flag-ON
 * render is covered by possession-render.test.mjs. This file SKIPS unless GTP_THEATER_E2E=1, and on the public target.
 *
 *   GTP_DEV_ROUTES=1 npm run build && npx serve -l 4182 out      (or a GTP_DEV_ROUTES=1 dev server on :4182)
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts e2e/possession-nba-theater.spec.ts
 *
 * Expectations derive from the COMMITTED private artifact data/internal/research/nba/theater-possession/<date>.json
 * (finals, linescores, kinds, official side) — never pinned numbers.
 * Covers: 320 / 390 / 768 / 1440 (no page overflow, both panels, labels); two matchups end to end (play at 8×, pause,
 * fast-forward, final card, scoreboard = stored final, linescore, reconciliation, box score PTS sums); keyboard only
 * (Tab, run radios with arrows, Space/K, "," ".", "[" "]", Home/End); prefers-reduced-motion (no animation, instant
 * play-by-play steps, the clock shows each play's own clock); the official panel byte-identical across every run;
 * one what-if end to end (the upset run's end card says the favoured side lost) and the overtime run's OT period.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

import { ENGINE_LABEL } from "../src/lib/simulation-theater/nba/possession/labels.mjs";

const ENABLED = process.env.GTP_THEATER_E2E === "1" && process.env.GTP_THEATER_TARGET !== "public";
const DATE = process.env.GTP_NBA_THEATER_DATE ?? "2026-10-20";
type Run = { kind: string; runIndex: number; final: [number, number]; periods: [number[], number[]]; overtimePeriods: number };
type Game = { providerEventId: string; home: { abbr: string }; away: { abbr: string }; official: { winnerSide: "HOME" | "AWAY" }; runs: Run[] };
const ART: { games: Game[] } | null = (() => {
  try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", `data/internal/research/nba/theater-possession/${DATE}.json`), "utf8")); } catch { return null; }
})();
const GAMES = ART?.games ?? [];
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const;
// the engine identity text lives in labels.mjs (one source for the UI, the unit tests and this spec)
const ENGINE = ENGINE_LABEL;
const WHAT_IF_BANNER = "Hypothetical scenario — not the forecast";
const url = (id: string, q = "") => `/dev/simulation-theater/nba/${id}/possession/${q}`;

test.skip(!ENABLED, "possession theater spec: set GTP_THEATER_E2E=1 and serve a GTP_DEV_ROUTES=1 build (see header); never on the public target");
test.skip(ENABLED && GAMES.length < 2, `need ≥ 2 games in the committed possession artifact for ${DATE}`);

async function open(page: Page, id: string, q = "") {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url(id, q), { waitUntil: "networkidle" });
  await page.waitForSelector("[data-nbp-theater][data-nbp-ready]");
  return errors;
}
const root = (page: Page) => page.locator("[data-nbp-theater]");
const official = (page: Page) => page.locator("section[data-nbp-official]");
const score = async (page: Page) => ({ home: Number(await page.locator('[data-nbp-score="home"]').textContent()), away: Number(await page.locator('[data-nbp-score="away"]').textContent()) });
const chip = (page: Page, kind: string) => page.locator(`[data-nbp-run-kind="${kind}"]`);

for (const [w, h] of WIDTHS) {
  test(`${w}px: both panels, the engine label and the banner render; no page-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page, GAMES[0].providerEventId);
    await expect(page.locator("[data-nbp-banner]")).toBeVisible();
    await expect(page.locator("[data-nbp-engine]")).toHaveText(ENGINE);
    await expect(official(page)).toBeVisible();
    await expect(page.locator("section[data-nbp-outcome]")).toBeVisible();
    await expect(official(page)).toContainText("Withheld");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // controls are touch-sized
    for (const b of await page.locator(".nbp-transport button").all()) { const bb = await b.boundingBox(); expect(bb!.height).toBeGreaterThanOrEqual(44); }
    expect(errors).toEqual([]);
  });
}

for (const g of GAMES.slice(0, 2)) {
  test(`${g.away.abbr} @ ${g.home.abbr}: plays at 8×, pauses, fast-forwards by quarter, ends on the stored final with a reconciled box score`, async ({ page }) => {
    const def = g.runs.find((r) => r.kind === "default")!;
    await open(page, g.providerEventId);
    await expect(root(page)).toHaveAttribute("data-nbp-run", "default");
    expect(await score(page)).toEqual({ home: 0, away: 0 });
    await page.locator('[data-nbp-speed="8"]').click();
    await expect(page.locator('[data-nbp-speed="8"]')).toHaveAttribute("aria-checked", "true");
    await page.locator("[data-nbp-play-toggle]").click();
    await page.waitForTimeout(2500);
    await page.locator("[data-nbp-play-toggle]").click(); // pause
    const paused = await score(page);
    expect(paused.home + paused.away).toBeGreaterThan(0);
    const clock = await page.locator("[data-nbp-clock]").textContent();
    await page.waitForTimeout(600);
    expect(await page.locator("[data-nbp-clock]").textContent()).toBe(clock); // paused = frozen
    expect(await page.locator("[data-nbp-feed] li").count()).toBeGreaterThan(3);
    // fast-forward to the next quarter: the period label moves on
    await page.getByRole("button", { name: "Fast-forward to the next quarter" }).click();
    await expect(page.locator("[data-nbp-period]")).toHaveText(/Q2|Q3|Q4/);
    // skip to the final
    await page.getByRole("button", { name: "Skip to the final" }).click();
    await expect(root(page)).toHaveAttribute("data-nbp-phase", "FINAL");
    await expect(page.locator("[data-nbp-endcard]")).toBeVisible();
    expect(await score(page)).toEqual({ home: def.final[0], away: def.final[1] });
    // linescore = the stored periods; reconciliation passes; box PTS sums to the final
    const cells = await page.locator("[data-nbp-linescore] tbody tr").nth(1).locator("td").allTextContents(); // home row (away first)
    expect(cells.slice(1, -1).map(Number)).toEqual(def.periods[0]);
    await expect(page.locator("[data-nbp-reconcile]")).toHaveAttribute("data-nbp-reconcile", "pass");
    for (const [side, t] of [["home", 0], ["away", 1]] as const) {
      const pts = await page.locator(`[data-nbp-box-team="${side}"] tbody tr`).evaluateAll((rows) => rows.map((r) => Number(r.querySelectorAll("td")[2]?.textContent ?? "0") || 0));
      expect(pts.reduce((a, b) => a + b, 0)).toBe(def.final[t]);
    }
    await expect(page.locator("[data-nbp-box]")).toHaveAttribute("data-nbp-box", "final");
  });
}

test("keyboard only: Tab reaches the run radios and the transport; arrows switch runs; K / . / ] / End / Home drive playback", async ({ page }) => {
  const g = GAMES[0];
  await open(page, g.providerEventId);
  const selected = page.locator('[role="radiogroup"][aria-label="Simulated runs"] [aria-checked="true"]');
  await selected.focus();
  await page.keyboard.press("ArrowRight");
  await expect(root(page)).not.toHaveAttribute("data-nbp-run", "default");
  await page.keyboard.press("ArrowLeft");
  await expect(root(page)).toHaveAttribute("data-nbp-run", "default");
  // shortcuts act from a non-button element inside the theater
  await page.locator("[data-nbp-engine]").click();
  const feed = () => page.locator("[data-nbp-feed] li").count();
  const before = await feed();
  await page.keyboard.press(".");
  await page.keyboard.press(".");
  expect(await feed()).toBeGreaterThan(before);
  await page.keyboard.press("]");
  await expect(page.locator("[data-nbp-period]")).toHaveText(/Q2/);
  await page.keyboard.press("k");
  await expect(page.locator("[data-nbp-play-toggle]")).toHaveText("Pause");
  await page.keyboard.press("k");
  await expect(page.locator("[data-nbp-play-toggle]")).toHaveText("Play");
  await page.keyboard.press("End");
  await expect(root(page)).toHaveAttribute("data-nbp-phase", "FINAL");
  await page.keyboard.press("Home");
  expect(await score(page)).toEqual({ home: 0, away: 0 });
  // the play button itself is reachable by Tab and operable with Space
  await page.locator("[data-nbp-play-toggle]").focus();
  await page.keyboard.press(" ");
  await expect(page.locator("[data-nbp-play-toggle]")).toHaveText("Pause");
});

test("prefers-reduced-motion: no animation, playback steps play by play, the clock shows each play's own clock", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, GAMES[1].providerEventId);
  await expect(root(page)).toHaveAttribute("data-nbp-motion", "off");
  await page.locator('[data-nbp-speed="8"]').click();
  await page.locator("[data-nbp-play-toggle]").click();
  await page.waitForTimeout(1500);
  await page.locator("[data-nbp-play-toggle]").click();
  // if the pause landed on a quarter break (no clock shown), step to the next play
  await page.locator("[data-nbp-engine]").click();
  for (let i = 0; i < 5 && (await root(page).getAttribute("data-nbp-phase")) !== "LIVE"; i += 1) await page.keyboard.press(".");
  const top = page.locator("[data-nbp-feed] li").first();
  const when = (await top.locator(".nbp-feed-when").textContent())!.replace(/^\S+\s/, "");
  await expect(page.locator("[data-nbp-clock]")).toContainText(when); // step mode: clock = the latest play's clock
  const anim = await top.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe("none");
  const dot = await page.locator(".nbp-poss-dot").evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(dot).toMatch(/^0s/);
});

test("two-panel immutability: the official panel is byte-identical for the default run and every what-if; what-ifs carry the banner", async ({ page }) => {
  for (const g of GAMES.slice(0, 2)) {
    await open(page, g.providerEventId);
    const base = await official(page).evaluate((el) => el.outerHTML);
    for (const r of g.runs) {
      await chip(page, r.kind).click();
      await expect(root(page)).toHaveAttribute("data-nbp-run", r.kind);
      expect(await official(page).evaluate((el) => el.outerHTML)).toBe(base);
      if (r.kind === "default") await expect(page.locator('[data-nbp-role="default"]')).toBeVisible();
      else await expect(page.locator("[data-nbp-whatif-banner]")).toHaveText(WHAT_IF_BANNER);
    }
  }
});

test("what-if end to end: the upset run ends won by the side the official forecast does not favour; the overtime run shows OT", async ({ page }) => {
  const g = GAMES[0];
  const up = g.runs.find((r) => r.kind === "upset")!;
  await open(page, g.providerEventId, "?run=upset");
  await expect(root(page)).toHaveAttribute("data-nbp-run", "upset");
  await page.getByRole("button", { name: "Skip to the final" }).click();
  expect(await score(page)).toEqual({ home: up.final[0], away: up.final[1] });
  await expect(page.locator("[data-nbp-endcard]")).toContainText("the favoured side lost");
  await expect(page.locator("[data-nbp-endcard]")).toContainText(WHAT_IF_BANNER);
  const otGame = GAMES.find((x) => x.runs.some((r) => r.kind === "overtime"));
  if (otGame) {
    await open(page, otGame.providerEventId, "?run=overtime");
    await page.getByRole("button", { name: "Skip to the final" }).click();
    await expect(page.locator("[data-nbp-linescore] thead")).toContainText("OT1");
    await expect(page.locator("[data-nbp-endcard]")).toContainText("overtime");
  }
});
