/**
 * P206 · Phase 6 — every control and every entity asset, mechanically.
 *
 * Buttons and links: no placeholder hrefs, no dead anchors, no internal/retired destinations, no
 * two-hop redirects on primary CTAs; every enabled button carries an accessible name. Assets: no
 * visible image may sit at naturalWidth 0 — the canonical resolvers swap failures to designed
 * fallbacks, so a broken-image glyph anywhere is a resolver bypass. Structural DOM checks, so one
 * engine suffices (the cross-engine matrix owns layout).
 */
import { test, expect } from "@playwright/test";

const ROUTES = [
  "/", "/today/", "/simulate/", "/markets/", "/build/", "/sports/", "/results/",
  "/mlb/", "/epl/", "/ufc/", "/nfl/",
  "/cards/epl/", "/cards/ufc/", "/cards/nfl/",
  "/bank-builder/", "/moonshot/", "/mr-dub/", "/results/parlay-lab/", "/learn/",
] as const;

const INTERNAL = ["/launch", "/ops", "/preview"];

test.describe("controls", () => {
  for (const route of ROUTES) {
    test(`${route} — links resolve, buttons are named, nothing is dead`, async ({ page, request }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const anchors = await page.$$eval("a", (as) =>
        as.map((a) => ({
          href: a.getAttribute("href"),
          text: (a.textContent || "").trim().slice(0, 40),
          fragmentTargetExists: (a.getAttribute("href") || "").startsWith("#") && (a.getAttribute("href") || "").length > 1
            ? !!document.getElementById((a.getAttribute("href") || "").slice(1))
            : null,
        })));
      for (const a of anchors) {
        expect(a.href, `${route}: anchor "${a.text}" has a real href`).toBeTruthy();
        // A fragment anchor is legitimate wayfinding (skip links, section jumps) — but only when
        // its target exists on the page. A bare "#" or javascript: is a dead control.
        expect(a.href, `${route}: anchor "${a.text}" is not a placeholder`).not.toMatch(/^(#$|javascript:)/);
        if (a.fragmentTargetExists !== null) {
          expect(a.fragmentTargetExists, `${route}: hash anchor "${a.text}" (${a.href}) points at an existing element`).toBe(true);
        }
        for (const bad of INTERNAL) {
          expect(a.href!.startsWith(bad), `${route}: anchor "${a.text}" links internal path ${a.href}`).toBe(false);
        }
      }

      // Every distinct internal destination answers: 200, or one redirect landing 200.
      const internalHrefs = [...new Set(
        anchors.map((a) => a.href!).filter((h) => h.startsWith("/") && !h.startsWith("//")).map((h) => h.split("#")[0].split("?")[0]).filter(Boolean),
      )];
      for (const href of internalHrefs) {
        const res = await request.get(href, { maxRedirects: 0 }).catch(() => null);
        expect(res, `${route} → ${href}: reachable`).not.toBeNull();
        const status = res!.status();
        if (status >= 300 && status < 400) {
          const loc = res!.headers()["location"];
          expect(loc, `${route} → ${href}: redirect names a target`).toBeTruthy();
          const hop = await request.get(loc!, { maxRedirects: 0 }).catch(() => null);
          expect(hop && hop.status() === 200, `${route} → ${href} → ${loc}: one hop lands (got ${hop?.status()})`).toBe(true);
        } else {
          expect(status, `${route} → ${href}: answers 200`).toBe(200);
        }
      }

      const buttons = await page.$$eval("button:not([disabled])", (bs) =>
        bs.filter((b) => !!(b as HTMLElement).offsetParent).map((b) => ({
          name: (b.getAttribute("aria-label") || b.textContent || "").trim(),
        })));
      for (const b of buttons) {
        expect(b.name.length, `${route}: an enabled visible button carries an accessible name`).toBeGreaterThan(0);
      }
    });
  }
});

test.describe("entity assets", () => {
  for (const route of ["/", "/today/", "/mlb/", "/epl/", "/ufc/", "/nfl/", "/build/", "/cards/epl/", "/cards/ufc/"] as const) {
    test(`${route} — no visible broken image`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const broken = await page.$$eval("img", (imgs) =>
        imgs
          .filter((im) => !!(im as HTMLElement).offsetParent && im.complete && (im as HTMLImageElement).naturalWidth === 0 && !!im.getAttribute("src"))
          .map((im) => im.getAttribute("src")!.slice(0, 90)));
      expect(broken, `${route}: visible images at naturalWidth 0 (resolver bypass): ${broken.join(", ")}`).toEqual([]);
    });
  }
});
