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
/* P188: the EPL per-fixture report, discovered like the NFL one — slugs change every matchweek. */
const EPL_MATCH_DIR = path.join(__dirname, "..", "out", "epl", "match");
const FIRST_EPL_MATCH = fs.existsSync(EPL_MATCH_DIR)
  ? fs.readdirSync(EPL_MATCH_DIR).filter((d) => /-v-.+-\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0]
  : null;
/* v1.4: a Matchup Explorer page, discovered like the NFL game report — game ids change every week. */
const MATCHUP_DIR = path.join(__dirname, "..", "out", "matchups", "nfl");
const FIRST_NFL_MATCHUP = fs.existsSync(MATCHUP_DIR) ? fs.readdirSync(MATCHUP_DIR).filter((d) => /^\d+$/.test(d)).sort()[0] : null;
const ROUTES = ["/", "/models/", "/saved/", "/today/", "/markets/", "/results/", "/methodology/", "/learn/", "/moonshot/", "/bank-builder/", "/mlb/", "/nfl/", "/simulate/", "/sports/",
  // P196: /ufc/ gained the skipped-card disclosure; the two in-development product pages are new
  // public routes and introduce their own status palette, which is exactly what contrast catches.
  // P188: /epl/ publishes forecasts and its per-fixture report introduces charts + tables.
  "/ufc/", "/goal-rush/", "/bucket-blitz/", "/epl/",
  // P208: the Parlay Center's Build Your Own mode — new public route with the builder + draft UI.
  "/build/custom/",
  // v1.6: Ask GameTime. Its empty state is what renders without a backend, which is exactly the state
  // a static contrast + reflow pass should judge — and it carries the new risk-style control group.
  "/ask/",
  // The picks-vs-outcomes record is the widest tabular content on the site — five columns of model
  // pick against actual outcome — and a table is precisely what fails WCAG 1.4.10 at 320px. The
  // cross-sport index and the largest per-sport record are both covered, because the index has its
  // own six-column table and MLB's page ships the most rows.
  "/results/picks/", "/results/picks/mlb/", "/results/picks/ufc/",
  ...(FIRST_NFL_GAME ? [`/nfl/game/${FIRST_NFL_GAME}/`] : []),
  ...(FIRST_EPL_MATCH ? [`/epl/match/${FIRST_EPL_MATCH}/`] : []),
  // v1.3 Team + Player Research: the widest research table (an NFL team's season log) and a player page with the
  // stat-group buttons, season select, chart and 12-column game log. Stable slugs from the research registry.
  "/teams/nfl/kansas-city-chiefs/", "/players/nfl/travis-kelce/",
  // v1.4 Matchup Explorer + Compare: the Player Compare shell with a real pair composed in the browser (selectors, stat
  // and season selects, window buttons, bars, two tables) and one Matchup page (team panels + the meetings table the
  // Team Compare shell shares). Two routes, not three, to hold the CI budget; Team Compare is covered by browser QA.
  "/compare/players/nfl/?a=keenan-allen&b=travis-kelce",
  ...(FIRST_NFL_MATCHUP ? [`/matchups/nfl/${FIRST_NFL_MATCHUP}/`] : []),
  // v1.5 Research Lab: ONE representative composed state — the Game Finder with a team selected, which renders the
  // mode tabs, the sport chips, four selects, the collapsible filter panel, the coverage strip, a seven-column
  // result table and the pager. That is every control class the three modes use; the Player and Season modes are
  // covered by browser QA, to hold the CI budget the same way Team Compare is.
  "/research/lab/?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs"];

/** A Compare shell and the Research Lab build their UI after mount from static assets; audit the composed state. */
async function gotoAudited(page: import("@playwright/test").Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  if (route.startsWith("/compare/") && route.includes("?a=")) await page.waitForSelector("#cmp-season-summary", { timeout: 15000 });
  // The Lab's controls exist only once its selector index has loaded; the table only once the query has run.
  if (route.startsWith("/research/lab/")) await page.waitForSelector("[data-scroll-x] table", { timeout: 15000 });
}

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
        await gotoAudited(page, route);
        const failures = await contrastFailures(page);
        expect(
          failures,
          `WCAG AA contrast failures on ${route} @${vp.name}:\n${failures.map((f) => `  ${f.ratio}:1 (needs ${f.need}) ${f.selector} — "${f.text}"`).join("\n")}`,
        ).toEqual([]);
      });
    }
  }
});

