/**
 * Simulation Theater V2 · browser verification of the DEV route and of the INTEGRATED public route. LOCAL ONLY, opt-in.
 *
 * Both routes carry the Theater only in an opted-in build or dev server: the dev route needs GTP_DEV_ROUTES=1, the
 * public section on /nfl/simulation/[eventId] needs GTP_NFL_THEATER_PUBLIC=1 (default OFF). So in the default suite and
 * in CI this file SKIPS. To run it against a dev server (the coordinator's, on 4182 by default):
 *
 *   GTP_DEV_ROUTES=1 GTP_NFL_THEATER_PUBLIC=1 <dev server on :4182>
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts                         # dev route
 *   GTP_THEATER_E2E=1 GTP_THEATER_TARGET=public npx playwright test -c playwright.theater.config.ts  # integrated route
 *
 * Env: GTP_THEATER_BASE_URL (default http://localhost:4182; GTP_THEATER_BASE is still honoured), GTP_THEATER_TARGET
 * (dev | public, default dev), GTP_THEATER_EVENT (default 401873008).
 *
 * EXPECTATIONS ARE DERIVED (integration 2026-10-19), not pinned: the run the page opens on and every playback instant
 * come from the receipt of record the route renders (e2e/simulation-theater.fixture.ts). On the dev route a run and an
 * instant are opened with the `?run=&t=` hook; the public route has no hooks, so the same state is reached through the
 * page's own controls (run chip / run sheet, then the seek bar), which the dev route's determinism test proves equal.
 * The zoom review variant (`?zoomCap=`) exists only on the dev route; its tests skip on the public target.
 *
 * Covers: no console errors · Play advances · deterministic seek (?t= hook and the seek bar agree) · reduced motion
 * (stepped, no PROGRESS frame, no animation) · 320/375/390/768/1440 (no overflow, exact disclosure, ≥44 px controls,
 * ≥24 px thumb, focus never under the sticky score bug) · keyboard transport · bottom sheets · an accessibility audit
 * (the repo has no axe dependency: the contrast probe below is the one e2e/accessibility.spec.ts uses, scoped to the
 * theater, plus structural checks) · JS bytes against the §6.1 budget.
 * Iteration 3: timeline segments are ≥24 × 24 px pointer targets at 320/390/1440 (elementFromPoint), the 320 px field is
 * full-bleed, and the no-JavaScript final frame's ball is not stretched.
 */
import zlib from "node:zlib";
import { test, expect, type Page } from "@playwright/test";

import { deriveFixture, type TheaterFixture } from "./simulation-theater.fixture";

const ENABLED = process.env.GTP_THEATER_E2E === "1";
const TARGET = process.env.GTP_THEATER_TARGET === "public" ? "public" : "dev";
const PUBLIC = TARGET === "public";
const EVENT = process.env.GTP_THEATER_EVENT ?? "401873008";
const PAGE = PUBLIC ? `/nfl/simulation/${EVENT}/` : `/dev/simulation-theater/${EVENT}/`;
const DISCLOSURE = "SIMULATED · drive-level · movement illustrative · experimental model";
const PUBLIC_LABELS = ["SIMULATED", "DRIVE-LEVEL", "MOVEMENT ILLUSTRATIVE", "EXPERIMENTAL MODEL"];
const WIDTHS = [[320, 640], [375, 812], [390, 844], [768, 1024], [1440, 900]] as const;

test.skip(!ENABLED, "theater spec: set GTP_THEATER_E2E=1 and serve a GTP_DEV_ROUTES=1 / GTP_NFL_THEATER_PUBLIC=1 build (see header)");

/** Derived once from the receipt of record (node side); see e2e/simulation-theater.fixture.ts. */
const F = ENABLED ? deriveFixture(EVENT) : (null as unknown as TheaterFixture);
const hasHalf = () => F.t.half != null;

type At = { run?: number; t?: number | null; zoomCap?: string };

/** Seek the island through its own seek bar (the public route's only way in; identical to the hook's SEEK). */
async function seekBar(page: Page, seconds: number) {
  await page.locator(".st-seek").evaluate((el: HTMLInputElement, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(Math.round(seconds * 1000)));
  await page.waitForTimeout(120);
}

/** Pick a representative run with the page's own control: the chip row, or (phones) the run sheet. */
async function chooseRun(page: Page, run: number) {
  if (Number(await root(page).getAttribute("data-st-run")) === run) return;
  const i = F.chipIndexOf(run);
  const sheetBtn = page.locator(".st-samplebtn");
  if (await sheetBtn.count()) {
    await sheetBtn.click();
    await page.getByRole("dialog", { name: "Representative runs" }).locator(".st-chip").nth(i).click();
  } else {
    await page.locator(".st-chips:not(.is-vertical) .st-chip").nth(i).click();
  }
  await expect(root(page)).toHaveAttribute("data-st-run", String(run));
}

async function open(page: Page, at: At = {}) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  if (!PUBLIC) {
    const q = new URLSearchParams();
    if (at.run != null) q.set("run", String(at.run));
    if (at.t != null) q.set("t", String(at.t));
    if (at.zoomCap != null) q.set("zoomCap", at.zoomCap);
    const qs = q.toString();
    await page.goto(PAGE + (qs ? `?${qs}` : ""), { waitUntil: "networkidle" });
    await page.waitForSelector(".st-root[data-st-ready]");
    return errors;
  }
  if (at.zoomCap != null) throw new Error("zoomCap is a dev-route review hook");
  await page.goto(PAGE, { waitUntil: "networkidle" });
  // the island loads when its shell comes within a viewport (TheaterLoader); the report above it is long. Scroll the shell
  // itself, not the whole section: with the drive table and the box score below it the section is several viewports tall
  // at 320 px, and centring it leaves the shell out of the loader's range.
  await page.locator("[data-stp-section] .st-root").first().scrollIntoViewIfNeeded();
  await page.waitForSelector(".st-root[data-st-ready]");
  if (at.run != null) await chooseRun(page, at.run);
  if (at.t != null && at.t > 0) await seekBar(page, at.t);
  return errors;
}
/** Reload the same state: the dev route reloads its URL; the public route re-opens through its controls. */
async function reopen(page: Page, at: At) {
  if (!PUBLIC) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".st-root[data-st-ready]");
    return;
  }
  await open(page, at);
}
const root = (page: Page) => page.locator(".st-root[data-st-ready]");
const bugText = (page: Page) => page.locator(".st-bug").innerText();

test("loads with no console errors; the island replaces the static shell; IDLE (no autoplay)", async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  await expect(root(page)).toHaveAttribute("data-st-state", "IDLE");
  await expect(page.locator(".st-badge")).toHaveText(DISCLOSURE);
});

