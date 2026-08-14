/**
 * Accessibility browser evidence — the half a static HTML scan cannot reach (Program 137).
 *
 * `scripts/audit-accessibility.mjs` proves STRUCTURE from exported markup (lang, title, one h1,
 * heading order, landmarks, accessible names, alt, labels). It is blind to anything that needs
 * layout or interaction. This spec covers exactly that remainder, against the SAME artifact
 * production serves (the built export on :4173, per playwright.config.ts):
 *
 *   contrast (resolved from real used colour, incl. gradients) · skip link · focus visibility ·
 *   keyboard traversal and trap detection · reflow at 390/768/1440 and at WCAG-1.4.10 width
 *
 * WHY A HAND-ROLLED CONTRAST CHECK. The repo has no axe/@axe-core dependency and adding one to
 * the public bundle path for a launch gate was not worth it. The maths here is the WCAG 2.1
 * relative-luminance formula verbatim; the part worth reviewing is `usedBackground()`, which
 * composites alpha up the ancestor chain and — the case that actually bit us — extracts the stops
 * of a background-image gradient. A first pass without gradient support reported the primary CTA
 * at 1.05:1 (it had fallen through to the dark page background) when the true range across the
 * gradient is 2.3:1 → 6.1:1. A checker that is wrong in the SAFE direction is still wrong.
 */
import fs from "node:fs";
import path from "node:path";

import { test, expect, type Page } from "@playwright/test";

/** The first-time-user journey. Kept in sync with ROUTES in scripts/audit-accessibility.mjs. */
// P176: /nfl joins the three-engine matrix. It was absent while /mlb was covered — a real
// assurance gap, and the one that would have caught the double-<main> landmark I introduced
// when adopting the shared shell.
// P177-A: the NFL per-game report joins the matrix, DISCOVERED from the export rather than pinned.
// Event ids change every slate; a hard-coded one would silently start testing a 404.
const NFL_GAME_DIR = path.join(__dirname, "..", "out", "nfl", "game");
const FIRST_NFL_GAME = fs.existsSync(NFL_GAME_DIR)
  ? fs.readdirSync(NFL_GAME_DIR).filter((d) => /^\d+$/.test(d)).sort()[0]
  : null;
const ROUTES = ["/", "/today/", "/markets/", "/results/", "/methodology/", "/learn/", "/moonshot/", "/bank-builder/", "/mlb/", "/nfl/", "/sports/",
  ...(FIRST_NFL_GAME ? [`/nfl/game/${FIRST_NFL_GAME}/`] : [])];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

type Contrast = { text: string; ratio: number; need: number; color: string; size: number; selector: string };

/**
 * Injected into the page. Returns every text-owning element whose contrast is below its WCAG AA
 * threshold, worst first. Runs in browser context — no imports, no TS-only syntax.
 */
const CONTRAST_PROBE = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const parse = (s) => { const m = s && s.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,/\\s]+([\\d.%]+))?/); if (!m) return null; let a = m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { c: [+m[1], +m[2], +m[3]], a }; };
  const over = (fg, bg, a) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));

  // The used background(s) behind an element: walk up collecting paint layers, then composite them
  // bottom-up. A gradient contributes ALL its stops, because different parts of the same run of
  // text sit over different stops — so the caller takes the WORST.
  //
  // Gradient stops carry their ALPHA. Dropping it was a real bug in the first version of this
  // probe: --gtp-bank-heat-dim is rgba(242,54,69,0.16), and treating that as opaque #F23645 made
  // text coloured #F23645 report exactly 1:1 against "its own colour" — 72 impossible failures on
  // a tint that is 16% opaque over near-black and actually renders fine.
  function usedBackground(el) {
    const layers = [];                                   // nearest-first
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        const stops = [...img.matchAll(/rgba?\\([^)]+\\)/g)].map((m) => parse(m[0])).filter(Boolean).slice(0, 6);
        if (stops.length) {
          layers.push({ stops });
          if (stops.every((s) => s.a >= 0.999)) break;    // fully opaque — nothing below shows
          continue;
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push({ solid: bg }); if (bg.a >= 0.999) break; }
    }
    const root = parse(getComputedStyle(document.body).backgroundColor);
    let cands = [root && root.a > 0 ? root.c : [18, 11, 7]];
    for (const layer of layers.reverse()) {              // farthest ancestor first, paint downward
      cands = layer.solid
        ? cands.map((c) => over(layer.solid.c, c, layer.solid.a))
        : cands.flatMap((c) => layer.stops.map((s) => over(s.c, c, s.a)));
      if (cands.length > 24) cands = cands.slice(0, 24);
    }
    return cands;
  }

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const owns = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!owns) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;               // collapsed / off-layout
    if (el.closest('[aria-hidden="true"]')) continue;         // not announced, not read
    // Emoji are painted by the font as colour glyphs; CSS \`color\` does not tint them, so a ratio
    // computed from \`color\` describes a colour that is never drawn. The sport orbs ("⚾") measured
    // 1.65:1 this way while rendering perfectly legibly, and each carries role="img" + aria-label,
    // so the MEANING is exposed regardless of the glyph. Skipping elements whose entire text is
    // emoji removes a false positive; any emoji sitting next to real text is still measured.
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (txt && !/[a-z0-9]/i.test(txt) && /\\p{Extended_Pictographic}/u.test(txt)) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const worst = Math.min(...usedBackground(el).map((bg) => ratio(fg.a >= 0.999 ? fg.c : over(fg.c, bg, fg.a), bg)));
    if (worst + 0.005 < need) {
      const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
      out.push({ text: el.textContent.trim().slice(0, 50), ratio: +worst.toFixed(2), need, color: cs.color, size, selector: sel });
    }
  }
  const seen = new Set();
  return out.sort((a, b) => a.ratio - b.ratio).filter((f) => { const k = f.selector + '|' + f.ratio; if (seen.has(k)) return false; seen.add(k); return true; });
})()`;

async function contrastFailures(page: Page): Promise<Contrast[]> {
  return (await page.evaluate(CONTRAST_PROBE)) as Contrast[];
}

test.describe("contrast — real used colour at every launch viewport", () => {
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`${route} @ ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        const failures = await contrastFailures(page);
        expect(
          failures,
          `WCAG AA contrast failures on ${route} @${vp.name}:\n${failures.map((f) => `  ${f.ratio}:1 (needs ${f.need}) ${f.selector} — "${f.text}"`).join("\n")}`,
        ).toEqual([]);
      });
    }
  }
});