/*
 * v1.4.1: the Compare shells build their controls AFTER mount (the pair composes in the browser), so the structural
 * audit — which reads static HTML — never sees them. A control with no accessible name is unusable by voice control
 * and announced as "combo box" alone. Checked on the composed page, on every engine.
 */
test.describe("form controls carry accessible names", () => {
  for (const route of ROUTES.filter((r) => r.startsWith("/compare/") || r.startsWith("/research/lab/"))) {
    test(`${route} — every control is named`, async ({ page }) => {
      await gotoAudited(page, route);
      const unnamed = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("main select, main input, main button, main [role='listbox'], main [role='combobox']")) {
          const id = el.getAttribute("id");
          // A <select>'s own option text is NOT its accessible name (and an <input>'s value is not either):
          // only a button-like control is named by its content.
          const contentNames = /^(BUTTON|A)$/.test(el.tagName) || el.getAttribute("role") === "button";
          const named = !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")
            || (id && document.querySelector(`label[for="${id}"]`))
            || el.closest("label")
            || (contentNames && (el.textContent ?? "").trim()));
          if (!named) out.push(`${el.tagName.toLowerCase()}${id ? "#" + id : ""}`);
        }
        return out;
      });
      expect(unnamed, `controls with no accessible name on ${route}`).toEqual([]);
    });
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