test("Play advances state, Pause stops it", async ({ page }) => {
  await open(page);
  const seek = page.locator(".st-seek");
  expect(Number(await seek.inputValue())).toBe(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(root(page)).toHaveAttribute("data-st-state", "PLAYING");
  await page.waitForTimeout(1500);
  const t1 = Number(await seek.inputValue());
  expect(t1).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(root(page)).toHaveAttribute("data-st-state", "PAUSED");
  const t2 = Number(await seek.inputValue());
  await page.waitForTimeout(500);
  expect(Number(await seek.inputValue())).toBe(t2);
});

test("seek is deterministic: the same t gives the same score bug and ball, by URL hook or by the seek bar", async ({ page }) => {
  const samples: Record<string, string> = {};
  for (const t of [F.t.early, F.t.mid, F.t.result, ...(hasHalf() ? [F.t.half!] : []), F.t.final]) {
    await open(page, { run: F.run, t });
    const a = { bug: await bugText(page), ball: await page.locator(".st-live g[transform]").first().getAttribute("transform"), drive: await root(page).getAttribute("data-st-drive") };
    await reopen(page, { run: F.run, t });
    const b = { bug: await bugText(page), ball: await page.locator(".st-live g[transform]").first().getAttribute("transform"), drive: await root(page).getAttribute("data-st-drive") };
    expect(b).toEqual(a);
    samples[String(t)] = a.bug;
  }
  // the seek bar reaches the same state as the URL hook (on the public route both are the seek bar)
  await open(page, { run: F.run });
  await seekBar(page, F.t.result);
  await page.waitForTimeout(100);
  expect(await bugText(page)).toBe(samples[String(F.t.result)]);
  await expect(page.locator(".st-scoreflash")).toBeVisible();
});

test("reduced motion: stepped timeline (no PROGRESS frame), no theater animation, outcomes unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { run: F.run });
  await expect(root(page)).toHaveAttribute("data-st-reduced", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const phases = new Set<string>();
  for (let i = 0; i < 30; i++) {
    phases.add((await root(page).getAttribute("data-st-phase")) ?? "");
    await page.waitForTimeout(100);
  }
  expect([...phases].filter((p) => p === "PROGRESS")).toEqual([]);
  await page.keyboard.press("k");
  await open(page, { run: F.run, t: F.t.earlyReducedResult }); // the first scoring drive's RESULT, reduced timeline
  await expect(page.locator(".st-scoreflash")).toBeVisible();
  const anim = await page.locator(".st-scoreflash").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe("none");
  // the final score is the recorded one at either motion setting
  await open(page, { run: F.run, t: 999 });
  const reducedFinal = await bugText(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, { run: F.run, t: 999 });
  expect(await bugText(page)).toBe(reducedFinal);
});

for (const [w, h] of WIDTHS) {
  test(`${w} px: no horizontal overflow, exact disclosure, ≥44 px controls, ≥24 px thumb, focus never under the sticky bug`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page, { run: F.run, t: F.t.mid });
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(ov.sw, "no horizontal page scroll").toBeLessThanOrEqual(ov.cw);
    const badge = page.locator(".st-badge");
    await expect(badge).toHaveText(DISCLOSURE);
    const bb = (await badge.boundingBox())!;
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(w + 0.5);
    // nothing inside the theater is wider than the viewport or clipped off its right edge. The follow camera layer
    // (.st-cam) is deliberately larger than its frame when zoomed; it is exempt only because the frame clips it, which
    // is asserted here so the exemption cannot hide a real overflow.
    const frame = await page.evaluate(() => { const f = document.querySelector(".st-fieldwrap")!; return { overflow: getComputedStyle(f).overflow, right: f.getBoundingClientRect().right }; });
    expect(frame.overflow, "the field frame clips the camera layer").toBe("hidden");
    expect(frame.right).toBeLessThanOrEqual(w + 1);
    const clipped = await page.evaluate((vw) => [...document.querySelectorAll(".st-root *")]
      .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && cs.visibility !== "hidden" && r.right > vw + 1 && !el.closest(".st-chips,.st-scroll,svg,.st-cam"); })
      .map((el) => `${el.tagName}.${(el as HTMLElement).className}`).slice(0, 5), w);
    expect(clipped).toEqual([]);
    // target sizes: every control in the theater except the timeline's segments (one composite tab stop, spec S9),
    // measured once finite entrance animations have settled (under parallel load a row was caught mid-animation)
    await page.locator(".st-root").first().evaluate((el) => Promise.all(el.getAnimations({ subtree: true })
      .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined))));
    const small = await page.evaluate(() => [...document.querySelectorAll(".st-root button, .st-root a[href], .st-root input:not([type=checkbox]), .st-root summary")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && !el.closest("[data-st-timeline]") && (r.width < 44 || r.height < 44); })
      .map((el) => `${el.tagName}.${(el as HTMLElement).className} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`));
    expect(small).toEqual([]);
    const thumb = await page.locator(".st-seek").evaluate((el) => {
      const cs = getComputedStyle(el, "::-webkit-slider-thumb");
      return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
    });
    expect(thumb.w).toBeGreaterThanOrEqual(24);
    expect(thumb.h).toBeGreaterThanOrEqual(24);
    // keyboard focus is never hidden beneath the sticky score bug (WCAG 2.4.11)
    await page.locator(".st-banner").click();
    const hidden: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const bug = document.querySelector(".st-bug");
        if (!a || !bug || !a.closest(".st-root") || bug.contains(a)) return null;
        const ar = a.getBoundingClientRect();
        const br = bug.getBoundingClientRect();
        const stuck = br.top <= 0.5;
        return { name: `${a.tagName}.${a.className}`, covered: stuck && ar.top < br.bottom - 1 && ar.bottom > br.top };
      });
      if (r?.covered) hidden.push(r.name);
    }
    expect(hidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// ── iteration 3 ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Per segment: the extent (px) of the region where elementFromPoint lands on THAT segment, along its centre lines. */
const HIT_PROBE = `(() => [...document.querySelectorAll('.st-seg')].map((s) => {
  const r = s.getBoundingClientRect();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let x = r.left - 30; x <= r.right + 30; x += 0.25) { const e = document.elementFromPoint(x, r.top + r.height / 2); if (e && e.closest('.st-seg') === s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
  for (let y = r.top - 30; y <= r.bottom + 30; y += 0.25) { const e = document.elementFromPoint(r.left + r.width / 2, y); if (e && e.closest('.st-seg') === s) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return { w: x1 - x0 + 0.25, h: y1 - y0 + 0.25, box: r.width, ms: Number(s.getAttribute('data-st-ms')) };
}))()`;

for (const [w, h] of [[320, 2200], [390, 2200], [1440, 1300]] as const) {
  test(`${w} px: every timeline segment is a ≥24 × 24 px pointer target, ∝ playback time, one tab stop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const run of [...new Set([F.run, F.crowdedRun])]) { // the default run · the run with the most drives (the most crowded)
      await open(page, { run, t: 0.1 });
      await page.locator("[data-st-timeline]").scrollIntoViewIfNeeded();
      const segs = (await page.evaluate(HIT_PROBE)) as { w: number; h: number; box: number; ms: number }[];
      expect(segs.length).toBeGreaterThan(10);
      const small = segs.filter((s) => s.w < 24 || s.h < 24).map((s) => `${s.w.toFixed(1)}×${s.h.toFixed(1)}`);
      expect(small, `run ${run}: undersized hit targets`).toEqual([]);
      const k = segs.map((s) => s.box / s.ms);
      expect(Math.max(...k) - Math.min(...k), `run ${run}: one px-per-ms scale`).toBeLessThan(0.0005);
      console.log(`# ${w}px run ${run}: ${await page.locator("[data-st-timeline]").getAttribute("data-st-tl-mode")}, min hit ${Math.min(...segs.map((s) => s.w)).toFixed(1)} × ${Math.min(...segs.map((s) => s.h)).toFixed(1)} px`);
      // still one tab stop: exactly one segment is tabbable
      expect(await page.locator(".st-seg[tabindex='0']").count()).toBe(1);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(ov).toBeLessThanOrEqual(0);
    }
    // a click on the narrowest segment seeks to that drive
    await open(page, { run: F.crowdedRun, t: 0.1 });
    const i = await page.evaluate(() => { const s = [...document.querySelectorAll(".st-seg")]; let b = 0; s.forEach((x, j) => { if (x.getBoundingClientRect().width < s[b].getBoundingClientRect().width) b = j; }); return b; });
    await page.locator(".st-seg").nth(i).click();
    await expect(root(page)).toHaveAttribute("data-st-drive", String(i));
  });
}