test.describe("keyboard", () => {
  // Safari ships with "Full Keyboard Access" OFF, so WebKit's sequential focus navigation skips
  // links entirely — one Tab on /today/ leaves document.activeElement as <body>. That is a browser
  // preference, not a defect in this site, and no markup change can alter it. Keyboard traversal is
  // therefore proven on Chromium and Firefox; WebKit still runs the contrast and reflow checks.
  // This is a stated scope limit, NOT a pass: the accessibility evidence says "keyboard verified on
  // 2 of 3 engines" and must never be reported as three.
  test.skip(({ browserName }) => browserName === "webkit", "WebKit excludes links from Tab order by default (Safari Full Keyboard Access)");

  test("the skip link is the first stop and moves focus to main", async ({ page }) => {
    await page.goto("/today/", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");

    // The link slides in over 120ms, so poll rather than sampling mid-transition.
    await expect
      .poll(async () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getBoundingClientRect().top ?? -999))
      .toBeGreaterThan(-10);

    const first = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return {
        tag: a?.tagName,
        isBody: a === document.body,
        text: a?.textContent?.trim(),
        href: a?.getAttribute("href"),
        visible: a ? a.getBoundingClientRect().top > -50 : false,
      };
    });
    // Assert the ELEMENT first. <body>'s textContent begins with "Skip to main content", so a
    // text-only check passed on an engine that had not moved focus at all — the assertion was
    // reporting success for the exact failure it existed to catch.
    expect(first.isBody, "Tab did not move focus off <body>").toBe(false);
    expect(first.tag, "the first Tab must land on the skip link anchor").toBe("A");
    expect(first.text, "the first Tab must reach the skip link").toMatch(/skip to main/i);
    expect(first.href).toBe("#main-content");
    expect(first.visible, "the skip link must become VISIBLE on focus — an invisible one is unusable").toBe(true);

    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id), "activating it must move real focus, not just scroll").toBe("main-content");
  });

  for (const route of ["/today/", "/markets/", "/bank-builder/"]) {
    test(`${route} — focus stays visible and never traps`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const invisible: string[] = [];
      const path: string[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const probe = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          if (!a || a === document.body) return null;
          const cs = getComputedStyle(a);
          const ring =
            (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
            (cs.boxShadow && cs.boxShadow !== "none") ||
            cs.backgroundColor !== getComputedStyle(a.parentElement || document.body).backgroundColor;
          // Identity must be the ELEMENT, not its label. Keying on tag+text made three identical
          // ladder links on /bank-builder/ look like one element holding focus for three Tabs.
          let id = "";
          for (let n: HTMLElement | null = a; n && n.tagName !== "HTML"; n = n.parentElement) {
            id = `${n.tagName}:${[...(n.parentElement?.children ?? [])].indexOf(n)}>${id}`;
          }
          return { id, ring };
        });
        if (!probe) break;                       // tabbed out of the document — no trap
        if (!probe.ring) invisible.push(probe.id);
        path.push(probe.id);
      }

      expect(path.length, "nothing was keyboard-focusable").toBeGreaterThan(3);
      // A trap = the same element holding focus across many consecutive Tabs.
      const longestRun = path.reduce((acc: { id: string; run: number; max: number }, id) => {
        const run = id === acc.id ? acc.run + 1 : 1;
        return { id, run, max: Math.max(acc.max, run) };
      }, { id: "", run: 0, max: 0 }).max;
      expect(longestRun, `focus appears trapped on a single element on ${route}`).toBeLessThan(3);
      expect(invisible, `controls that take focus without any visible indicator on ${route}`).toEqual([]);
    });
  }
});