test.describe("modal dialogs", () => {
  // 🔴 THIS BLOCK EXISTS BECAUSE THE COMMENT BELOW USED TO SAY THE OPPOSITE, AND WENT STALE.
  //
  // It read: "No route in the launch-critical set has role=\"dialog\" or aria-modal, so there is no
  // modal focus-trapping to verify — that criterion is N/A by construction, not unproven." That was
  // true when written. It stopped being true in #705, which gave four dialogs the shared
  // `useDialogFocus` primitive, and again in #714, which found a fifth — /build/custom's mobile
  // sheet — that had no role, no accessible name, no Escape and no focus trap at all.
  //
  // So the one layer that could prove the KEYBOARD BEHAVIOUR in a real browser was explicitly
  // opting out, on the strength of a claim that had expired. A criterion asserted N/A is only
  // honest while it stays N/A.
  //
  // The unit guards cover markup and structure (`src/lib/uiux/dialog-focus.test.mjs` enumerates
  // every `fixed inset-0` overlay and requires the primitive). Tab containment and focus RETURN are
  // facts about a real focus system, so they belong here.
  /**
   * ⚠ THIS CASE EXISTS BECAUSE THE /build ONE CAN SILENTLY NEVER RUN.
   *
   * That test needs an eligible leg to add, and the /build pool was EMPTY on 2026-09-27 — so it took
   * its honest skip branch and the gate went green having proved nothing about Tab containment. A
   * test that skips on a data condition is not a guard; it is a guard-shaped thing that reports
   * success. CI printed "9 skipped · 432 passed" and its reporter prints no titles, so I could not
   * even tell from the log which had skipped.
   *
   * The mobile Menu needs no data. It is on every page at phone width, and it is the ORIGINALLY
   * REPORTED defect — "mobile Menu allows Shift+Tab escape into background" — so the keyboard
   * contract is proved on every run, and the /build sheet becomes the extra case when a pool exists.
   */
  test("the mobile Menu contains Tab both ways, closes on Escape, and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/today/", { waitUntil: "domcontentloaded" });

    const opener = page.getByRole("button", { name: /^Menu \u2014/ });
    await expect(opener, "the mobile Menu button is on every page at phone width \u2014 no data needed").toHaveCount(1);
    await opener.focus();
    const openerBefore = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
    await opener.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const inside = () => page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && d.contains(document.activeElement));
    });
    expect(await inside(), "opening must move focus into the sheet").toBe(true);

    // \u26a0 THE REPORTED DEFECT: Shift+Tab from the first control walked out into the page behind.
    await page.keyboard.press("Shift+Tab");
    expect(await inside(), "Shift+Tab escaped the Menu into the background").toBe(true);

    for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
    expect(await inside(), "Tab escaped the Menu").toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog, "Escape must close the Menu").toHaveCount(0);

    expect(await page.evaluate(() => document.activeElement === document.body),
      "focus was dropped on <body> instead of returned to the opener").toBe(false);
    if (openerBefore) {
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null)).toBe(openerBefore);
    }
  });

  test("the /build mobile sheet is a real dialog: name, Escape, trap, and focus return", async ({ page }) => {
    // The sheet is mobile-only — the desktop layout shows the same card in a sticky sidebar that is
    // NOT a dialog, so a desktop viewport would find nothing and pass vacuously.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/build/custom/", { waitUntil: "domcontentloaded" });

    // The bottom bar exists ONLY once the card has a leg ("View card · 0 legs" was an affordance
    // with nothing behind it, P208 F4), so a leg has to be added the way a reader adds one.
    //
    // ⚠ BY CLICKING, NOT BY SEEDING localStorage. The draft lives in browser storage, and injecting a
    // key would skip the real activation path — a test that passes while the button is broken. This
    // repo has been bitten by key-injection standing in for native activation before.
    const add = page.getByRole("button", { name: "Add leg" }).first();
    /*
     * ⚠ ELIGIBILITY IS RE-DERIVED ON THE READER'S CLOCK, so a leg can stop being addable WHILE this
     *   page is open. The export is static, but `legHasStarted` is evaluated client-side — during
     *   the 1pm slate on 2026-09-27 a button was present when counted and gone by the time it was
     *   clicked, and the click sat there until the 30s timeout.
     *
     *   So the gate is "is one ACTUALLY actionable", asked with a bounded wait, rather than "does
     *   one exist". An empty or fully-started pool is a legitimate state — a test that invented a
     *   card would be testing its own fixture — and the Menu case above runs unconditionally, so a
     *   skip here leaves no keyboard contract unproven.
     */
    const addable = await add
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => add.isEnabled({ timeout: 2_000 }))
      .catch(() => false);
    if (!addable) {
      console.log("[a11y] /build sheet SKIPPED: no addable leg on this slate (empty pool, or every game has started)");
      test.skip(true, "no addable leg on this slate, so no sheet can be opened");
    }
    /* Still guard the click itself: the same race can land between the check above and here. */
    try {
      await add.click({ timeout: 10_000 });
    } catch {
      console.log("[a11y] /build sheet SKIPPED: the leg stopped being addable mid-test (a game started)");
      test.skip(true, "the eligible pool changed under the test, which is the product behaving correctly");
    }

    const opener = page.getByRole("button", { name: /view card/i }).first();
    await expect(opener, "adding a leg must reveal the mobile card bar").toHaveCount(1);
    await opener.focus();
    const openerId = await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 80) ?? null);
    await opener.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog, "the sheet must expose role=dialog").toHaveCount(1);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    // An accessible name, not merely an aria-label attribute somewhere on the page.
    expect(await dialog.evaluate((el) => el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")),
      "the dialog itself needs an accessible name").toBeTruthy();

    // Focus moved INTO the sheet.
    expect(await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && d.contains(document.activeElement));
    }), "opening must move focus into the dialog, not leave it on the page").toBe(true);

    // ⚠ Shift+Tab from the first control is the reported defect: it walked out into the page behind.
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && d.contains(document.activeElement));
    }), "Shift+Tab escaped the dialog").toBe(true);

    // And forward, all the way round.
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && d.contains(document.activeElement));
    }), "Tab escaped the dialog").toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog, "Escape must close the sheet").toHaveCount(0);

    // Focus returns to whatever opened it — not to <body>, which makes a reader start from the top.
    const returned = await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 80) ?? null);
    expect(returned, "focus was dropped on <body> instead of returned to the opener").not.toBeNull();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    if (openerId) expect(returned).toBe(openerId);
  });
});

test.describe("disclosure widgets", () => {
  // /results/ carries 18 native <details> and /bank-builder/ one.
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
      await gotoAudited(page, route);
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
      /* v1.4: an absolutely positioned descendant (an sr-only table header) escapes a NON-positioned scroller, so the
         document grows wider than the screen while no element reports as an offender — a phone then zooms the whole
         page out. The offender scan above cannot see that; the document width can. Pinned for the research + compare
         families that found it (other routes keep the offender check alone until audited). */
      if (/^\/(compare|matchups|teams|players|research\/lab)\//.test(route)) {
        expect(overflow.scrollWidth, `document wider than the screen on ${route}`).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });
  }
});