test("320 px: full-bleed field (≥300 px wide, edge to edge), taller; no overflow at 320/375/390; disclosure exact", async ({ page }) => {
  for (const [w, minW] of [[320, 300], [375, 0], [390, 0]] as const) {
    await page.setViewportSize({ width: w, height: 2200 });
    await open(page, { run: F.run, t: F.t.mid });
    const f = (await page.locator(".st-fieldwrap").boundingBox())!;
    if (minW) {
      expect(f.width).toBeGreaterThanOrEqual(minW);
      expect(f.x).toBeGreaterThanOrEqual(-0.5);
      expect(f.x + f.width).toBeLessThanOrEqual(w + 0.5);
      expect(f.height).toBeGreaterThanOrEqual(168);
    }
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(ov.sw).toBeLessThanOrEqual(ov.cw);
    await expect(page.locator(".st-badge")).toHaveText(DISCLOSURE);
    // disclosure, labels and controls keep their gutters and are never clipped by the viewport
    const out = await page.evaluate((vw) => [...document.querySelectorAll(".st-badge, .st-legend, .st-transport button, .st-seek, .st-bug, .st-tl-head")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > vw); }).map((el) => el.className), w);
    expect(out).toEqual([]);
    console.log(`# ${w}px field ${f.width.toFixed(1)} × ${f.height.toFixed(1)} at x=${f.x.toFixed(1)}`);
  }
});

test.describe("no JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const [w, h] of [[320, 1600], [390, 1600], [1440, 1300]] as const) {
    test(`${w} px: the server-rendered final frame's ball renders round (glow w/h 1 ± 5 %) and keeps its drawn shape`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(PAGE, { waitUntil: "load" });
      const r = await page.evaluate(() => {
        const g = document.querySelector(".st-fieldwrap .st-ball-glow")!.getBoundingClientRect();
        const body = document.querySelector(".st-fieldwrap .st-ball-body")!;
        const b = body.getBoundingClientRect();
        const drawn = Number(body.getAttribute("rx")) / Number(body.getAttribute("ry"));
        return { glow: g.width / g.height, body: b.width / b.height / drawn, px: b.width };
      });
      console.log(`# no-JS ${w}px: glow w/h ${r.glow.toFixed(3)}, body distortion ${r.body.toFixed(3)}, ball ${r.px.toFixed(1)} px long`);
      expect(Math.abs(r.glow - 1)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(r.body - 1)).toBeLessThanOrEqual(0.05);
      expect(r.px).toBeGreaterThanOrEqual(17); // never smaller than the island's minimum ball (rx 9)
    });
  }
});

