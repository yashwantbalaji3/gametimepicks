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
 * Iteration 3: timeline segments are ≥24 × 24 px pointer targets at 320/390/1440 (elementFromPoint), the 320 px field is
 * full-bleed, and the no-JavaScript final frame's ball is not stretched.
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
    for (const run of [428, 21]) { // 428: the default run · 21: 27 drives, the most crowded
      await open(page, `?run=${run}&t=0.1`);
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
    await open(page, "?run=21&t=0.1");
    const i = await page.evaluate(() => { const s = [...document.querySelectorAll(".st-seg")]; let b = 0; s.forEach((x, j) => { if (x.getBoundingClientRect().width < s[b].getBoundingClientRect().width) b = j; }); return b; });
    await page.locator(".st-seg").nth(i).click();
    await expect(root(page)).toHaveAttribute("data-st-drive", String(i));
  });
}

test("320 px: full-bleed field (≥300 px wide, edge to edge), taller; no overflow at 320/375/390; disclosure exact", async ({ page }) => {
  for (const [w, minW] of [[320, 300], [375, 0], [390, 0]] as const) {
    await page.setViewportSize({ width: w, height: 2200 });
    await open(page, "?run=428&t=22.9");
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

// ── iteration 7: broadcast camera, score bug, transitions, frame times ─────────────────────────────────────────────
const camTransform = (page: Page) => page.locator(".st-cam").evaluate((el: HTMLElement) => ({ tf: el.style.transform || "none", z: Number(el.dataset.stZoom ?? "1"), shot: el.dataset.stShot ?? "" }));

test("camera: an accessible 'Camera' radiogroup; follow by default at 1440 (zoomed mid-drive, ≤1.35×); the choice persists per viewer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?run=428&t=22.9");
  const group = page.getByRole("radiogroup", { name: "Camera" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  const a = await camTransform(page);
  expect(a.tf).toContain("scale(");
  expect(a.z).toBeGreaterThan(1.05);
  expect(a.z).toBeLessThanOrEqual(1.35);
  await group.getByRole("radio", { name: "Full field" }).click();
  expect((await camTransform(page)).tf).toBe("none");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".st-root[data-st-ready]");
  await expect(page.getByRole("radiogroup", { name: "Camera" }).getByRole("radio", { name: "Full field" })).toHaveAttribute("aria-checked", "true");
  expect((await camTransform(page)).tf).toBe("none");
  // arrow keys move the choice (roving radio)
  await page.getByRole("radio", { name: "Full field" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Follow" })).toBeFocused();
});

test("camera is deterministic: the same t frames identically after reload and after a seek-bar seek; no SVG filter inside the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?run=428&t=22.9");
  const a = await camTransform(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".st-root[data-st-ready]");
  expect(await camTransform(page)).toEqual(a);
  await open(page, "?run=428");
  await page.locator(".st-seek").evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, "22900");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  expect(await camTransform(page)).toEqual(a);
  // S8: the grain filter is a screen-space sibling; nothing in the transformed subtree is filtered
  expect(await page.locator(".st-cam filter, .st-cam [filter]").count()).toBe(0);
  expect(await page.locator(".st-fieldwrap > .st-grain [filter]").count()).toBe(1);
});

test("390 px: the camera defaults to the full field; Follow stays bounded; reduced motion pins the full field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "?run=428&t=22.9");
  await expect(page.getByRole("radio", { name: "Full field" })).toHaveAttribute("aria-checked", "true");
  expect((await camTransform(page)).tf).toBe("none");
  await page.getByRole("radio", { name: "Follow" }).click();
  const f = await camTransform(page);
  expect(f.z).toBeGreaterThan(1);
  expect(f.z).toBeLessThanOrEqual(1.35);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "?run=428&t=22.9");
  await expect(page.getByRole("radio", { name: "Follow" })).toHaveAttribute("aria-checked", "true");
  expect((await camTransform(page)).tf).toBe("none");
  await expect(page.locator(".st-camnote")).toHaveText("Reduced motion: the field stays fully framed");
});

test("transitions: start-of-game strip, halftime card with this run's Q1/Q2, final card with the exact disclosure, dismissible by button and Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?run=428&t=0");
  await expect(page.locator('[data-st-card="PERIOD_START"]')).toContainText("Start of game");
  await expect(page.locator('[data-st-card="PERIOD_START"]')).toContainText("kick/return not modelled");
  await open(page, "?run=428&t=31.8");
  const half = page.getByRole("region", { name: "Halftime" }).or(page.locator('section[data-st-card="HALFTIME"]'));
  await expect(half).toBeVisible();
  await expect(half.locator("thead")).toContainText("Q1");
  await expect(half).toContainText("SIMULATED · not a real game");
  await open(page, "?run=428&t=66.6");
  const fin = page.locator('section[data-st-card="FINAL"]');
  await expect(fin).toBeVisible();
  await expect(fin.locator(".st-card-line b")).toHaveText("SIMULATED · not a real game");
  await expect(fin).toContainText("run #428 of 10,000");
  await expect(fin.locator(".st-card-title")).toHaveText(/^Final( · OT)?$/);
  await fin.getByRole("button", { name: /Hide the final/ }).click();
  await expect(fin).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeFocused();
  await open(page, "?run=428&t=66.6");
  await page.locator(".st-seek").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('section[data-st-card="FINAL"]')).toHaveCount(0);
});

test("score bug: the drive strip shows recorded totals after drive 7 and a labelled illustrative yardage while the ball moves", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?run=428&t=24.5");
  await expect(page.locator(".st-bug-sit")).toHaveAttribute("data-st-situation", "recorded");
  await expect(page.locator(".st-bug-sit-text")).toHaveText("Drive 7 of 19 · 10 plays · 75 yds");
  await expect(page.locator(".st-bug-sit-tag")).toHaveText("recorded");
  await open(page, "?run=428&t=22.9");
  await expect(page.locator(".st-bug-sit")).toHaveAttribute("data-st-situation", "progress");
  await expect(page.locator(".st-bug-sit-tag")).toHaveText("illustrative");
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
    await open(page, "?run=428&t=0");
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