/* QA 2026-10-05: the routes where axe found sideways-scrolling boxes a keyboard could not reach
   (`scrollable-region-focusable`) and links told apart by colour alone (`link-in-text-block`).
   Both are fixed site-wide by components/a11y/scroll-region-a11y.tsx; these pin the result. */
const QA_A11Y_ROUTES = ["/results/", "/results/nfl/", "/results/mlb/", "/results/model-audit/", "/results/forecasts/nfl/nfl-game-winner/",
  "/nfl/", "/epl/", "/ufc/", "/sports/", "/models/", "/methodology/", "/bank-builder/", "/moonshot/"];

test.describe("sideways-scrolling boxes are keyboard reachable", () => {
  // WCAG 2.1.1: a box that scrolls must be focusable (or hold controls reaching its last column) so the arrow keys can scroll it.
  for (const route of QA_A11Y_ROUTES) {
    test(`${route} — every scrolling box at 390px can take focus and has a name`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoAudited(page, route);
      await expect.poll(() => page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("main *")) {
          if (el.scrollWidth <= el.clientWidth + 1) continue;
          if (!["auto", "scroll"].includes(getComputedStyle(el).overflowX)) continue;
          // Controls inside only excuse the box when tabbing through them scrolls it to its last column —
          // links in a first column alone left Results tables' right-hand columns out of keyboard reach.
          const controls = Array.from(el.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]"));
          const left = el.getBoundingClientRect().left - el.scrollLeft;
          const rightmost = Math.max(el.clientWidth, ...controls.map((c) => c.getBoundingClientRect().right - left));
          if (controls.length && el.scrollWidth - rightmost <= 24) continue;
          const named = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
          // A name is a short label, not a panel's whole text read aloud.
          if (el.tabIndex < 0 || !named || named.length > 81) bad.push(el.tagName.toLowerCase() + "." + String(el.className || "").trim().split(/\s+/).slice(0, 2).join("."));
        }
        return bad;
      }), { message: `unreachable scrolling boxes on ${route}`, timeout: 5000 }).toEqual([]);
    });
  }
});

test.describe("links inside sentences do not rely on colour", () => {
  // WCAG 1.4.1: an inline link whose block also holds other text needs a non-colour cue (an underline).
  for (const route of QA_A11Y_ROUTES) {
    test(`${route} — inline links in running text are underlined`, async ({ page }) => {
      await gotoAudited(page, route);
      await expect.poll(() => page.evaluate(() => {
        const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
        // Text on the block's own lines only — a nested block (a date row under a title link) is not the link's sentence.
        const inlineText = (node: Node): string => Array.from(node.childNodes).map((c) =>
          c.nodeType === Node.TEXT_NODE ? c.textContent ?? "" : c instanceof Element && getComputedStyle(c).display.startsWith("inline") ? inlineText(c) : "").join("");
        const bad: string[] = [];
        for (const a of document.querySelectorAll<HTMLAnchorElement>("main a[href]")) {
          const cs = getComputedStyle(a);
          if (cs.display !== "inline" || !a.getClientRects().length || a.closest("nav, [role=navigation], [role=button]")) continue;
          let block = a.parentElement;
          while (block && getComputedStyle(block).display.startsWith("inline")) block = block.parentElement;
          if (!block || !/[a-z0-9]{2,}/i.test(inlineText(block).replace(a.textContent ?? "", ""))) continue;
          // The same non-colour cues axe's `link-in-text-block` accepts: underline, border, or a clearly heavier weight.
          const weightGap = Math.abs(parseInt(cs.fontWeight, 10) - parseInt(getComputedStyle(block).fontWeight, 10));
          const cue = cs.textDecorationLine.includes("underline") || parseFloat(cs.borderBottomWidth) > 0 || weightGap >= 200;
          if (!cue) bad.push(`"${text(a).slice(0, 40)}" → ${a.getAttribute("href")}`);
        }
        return bad.slice(0, 10);
      }), { message: `colour-only links on ${route}`, timeout: 5000 }).toEqual([]);
    });
  }
});