test("keyboard operates the transport (focus-scoped shortcuts)", async ({ page }) => {
  await open(page, { run: F.run });
  const play = page.getByRole("button", { name: "Play", exact: true });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(root(page)).toHaveAttribute("data-st-state", "PLAYING");
  await page.keyboard.press("k");
  await expect(root(page)).toHaveAttribute("data-st-state", "PAUSED");
  await page.keyboard.press("Home");
  await expect(root(page)).toHaveAttribute("data-st-drive", "0");
  await page.keyboard.press("ArrowRight");
  await expect(root(page)).toHaveAttribute("data-st-drive", "1");
  await page.keyboard.press("ArrowRight");
  await expect(root(page)).toHaveAttribute("data-st-drive", "2");
  await page.keyboard.press("ArrowLeft");
  await expect(root(page)).toHaveAttribute("data-st-drive", "1");
  await page.keyboard.press("2");
  await expect(page.getByRole("radio", { name: "2×" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(root(page)).toHaveAttribute("data-st-phase", "FINAL");
  // the seek range keeps its native arrows (never switches drives)
  await page.keyboard.press("Home");
  await page.locator(".st-seek").focus();
  await page.keyboard.press("ArrowRight");
  await expect(root(page)).toHaveAttribute("data-st-drive", "0");
  // shortcuts are inert outside the theater region
  await page.locator("body").evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("k");
  await expect(root(page)).not.toHaveAttribute("data-st-state", "PLAYING");
});

test("390 px: bottom sheets are modal dialogs that pause playback, trap focus, close on Escape and return focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { run: F.run });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const opener = page.getByRole("button", { name: /change run/ });
  await opener.click();
  const dlg = page.getByRole("dialog", { name: "Representative runs" });
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute("aria-modal", "true");
  await expect(root(page)).toHaveAttribute("data-st-state", "PAUSED");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(opener).toBeFocused();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Evidence" })).toBeVisible();
  await expect(page.locator("[data-st-receipt-hash]")).not.toHaveText("not stored");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

/** The contrast probe from e2e/accessibility.spec.ts (WCAG relative luminance, gradient- and alpha-aware), scoped. */
const CONTRAST_PROBE = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const parse = (s) => { const m = s && s.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,/\\s]+([\\d.%]+))?/); if (!m) return null; let a = m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { c: [+m[1], +m[2], +m[3]], a }; };
  const over = (fg, bg, a) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  function usedBackground(el) {
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        const stops = [...img.matchAll(/rgba?\\([^)]+\\)/g)].map((m) => parse(m[0])).filter(Boolean).slice(0, 6);
        if (stops.length) { layers.push({ stops }); if (stops.every((s) => s.a >= 0.999)) break; continue; }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push({ solid: bg }); if (bg.a >= 0.999) break; }
    }
    const root = parse(getComputedStyle(document.body).backgroundColor);
    let cands = [root && root.a > 0 ? root.c : [18, 11, 7]];
    for (const layer of layers.reverse()) {
      cands = layer.solid ? cands.map((c) => over(layer.solid.c, c, layer.solid.a)) : cands.flatMap((c) => layer.stops.map((s) => over(s.c, c, s.a)));
      if (cands.length > 24) cands = cands.slice(0, 24);
    }
    return cands;
  }
  const out = [];
  for (const el of document.querySelectorAll('.st-root *, [data-stp-section] *')) {
    const owns = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!owns) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (txt && !/[a-z0-9]/i.test(txt) && /\\p{Extended_Pictographic}/u.test(txt)) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    const worst = Math.min(...usedBackground(el).map((bg) => ratio(fg.a >= 0.999 ? fg.c : over(fg.c, bg, fg.a), bg)));
    if (worst + 0.005 < need) out.push({ text: el.textContent.trim().slice(0, 50), ratio: +worst.toFixed(2), need, selector: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] });
  }
  return out;
})()`;

const STRUCTURE_PROBE = `(() => {
  const out = [];
  const rootEl = document.querySelector('.st-root');
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push('duplicate-id ' + id);
  const nameOf = (el) => (el.getAttribute('aria-label') || '').trim()
    || (el.getAttribute('aria-labelledby') || '').split(/\\s+/).map((i) => document.getElementById(i)?.textContent || '').join(' ').trim()
    || (el.labels && [...el.labels].map((l) => l.textContent).join(' ').trim())
    || (el.textContent || '').trim() || (el.getAttribute('title') || '').trim();
  for (const el of rootEl.querySelectorAll('button, a[href], input, [role=tab], [role=radio], summary, [role=dialog], [role=region], [role=toolbar], [role=radiogroup], [role=tablist]')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    if (!nameOf(el)) out.push('no-accessible-name ' + el.tagName + '.' + el.className);
  }
  for (const el of document.querySelectorAll('[aria-describedby],[aria-labelledby],[aria-controls]')) {
    for (const attr of ['aria-describedby', 'aria-labelledby', 'aria-controls']) {
      for (const id of (el.getAttribute(attr) || '').split(/\\s+/).filter(Boolean)) if (!document.getElementById(id)) out.push('dangling ' + attr + ' ' + id);
    }
  }
  for (const d of document.querySelectorAll('[role=dialog]')) if (d.getAttribute('aria-modal') !== 'true') out.push('dialog-not-modal');
  for (const el of rootEl.querySelectorAll('[aria-hidden="true"]')) if (el.querySelector('button, a[href], input, [tabindex="0"]')) out.push('focusable-in-aria-hidden ' + el.className);
  if (rootEl.querySelectorAll('[aria-live]').length !== 1) out.push('expected exactly one live region');
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
  for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) { out.push('heading-skip h' + heads[i - 1] + '→h' + heads[i]); break; }
  return out;
})()`;

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`accessibility audit at ${w} px: contrast (AA) and structure, idle, mid-drive, halftime, final, rollover, review label, and with a sheet open`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // iteration 8: also the halftime card (overlay / phone sheet), a mid-drive rollover with its tag, and the zoom review label
    const states: At[] = [
      { run: F.run }, { run: F.run, t: F.t.result }, { run: F.run, t: F.t.final },
      ...(hasHalf() ? [{ run: F.run, t: F.t.half }] : []),
      ...(F.roll ? [{ run: F.roll.run, t: F.roll.t }] : []),
      ...(!PUBLIC && F.t.zoom != null ? [{ run: F.run, t: F.t.zoom, zoomCap: "1.6" }] : []),
    ];
    for (const q of states) {
      await open(page, q);
      expect(await page.evaluate(CONTRAST_PROBE), `contrast ${JSON.stringify(q)}`).toEqual([]);
      expect(await page.evaluate(STRUCTURE_PROBE), `structure ${JSON.stringify(q)}`).toEqual([]);
    }
    if (w < 720) {
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      expect(await page.evaluate(CONTRAST_PROBE)).toEqual([]);
      expect(await page.evaluate(STRUCTURE_PROBE)).toEqual([]);
    }
  });
}

test("bundle budget (spec §6.1): theater JS ≤120 KB gzip incremental over a reference page; 0 playback requests", async ({ page }) => {
  const collect = async (url: string) => {
    const js = new Map<string, number>();
    const handler = async (r: import("@playwright/test").Response) => {
      if (!r.url().endsWith(".js")) return;
      try { js.set(new URL(r.url()).pathname, zlib.gzipSync(await r.body(), { level: 9 }).length); } catch { /* aborted */ }
    };
    page.on("response", handler);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    page.off("response", handler);
    return js;
  };
  /*
   * dev route: theater JS = what the theater page loads beyond /about/.
   * public route: the page also carries the Simulation V2 report, so the reference is the SAME page before the island
   * loads (it loads once the section nears the viewport) and the theater JS is what loads after scrolling to it.
   */
  let ref: Map<string, number>;
  let theater: Map<string, number>;
  if (PUBLIC) {
    const js = new Map<string, number>();
    const handler = async (r: import("@playwright/test").Response) => {
      if (!r.url().endsWith(".js")) return;
      try { js.set(new URL(r.url()).pathname, zlib.gzipSync(await r.body(), { level: 9 }).length); } catch { /* aborted */ }
    };
    page.on("response", handler);
    await page.goto(PAGE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    ref = new Map(js);
    await page.locator("[data-stp-section] .st-root").first().scrollIntoViewIfNeeded();
    await page.waitForSelector(".st-root[data-st-ready]");
    await page.waitForTimeout(800);
    page.off("response", handler);
    theater = js;
  } else {
    ref = await collect("/about/");
    theater = await collect(PAGE);
  }
  await page.waitForSelector(".st-root[data-st-ready]");
  const extra = [...theater].filter(([k]) => !ref.has(k));
  const total = extra.reduce((a, [, v]) => a + v, 0);
  console.log(`# theater JS beyond /about/: ${extra.map(([k, v]) => `${k.split("/").pop()} ${(v / 1024).toFixed(1)} KB`).join(", ")} = ${(total / 1024).toFixed(1)} KB gzip`);
  expect(total).toBeLessThanOrEqual(120 * 1024);
  // playback makes no network request
  const reqs: string[] = [];
  page.on("request", (r) => reqs.push(r.url()));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(reqs.filter((u) => !/\/_next\/static\/media\//.test(u))).toEqual([]);
});

// ── iteration 7: broadcast camera, score bug, transitions, frame times ─────────────────────────────────────────────
const camTransform = (page: Page) => page.locator(".st-cam").evaluate((el: HTMLElement) => ({ tf: el.style.transform || "none", z: Number(el.dataset.stZoom ?? "1"), shot: el.dataset.stShot ?? "" }));