test.describe("reduced motion", () => {
  // Release D closure (Program 145): the audit found ~30 of 38 keyframe animations with no reduce
  // override, so a global kill-switch now neutralises everything. This proves it in a real engine
  // rather than trusting the stylesheet: under prefers-reduced-motion every computed animation and
  // transition duration must be ~0 on the animation-heavy routes.
  for (const route of ["/", "/bank-builder/", "/moonshot/"]) {
    test(`${route} — every animation collapses under prefers-reduced-motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("*")) {
          const cs = getComputedStyle(el);
          const durs = [cs.animationDuration, cs.transitionDuration].join(",").split(",");
          for (const d of durs) {
            const ms = d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000;
            if (Number.isFinite(ms) && ms > 10) {
              bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] ?? ""} ${d.trim()}`);
              break;
            }
          }
          if (bad.length > 5) break;
        }
        return bad;
      });
      expect(offenders, `animations surviving reduced motion on ${route}`).toEqual([]);
    });
  }
});

test.describe("disclosure widgets", () => {
  // /results/ carries 18 native <details> and /bank-builder/ one. No route in the launch-critical
  // set has role="dialog" or aria-modal, so there is no modal focus-trapping to verify — that
  // criterion is N/A by construction, not unproven.
  //
  // Native <details> is keyboard-accessible for free, which is exactly why this is worth a guard:
  // the accessibility comes from the ELEMENT, so it is lost silently the moment someone reaches for
  // a div+onClick, or sets `pointer-events`/`tabindex="-1"` on the summary for styling reasons.
  test.skip(({ browserName }) => browserName === "webkit", "WebKit excludes summary from Tab order by default");

  for (const route of ["/results/", "/bank-builder/"]) {
    test(`${route} — disclosures open by keyboard and reveal their content`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const summary = page.locator("details > summary").first();
      await expect(summary).toBeVisible();

      const details = page.locator("details").first();
      expect(await details.evaluate((d: HTMLDetailsElement) => d.open), "starts closed").toBe(false);

      await summary.focus();
      expect(
        await summary.evaluate((el) => el === document.activeElement),
        "the summary must be focusable — a styled-over div would fail here",
      ).toBe(true);

      await page.keyboard.press("Enter");
      expect(await details.evaluate((d: HTMLDetailsElement) => d.open), "Enter must open it").toBe(true);

      // Content inside must actually be reachable once revealed, not merely present in the DOM.
      const inner = details.locator("a, button, p, span, div").first();
      await expect(inner).toBeVisible();

      await page.keyboard.press("Enter");
      expect(await details.evaluate((d: HTMLDetailsElement) => d.open), "Enter must close it again").toBe(false);
    });
  }
});

test.describe("reflow", () => {
  // WCAG 1.4.10: content must not require two-dimensional scrolling at 320 CSS px. Playwright
  // cannot drive true browser zoom, so viewport narrowing is the standard equivalent and is what
  // is claimed here — nothing stronger.
  for (const route of ROUTES) {
    test(`${route} — no horizontal scrolling at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const offenders: string[] = [];
        if (de.scrollWidth > de.clientWidth + 1) {
          for (const el of document.querySelectorAll<HTMLElement>("*")) {
            const r = el.getBoundingClientRect();
            if (r.right > de.clientWidth + 1 && r.width > 8) {
              // A pane that scrolls INTERNALLY is the approved treatment for tabular content.
              const scrolls = ["auto", "scroll"].includes(getComputedStyle(el).overflowX);
              const inScroller = el.closest("[data-scroll-x], .overflow-x-auto, .overflow-x-scroll");
              if (!scrolls && !inScroller) offenders.push(el.tagName.toLowerCase() + "." + String(el.className || "").trim().split(/\s+/).slice(0, 2).join("."));
            }
          }
        }
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: [...new Set(offenders)].slice(0, 8) };
      });
      expect(overflow.offenders, `elements forcing 2-D scrolling on ${route} (${overflow.scrollWidth}px in ${overflow.clientWidth}px)`).toEqual([]);
    });
  }
});
