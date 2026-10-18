/**
 * Simulation Theater V2 · browser verification of the DEV route (iteration 2). LOCAL ONLY, opt-in.
 *
 * The route exists only in an export built with GTP_DEV_ROUTES=1 (scripts/prune-internal-routes.mjs deletes out/dev/
 * otherwise), so in the default suite and in CI this file SKIPS. To run it:
 *
 *   cd app && GTP_DEV_ROUTES=1 npm run build && (cd .. && git checkout -- data/ app/public/data/)
 *   node scripts/serve-export.mjs 4181 out &
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts
 *
 * Covers: no console errors · Play advances · deterministic seek (?t= hook and the seek bar agree) · reduced motion
 * (stepped, no PROGRESS frame, no animation) · 320/375/390/768/1440 (no overflow, exact disclosure, ≥44 px controls,
 * ≥24 px thumb, focus never under the sticky score bug) · keyboard transport · bottom sheets · an accessibility audit
 * (the repo has no axe dependency: the contrast probe below is the one e2e/accessibility.spec.ts uses, scoped to the
 * theater, plus structural checks) · JS bytes against the §6.1 budget.
 */
import zlib from "node:zlib";
import { test, expect, type Page } from "@playwright/test";

const ENABLED = process.env.GTP_THEATER_E2E === "1";
const PAGE = "/dev/simulation-theater/401873008/";
const DISCLOSURE = "SIMULATED · drive-level · movement illustrative · experimental model";
const WIDTHS = [[320, 640], [375, 812], [390, 844], [768, 1024], [1440, 900]] as const;

test.skip(!ENABLED, "dev-route theater spec: set GTP_THEATER_E2E=1 and serve a GTP_DEV_ROUTES=1 export (see header)");

async function open(page: Page, q = "") {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(PAGE + q, { waitUntil: "networkidle" });
  await page.waitForSelector(".st-root[data-st-ready]");
  return errors;
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
  for (const t of [3.4, 22.9, 24.5, 31.8, 66.6]) {
    await open(page, `?run=428&t=${t}`);
    const a = { bug: await bugText(page), ball: await page.locator(".st-live g[transform]").first().getAttribute("transform"), drive: await root(page).getAttribute("data-st-drive") };
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".st-root[data-st-ready]");
    const b = { bug: await bugText(page), ball: await page.locator(".st-live g[transform]").first().getAttribute("transform"), drive: await root(page).getAttribute("data-st-drive") };
    expect(b).toEqual(a);
    samples[String(t)] = a.bug;
  }
  // the seek bar reaches the same state as the URL hook
  await open(page, "?run=428");
  await page.locator(".st-seek").evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, "24500");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(200);
  expect(await bugText(page)).toBe(samples["24.5"]);
  await expect(page.locator(".st-scoreflash")).toBeVisible();
});

test("reduced motion: stepped timeline (no PROGRESS frame), no theater animation, outcomes unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "?run=428");
  await expect(root(page)).toHaveAttribute("data-st-reduced", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const phases = new Set<string>();
  for (let i = 0; i < 30; i++) {
    phases.add((await root(page).getAttribute("data-st-phase")) ?? "");
    await page.waitForTimeout(100);
  }
  expect([...phases].filter((p) => p === "PROGRESS")).toEqual([]);
  await page.keyboard.press("k");
  await open(page, "?run=428&t=9.8");
  await expect(page.locator(".st-scoreflash")).toBeVisible();
  const anim = await page.locator(".st-scoreflash").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe("none");
  // the final score is the recorded one at either motion setting
  await open(page, "?run=428&t=999");
  const reducedFinal = await bugText(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, "?run=428&t=999");
  expect(await bugText(page)).toBe(reducedFinal);
});

for (const [w, h] of WIDTHS) {
  test(`${w} px: no horizontal overflow, exact disclosure, ≥44 px controls, ≥24 px thumb, focus never under the sticky bug`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page, "?run=428&t=22.9");
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(ov.sw, "no horizontal page scroll").toBeLessThanOrEqual(ov.cw);
    const badge = page.locator(".st-badge");
    await expect(badge).toHaveText(DISCLOSURE);
    const bb = (await badge.boundingBox())!;
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(w + 0.5);
    // nothing inside the theater is wider than the viewport or clipped off its right edge
    const clipped = await page.evaluate((vw) => [...document.querySelectorAll(".st-root *")]
      .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && cs.visibility !== "hidden" && r.right > vw + 1 && !el.closest(".st-chips,.st-scroll,svg"); })
      .map((el) => `${el.tagName}.${(el as HTMLElement).className}`).slice(0, 5), w);
    expect(clipped).toEqual([]);
    // target sizes: every control in the theater except the timeline's segments (one composite tab stop, spec S9)
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

test("keyboard operates the transport (focus-scoped shortcuts)", async ({ page }) => {
  await open(page, "?run=428");
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
  await open(page, "?run=428");
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
  for (const el of document.querySelectorAll('.st-root *')) {
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
  test(`accessibility audit at ${w} px: contrast (AA) and structure, idle and mid-drive and with a sheet open`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const q of ["?run=428", "?run=428&t=24.5", "?run=428&t=66.6"]) {
      await open(page, q);
      expect(await page.evaluate(CONTRAST_PROBE), `contrast ${q}`).toEqual([]);
      expect(await page.evaluate(STRUCTURE_PROBE), `structure ${q}`).toEqual([]);
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
  const ref = await collect("/about/");
  const theater = await collect(PAGE);
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