test("camera: an accessible 'Camera' radiogroup; follow by default at 1440 (zoomed mid-drive, ≤1.35×); the choice lasts for the page view and stores nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: F.t.mid });
  const group = page.getByRole("radiogroup", { name: "Camera" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  const a = await camTransform(page);
  expect(a.tf).toContain("scale(");
  expect(a.z).toBeGreaterThan(1.05);
  expect(a.z).toBeLessThanOrEqual(1.35);
  await group.getByRole("radio", { name: "Full field" }).click();
  expect((await camTransform(page)).tf).toBe("none");
  // integration 2026-10-19: no browser storage (the privacy notice names none for the theater), so the choice holds while
  // the page is open (seek elsewhere and back) and a reload returns to the width default
  await seekBar(page, F.t.result);
  await seekBar(page, F.t.mid);
  await expect(group.getByRole("radio", { name: "Full field" })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => { try { return Object.keys(localStorage).filter((k) => /theater|camera/i.test(k)); } catch { return []; } })).toEqual([]);
  await reopen(page, { run: F.run, t: F.t.mid });
  await expect(page.getByRole("radiogroup", { name: "Camera" }).getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  // arrow keys move the choice (roving radio)
  await page.getByRole("radio", { name: "Follow" }).click();
  await page.getByRole("radio", { name: "Follow" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Full field" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Full field" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Follow" })).toBeFocused();
});

test("camera is deterministic: the same t frames identically after reload and after a seek-bar seek; no SVG filter inside the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: F.t.mid });
  const a = await camTransform(page);
  await reopen(page, { run: F.run, t: F.t.mid });
  expect(await camTransform(page)).toEqual(a);
  await open(page, { run: F.run });
  await seekBar(page, F.t.mid);
  await page.waitForTimeout(30);
  expect(await camTransform(page)).toEqual(a);
  // S8: the grain filter is a screen-space sibling; nothing in the transformed subtree is filtered
  expect(await page.locator(".st-cam filter, .st-cam [filter]").count()).toBe(0);
  expect(await page.locator(".st-fieldwrap > .st-grain [filter]").count()).toBe(1);
});

test("390 px: the camera defaults to the full field; Follow stays bounded; reduced motion pins the full field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { run: F.run, t: F.t.mid });
  await expect(page.getByRole("radio", { name: "Full field" })).toHaveAttribute("aria-checked", "true");
  expect((await camTransform(page)).tf).toBe("none");
  await page.getByRole("radio", { name: "Follow" }).click();
  const f = await camTransform(page);
  expect(f.z).toBeGreaterThan(1);
  expect(f.z).toBeLessThanOrEqual(1.35);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { run: F.run, t: F.t.mid });
  // the camera choice lasts only for the page view (nothing stored), so choose Follow again after the reload
  await page.getByRole("radio", { name: "Follow" }).click();
  await expect(page.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  expect((await camTransform(page)).tf).toBe("none");
  await expect(page.locator(".st-camnote")).toHaveText("Reduced motion: the field stays fully framed");
});

test("transitions: start-of-game strip, halftime card with this run's Q1/Q2, final card with the exact disclosure, dismissible by button and Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: 0 });
  await expect(page.locator('[data-st-card="PERIOD_START"]')).toContainText("Start of game");
  await expect(page.locator('[data-st-card="PERIOD_START"]')).toContainText("kick/return not modelled");
  if (hasHalf()) {
    await open(page, { run: F.run, t: F.t.half });
    const half = page.getByRole("region", { name: "Halftime" }).or(page.locator('section[data-st-card="HALFTIME"]'));
    await expect(half).toBeVisible();
    await expect(half.locator("thead")).toContainText("Q1");
    await expect(half).toContainText("SIMULATED · not a real game");
  }
  await open(page, { run: F.run, t: F.t.final });
  const fin = page.locator('section[data-st-card="FINAL"]');
  await expect(fin).toBeVisible();
  await expect(fin.locator(".st-card-line b")).toHaveText("SIMULATED · not a real game");
  await expect(fin).toContainText(`run #${F.run.toLocaleString("en-US")} of ${F.runCount.toLocaleString("en-US")}`);
  await expect(fin.locator(".st-card-title")).toHaveText(/^Final( · OT)?$/);
  await fin.getByRole("button", { name: /Hide the final/ }).click();
  await expect(fin).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeFocused();
  await open(page, { run: F.run, t: F.t.final });
  await page.locator(".st-seek").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('section[data-st-card="FINAL"]')).toHaveCount(0);
});

test("score bug: the drive strip shows recorded totals at the reference drive's end and a labelled illustrative yardage while the ball moves", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: F.t.result });
  await expect(page.locator(".st-bug-sit")).toHaveAttribute("data-st-situation", "recorded");
  await expect(page.locator(".st-bug-sit-text")).toHaveText(F.refStrip); // e.g. "Drive 9 of 23 · 6 plays · 67 yds"
  await expect(page.locator(".st-bug-sit-tag")).toHaveText("recorded");
  await open(page, { run: F.run, t: F.t.mid });
  await expect(page.locator(".st-bug-sit")).toHaveAttribute("data-st-situation", "progress");
  // scoped to the drive situation: a mid-drive quarter rollover adds its own "mid-drive · timing illustrative" tag
  await expect(page.locator(".st-bug-sit .st-bug-sit-tag")).toHaveText("illustrative");
  await expect(page.locator(".st-bug-sit-yds")).toHaveText(/^≈−?\d+ yds?$/);
  expect(await page.locator(".st-bug").innerText()).not.toMatch(/\b(1st|2nd|3rd|4th)\s*&|down and/i);
});

/** rAF frame-to-frame deltas over `ms` of playback; returns p50/p95/max and the share of frames over 1/30 s. */
async function frameTimes(page: Page, ms: number) {
  return page.evaluate(async (dur) => {
    const d: number[] = [];
    let last = performance.now();
    const end = last + dur;
    await new Promise<void>((res) => {
      const f = (now: number) => { d.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    d.shift();
    const s = [...d].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2), over33: +(s.filter((x) => x > 34).length / s.length).toFixed(3) };
  }, ms);
}

test("frame times during playback (Chromium): 1440 follow camera; 390 full field and follow; 390 at 4× CPU throttle", async ({ page }) => {
  test.setTimeout(120_000);
  const out: Record<string, unknown> = {};
  const runCase = async (label: string, w: number, h: number, cam: "Follow" | "Full field", throttle = 1) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, { run: F.run, t: 0 });
    await page.getByRole("radio", { name: cam }).click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    await page.locator(".st-broadcast").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    const r = await frameTimes(page, 10_000); // drives 1–3 at 1×: kickoff establishing shot, follow, a score, a hand-off
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    out[label] = r;
    return r;
  };
  const d = await runCase("1440 follow", 1440, 900, "Follow");
  const m = await runCase("390 full field", 390, 844, "Full field");
  const mf = await runCase("390 follow", 390, 844, "Follow");
  const mt = await runCase("390 follow, 4× CPU throttle", 390, 844, "Follow", 4);
  console.log(`# frame times (ms): ${JSON.stringify(out)}`);
  expect(d.p95).toBeLessThanOrEqual(20); // spec §6.1 desktop target: p95 ≤ 20 ms
  expect(m.p95).toBeLessThanOrEqual(40); // phone target: p95 ≤ 40 ms
  expect(mf.p95).toBeLessThanOrEqual(40);
  expect(mt.p95).toBeLessThanOrEqual(40);
});

// ── iteration 8: zoom review variant, mobile camera default, dismissible cards, illustrative tags ────────────────────
test("zoom review variant: ?zoomCap=1.6 is labelled on screen and reaches 1.6× on a short drive; the default and any other value stay ≤1.35×", async ({ page }) => {
  test.skip(PUBLIC, "the zoom review variant is a dev-route hook; the public route never reads it");
  test.skip(F.t.zoom == null, "no instant in this run where the two caps differ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: F.t.zoom }); // a short drive's PROGRESS, where the caps differ (derived)
  await expect(page.locator("[data-st-review]")).toHaveCount(0);
  expect((await camTransform(page)).z).toBeCloseTo(1.35, 3);
  await open(page, { run: F.run, t: F.t.zoom, zoomCap: "1.6" });
  await expect(page.locator("[data-st-review]")).toBeVisible();
  await expect(page.locator("[data-st-review]")).toContainText("Review variant");
  await expect(page.locator("[data-st-review]")).toContainText("1.6×");
  await expect(page.locator("[data-st-review]")).toContainText("1.35×");
  expect((await camTransform(page)).z).toBeCloseTo(1.6, 3);
  for (const q of ["2", "1.5", "abc", "1.35"]) {
    await open(page, { run: F.run, t: F.t.zoom, zoomCap: q });
    await expect(page.locator("[data-st-review]")).toHaveCount(0);
    expect((await camTransform(page)).z).toBeLessThanOrEqual(1.35);
  }
});

for (const [w, h] of [[390, 844], [320, 640]] as const) {
  test(`${w} px: the camera opens on the full field, listed first; the control is visibly labelled 'Camera', full width, ≥44 px, with a hint`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, { run: F.run, t: F.t.zoom ?? F.t.mid });
    await expect(root(page)).toHaveAttribute("data-st-camera", "full");
    expect((await camTransform(page)).tf).toBe("none");
    const group = page.getByRole("radiogroup", { name: "Camera" });
    await expect(group.locator(".st-camtoggle-l")).toBeVisible();
    await expect(group.locator(".st-camtoggle-l")).toHaveText("Camera");
    const opts = group.getByRole("radio");
    await expect(opts.nth(0)).toHaveText("Full field");
    await expect(opts.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(opts.nth(1)).toHaveText("Follow drive");
    for (let i = 0; i < 2; i++) {
      const b = (await opts.nth(i).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
    }
    const gb = (await group.boundingBox())!;
    const sb = (await page.locator(".st-scenebar").boundingBox())!;
    expect(gb.width).toBeGreaterThanOrEqual(sb.width - 1); // full width of the scene bar: discoverable
    await expect(page.locator(".st-camhint")).toContainText("Phones open on the full field");
    await opts.nth(1).click();
    await expect(root(page)).toHaveAttribute("data-st-camera", "follow");
    expect((await camTransform(page)).z).toBeGreaterThan(1);
  });
}

test("the camera default follows the width live when the viewer has not chosen: follow at 1440, full field at 390", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { run: F.run, t: F.t.zoom ?? F.t.mid });
  await expect(root(page)).toHaveAttribute("data-st-camera", "follow");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(root(page)).toHaveAttribute("data-st-camera", "full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(root(page)).toHaveAttribute("data-st-camera", "follow");
});

for (const [w, h] of [[1440, 900], [390, 844], [320, 640]] as const) {
  test(`${w} px: halftime and final cards are dismissible (button returns focus to Play; Escape anywhere), recorded totals + 'SIMULATED · not a real game'${w < 720 ? ", as a sheet that leaves the field visible" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const cardCases = [
      ...(hasHalf() ? [[F.t.half!, "HALFTIME", /Hide the halftime card/] as const] : []),
      [F.t.final, "FINAL", /Hide the final card/] as const,
    ];
    for (const [t, kind, name] of cardCases) {
      await open(page, { run: F.run, t });
      const card = page.locator(`section[data-st-card="${kind}"]`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("data-st-card-variant", w < 720 ? "sheet" : "overlay");
      await expect(card.locator(".st-card-line b")).toHaveText("SIMULATED · not a real game");
      await expect(card.getByRole("table")).toBeVisible();
      if (kind === "HALFTIME") await expect(card.locator("thead")).toContainText("Q1");
      // it is a labelled region, never a live region, and it never takes focus on its own
      expect(await card.getAttribute("aria-live")).toBeNull();
      expect(await card.evaluate((el) => el.contains(document.activeElement))).toBe(false);
      // measure the settled card: its entrance animation (st-card-in) scales it from 0.98
      await card.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
      const cb = (await card.boundingBox())!;
      expect(cb.x).toBeGreaterThanOrEqual(0);
      expect(cb.x + cb.width).toBeLessThanOrEqual(w + 0.5);
      if (w < 720) {
        // wherever the page is scrolled (field fully on screen, from just under the top to just above the nav), the
        // sheet sits in the viewport, clear of the site's bottom navigation, and never covers the field
        const sb0 = (await card.boundingBox())!;
        expect(sb0.height).toBeLessThanOrEqual(170);
        const nav = page.getByRole("navigation", { name: "Mobile bottom navigation" });
        const nb = (await nav.count()) ? await nav.boundingBox() : null;
        const fieldTopAbs = await page.locator(".st-fieldwrap").evaluate((el) => el.getBoundingClientRect().top + scrollY);
        let placements = 0;
        for (let y = 0; y <= h - 168 - (nb ? h - nb.y : 0); y += 40) {
          await page.evaluate((top) => window.scrollTo(0, top), Math.max(0, fieldTopAbs - y));
          await page.waitForTimeout(80);
          const fb = (await page.locator(".st-fieldwrap").boundingBox())!;
          if (fb.y < 0 || fb.y + fb.height > (nb ? nb.y : h)) continue;
          const sb = (await card.boundingBox())!;
          expect(sb.y).toBeGreaterThanOrEqual(0);
          expect(sb.y + sb.height).toBeLessThanOrEqual(nb ? nb.y + 0.5 : h);
          expect(fb.y + fb.height <= sb.y + 0.5 || sb.y + sb.height <= fb.y + 0.5, `field ${fb.y}–${fb.y + fb.height}, sheet ${sb.y}–${sb.y + sb.height}`).toBe(true);
          placements++;
        }
        expect(placements).toBeGreaterThan(2);
      }
      const x = card.getByRole("button", { name });
      const xb = (await x.boundingBox())!;
      expect(xb.width).toBeGreaterThanOrEqual(44);
      expect(xb.height).toBeGreaterThanOrEqual(44);
      await expect(x).toHaveAttribute("aria-keyshortcuts", "Escape");
      await x.focus();
      await page.keyboard.press("Enter");
      await expect(card).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Play", exact: true })).toBeFocused();
      // Escape from inside the theater (focus stays where it was) …
      await open(page, { run: F.run, t });
      await page.locator(".st-seek").focus();
      await page.keyboard.press("Escape");
      await expect(page.locator(`section[data-st-card="${kind}"]`)).toHaveCount(0);
      await expect(page.locator(".st-seek")).toBeFocused();
      // … and with nothing focused yet
      await open(page, { run: F.run, t });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Escape");
      await expect(page.locator(`section[data-st-card="${kind}"]`)).toHaveCount(0);
    }
  });
}

/**
 * Every interpolated value on screen (data-st-interp) has a VISIBLE illustrative tag in its scope: rendered, inside the
 * viewport, on top (elementFromPoint), not screen-reader-only; the in-drive yardage shares a line with its tag.
 */
async function interpViolations(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (r.left < -0.5 || r.right > innerWidth + 0.5) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || el.closest(".st-sr")) return false;
      // never clipped by an ancestor that hides overflow
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.display === "none") return false;
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) return false;
        }
      }
      // and drawn on top (hit testing skips pointer-events:none overlays, which are checked by clipping alone)
      if (cs.pointerEvents === "none") return true;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(hit && (hit === el || el.contains(hit)));
    };
    for (const v of Array.from(document.querySelectorAll("[data-st-interp]"))) {
      const scope = v.closest("[data-st-interp-scope]");
      if (!scope) { bad.push(`${v.getAttribute("data-st-interp")}: no scope`); continue; }
      const r = scope.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue; // its strip is not rendered at all: nothing is shown
      const tag = scope.querySelector("[data-st-interp-tag]");
      if (!tag) { bad.push(`${v.getAttribute("data-st-interp")}: no tag`); continue; }
      if (!/illustrative/i.test(tag.textContent ?? "")) bad.push(`${v.getAttribute("data-st-interp")}: tag reads '${tag.textContent}'`);
      // the field's strips sit under the aria-hidden overlay layer but are drawn; check the tag is drawn on top
      if (!vis(tag)) bad.push(`${v.getAttribute("data-st-interp")}: tag not visible`);
      if (v.getAttribute("data-st-interp") === "yards" && (v.textContent ?? "") !== "") {
        const a = v.getBoundingClientRect();
        const b = tag.getBoundingClientRect();
        if (Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) > 4) bad.push("yards: tag on another line");
      }
    }
    return bad;
  });
}

for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const) {
  test(`${w} px: no interpolated value (clock, quarter, in-drive yardage, mid-drive rollover) renders without its visible illustrative tag`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    let interpSeen = 0;
    // paused frames (derived): mid-drive across the game, the mid-drive rollover when this run has one, a drive start and
    // a drive end
    for (const t of F.t.interp) {
      await open(page, { run: F.run, t });
      await page.locator(".st-broadcast").scrollIntoViewIfNeeded();
      expect(await interpViolations(page), `t=${t}`).toEqual([]);
      interpSeen += await page.locator("[data-st-interp]").count();
      if (await page.locator(".st-bug-illus.on").count()) {
        expect(await page.locator(".st-seek").getAttribute("aria-valuetext")).toContain("(clock illustrative)");
      }
    }
    // and live playback (4×), sampled every ~150 ms for 3 s
    await open(page, { run: F.run, t: F.t.interp[1] });
    await page.locator(".st-broadcast").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.keyboard.press("4");
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(150);
      expect(await interpViolations(page), `live sample ${i}`).toEqual([]);
    }
    expect(interpSeen).toBeGreaterThan(10);
    // a quarter rollover inside a drive is tagged (derived: this run's, else another representative run's)
    if (F.roll) {
      await open(page, { run: F.roll.run, t: F.roll.t });
      await expect(page.locator('[data-st-card="ROLLOVER"] [data-st-interp-tag]')).toHaveText("mid-drive · timing illustrative");
    }
  });
}

// ── integration (2026-10-19): the public section's own frame — persistent labels, methodology, no-JS drive table ────
test.describe("integrated public route", () => {
  test.skip(!PUBLIC, "set GTP_THEATER_TARGET=public (and serve with GTP_NFL_THEATER_PUBLIC=1)");

  for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const) {
    test(`${w} px: the four labels and the methodology note stay on screen and in the accessibility tree before, during and after playback; no dev bar; no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errors = await open(page);
      const labels = page.locator("[data-stp-labels] li");
      const check = async (when: string) => {
        await expect(labels, when).toHaveText(PUBLIC_LABELS);
        for (let i = 0; i < PUBLIC_LABELS.length; i++) {
          const b = (await labels.nth(i).boundingBox())!;
          expect(b.width, `${when}: label ${i} rendered`).toBeGreaterThan(0);
          expect(b.x, when).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, when).toBeLessThanOrEqual(w + 0.5);
        }
        await expect(page.getByRole("list", { name: `Simulation replay disclosure: ${PUBLIC_LABELS.join(" · ")}` })).toBeVisible();
        await expect(page.getByRole("note", { name: "How this replay is made" })).toContainText("Drive boundaries are recorded facts");
        await expect(page.getByRole("note", { name: "How this replay is made" })).toContainText("illustrative");
        await expect(page.getByRole("note", { name: "How this replay is made" })).toContainText("has not been shown to be more accurate than the baseline");
        await expect(page.locator(".st-badge")).toHaveText(DISCLOSURE);
      };
      await check("idle");
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.waitForTimeout(1200);
      await check("playing");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await seekBar(page, F.t.final);
      await check("final");
      await expect(page.locator(".st-devbar")).toHaveCount(0);
      await expect(page.getByText("Development route · unlinked")).toHaveCount(0);
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(ov.sw, "no horizontal page scroll").toBeLessThanOrEqual(ov.cw);
      expect(errors).toEqual([]);
    });
  }

  test.describe("no JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    for (const [w, h] of [[320, 1600], [1440, 1300]] as const) {
      test(`${w} px: labels, methodology and the server-rendered drive table of the recorded run`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(PAGE, { waitUntil: "load" });
        await expect(page.locator("[data-stp-labels] li")).toHaveText(PUBLIC_LABELS);
        await expect(page.locator("[data-stp-method]")).toBeVisible();
        const table = page.locator("[data-stp-drive-table]");
        await expect(table).toContainText(`run #${F.run.toLocaleString("en-US")}`);
        await expect(table.locator("tbody tr")).toHaveCount(F.drives);
        await expect(table.locator("tbody tr").first().locator("td").first()).toHaveText("Q1 15:00");
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(ov.sw).toBeLessThanOrEqual(ov.cw);
      });
    }
  });
});

// ── projected box score (Lane A-NFL, 2026-10-20): lib/simulation-theater/box-score.mjs, BoxScorePanel, BoxScoreTable ───
// Both targets. The expected numbers are nflBoxScore(run, manifest) for the run the page opens on (F.box), computed in
// node from the same receipt of record; the page must print exactly those strings.
const BOX_WATERMARK = "SIMULATED · PROJECTED · NOT ACTUAL GAME STATISTICS";
const NOT_MODELED = "Not modeled by this engine";
const boxDialog = (page: Page) => page.getByRole("dialog", { name: /^Projected box score · run #/ });
const boxButton = (page: Page) => page.getByRole("button", { name: "Projected box score", exact: true });

/** Every category cell of both team tabs equals F.box; NOT_MODELED rows read as words; player sections are listed. */
async function expectBoxNumbers(page: Page) {
  const dlg = boxDialog(page);
  await expect(dlg.locator("[data-stbx-watermark]")).toHaveText(BOX_WATERMARK);
  await expect(dlg.locator("[data-stbx-final]")).toHaveText(F.box.header.scoreLine);
  await expect(dlg.locator("[data-stbx-periods] thead th")).toHaveText(["Team", ...F.box.periods.columns, "T"]);
  for (const side of ["away", "home"] as const) {
    await dlg.locator(`[data-stbx-tab="${side}"]`).click();
    await expect(dlg.locator(`[data-stbx-tab="${side}"]`)).toHaveAttribute("aria-selected", "true");
    for (const c of F.box.categories) {
      const td = dlg.locator(`tr[data-stbx-cat="${c.id}"] td[data-stbx-side="${side}"]`);
      await expect(td, `${side} ${c.id}`).toHaveText(c[side].display);
      if (c.status === "NOT_MODELED") {
        await expect(td).toHaveText(NOT_MODELED);
        await expect(td).toBeVisible();
      }
    }
  }
  for (const p of F.box.players) {
    const li = dlg.locator(`[data-stbx-player="${p.id}"]`);
    await expect(li).toContainText(NOT_MODELED);
    await expect(li).toContainText(p.reason);
    expect(/\d/.test(await li.innerText()), `${p.id}: no number`).toBe(false);
  }
  await expect(dlg.locator("[data-stbx-provenance]")).toContainText(F.box.provenance);
}

test.describe("projected box score", () => {
  test("mid-playback from the transport: pauses, numbers equal box-score.mjs, focus trapped, Escape returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await open(page, { run: F.run });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(1500);
    await expect(root(page)).toHaveAttribute("data-st-state", "PLAYING");
    const opener = boxButton(page);
    await opener.click();
    const dlg = boxDialog(page);
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute("aria-modal", "true");
    await expect(root(page)).toHaveAttribute("data-st-state", "PAUSED");
    await expect(dlg.locator("[data-stbx-dialog]")).toHaveAttribute("data-stbx-run", String(F.run));
    await expectBoxNumbers(page);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))).toBe(true);
    }
    // the team tabs are one tab stop with arrow keys (shared roving-tabs model)
    await dlg.locator('[data-stbx-tab="away"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(dlg.locator('[data-stbx-tab="home"]')).toBeFocused();
    await expect(dlg.locator('[data-stbx-tab="home"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(root(page)).toHaveAttribute("data-st-state", "PAUSED"); // only the reader resumes
    expect(errors).toEqual([]);
  });

  test("at the final: the FINAL card offers it; same numbers; Escape returns focus to the card's button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, { run: F.run, t: F.t.final });
    const card = page.locator('[data-st-card="FINAL"]');
    await expect(card).toBeVisible();
    const offer = card.getByRole("button", { name: "View projected box score" });
    await expect(offer).toBeVisible();
    await offer.click();
    await expect(boxDialog(page)).toBeVisible();
    await expectBoxNumbers(page);
    await page.keyboard.press("Escape");
    await expect(boxDialog(page)).toBeHidden();
    await expect(offer).toBeFocused();
  });

  test("390 px at the final: the FINAL sheet offers it too and the box score opens as a bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { run: F.run, t: F.t.final });
    const offer = page.locator('[data-st-card="FINAL"]').getByRole("button", { name: "View projected box score" });
    await expect(offer).toBeVisible();
    await offer.click();
    const dlg = boxDialog(page);
    await expect(dlg).toBeVisible();
    // measure the settled sheet: its entrance animation (st-rise) starts 6 px low
    await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const b = (await dlg.boundingBox())!;
    expect(Math.abs(b.y + b.height - 844), "anchored to the viewport bottom").toBeLessThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(offer).toBeFocused();
  });

  for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1440, 900]] as const) {
    test(`${w} px: dialog inside the viewport, no horizontal overflow, sticky table head, NOT_MODELED rows visible as text`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, { run: F.run, t: F.t.mid });
      await boxButton(page).click();
      const dlg = boxDialog(page);
      await expect(dlg).toBeVisible();
      await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // settled (st-rise starts 6 px low)
      const b = (await dlg.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      if (w <= 720) expect(Math.abs(b.y + b.height - h), `${w}: bottom sheet`).toBeLessThanOrEqual(2);
      else {
        expect(b.y, `${w}: centred modal`).toBeGreaterThan(0);
        expect(b.y + b.height).toBeLessThan(h);
      }
      const ov = await page.evaluate(() => {
        const body = document.querySelector("[role=dialog] .st-sheet-body") as HTMLElement;
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bsw: body.scrollWidth, bcw: body.clientWidth };
      });
      expect(ov.sw, "no horizontal page scroll").toBeLessThanOrEqual(ov.cw);
      expect(ov.bsw, "the table fits the dialog (no horizontal scroll inside)").toBeLessThanOrEqual(ov.bcw);
      // tabular numbers
      const fv = await dlg.locator('tr[data-stbx-cat="yards"] td').first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
      expect(fv).toContain("tabular-nums");
      // sticky head: scroll the sheet body well down; the table head stays at the top of the scroll area
      const stuck = await page.evaluate(() => {
        const body = document.querySelector("[role=dialog] .st-sheet-body") as HTMLElement;
        const th = body.querySelector(".stbx-table thead th") as HTMLElement;
        const table = body.querySelector(".stbx-table") as HTMLElement;
        body.scrollTop = table.offsetTop + 400;
        const br = body.getBoundingClientRect();
        const tr = th.getBoundingClientRect();
        return { top: tr.top - br.top, scrolled: body.scrollTop > 0, below: table.getBoundingClientRect().bottom > br.top + 40 };
      });
      if (stuck.scrolled && stuck.below) expect(Math.abs(stuck.top), "thead stuck to the top of the sheet").toBeLessThanOrEqual(2);
      for (const id of ["redZoneTrips", "firstDowns"]) {
        const td = dlg.locator(`tr[data-stbx-cat="${id}"] td`);
        await td.scrollIntoViewIfNeeded();
        await expect(td).toHaveText(NOT_MODELED);
        await expect(td).toBeVisible();
      }
      const pass = dlg.locator('[data-stbx-player="passing"]');
      await pass.scrollIntoViewIfNeeded();
      await expect(pass).toBeVisible();
      await expect(pass).toContainText(NOT_MODELED);
      // every control in the dialog is a ≥44 px target
      const small = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).length);
      expect(small).toBe(0);
    });
  }

  test.describe("no JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    for (const [w, h] of [[320, 1600], [1440, 1300]] as const) {
      test(`${w} px: the server-rendered box table prints box-score.mjs for the default run`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(PAGE, { waitUntil: "load" });
        const t = page.locator("[data-stbx-static]");
        await expect(t).toHaveAttribute("data-stbx-run", String(F.run));
        await expect(t.locator("[data-stbx-watermark]")).toHaveText(BOX_WATERMARK);
        await expect(t.locator("[data-stbx-final]")).toHaveText(F.box.header.scoreLine);
        for (const c of F.box.categories) {
          if (c.status === "NOT_MODELED") await expect(t.locator(`tr[data-stbx-cat="${c.id}"] td[data-stbx-side="both"]`)).toHaveText(NOT_MODELED);
          else for (const side of ["away", "home"] as const) await expect(t.locator(`tr[data-stbx-cat="${c.id}"] td[data-stbx-side="${side}"]`)).toHaveText(c[side].display);
        }
        await expect(t.locator("[data-stbx-player]")).toHaveCount(F.box.players.length);
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(ov.sw).toBeLessThanOrEqual(ov.cw);
      });
    }
  });
});
