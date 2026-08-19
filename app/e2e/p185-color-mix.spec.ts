import { test, expect } from "@playwright/test";

/* The P185 migration replaces rgba() literals with color-mix(). If any engine does not support
   color-mix, those surfaces render transparent — a silent, total loss of the card backgrounds on
   live game routes. This asserts the computed value in EVERY engine, not just Chromium. */
test("color-mix resolves to the exact rgba the migration replaced", async ({ page }) => {
  await page.goto("/games/mlb/ath-vs-kc-2026-08-18/");
  const got = await page.evaluate(() => {
    const p = document.createElement("div");
    document.body.appendChild(p);
    const r = (v: string) => { p.style.color = ""; p.style.color = v; return getComputedStyle(p).color; };
    const out = {
      accent18: r("color-mix(in srgb, var(--vault-accent) 18%, transparent)"),
      wash5: r("color-mix(in srgb, var(--vault-wash-base) 5%, transparent)"),
      ink45: r("color-mix(in srgb, var(--vault-ink-black) 45%, transparent)"),
      accentRaw: r("var(--vault-accent)"),
      aliasRaw: r("var(--vault-gold-bright)"),
    };
    p.remove();
    return out;
  });
  const rgba = (s: string) => {
    const m = s.match(/[\d.]+/g)!.map(Number);
    // engines report either rgb()/rgba() 0-255 or color(srgb ..) 0-1
    const scale = s.startsWith("color(") ? 255 : 1;
    return [Math.round(m[0] * scale), Math.round(m[1] * scale), Math.round(m[2] * scale), m[3] ?? 1];
  };
  expect(rgba(got.accent18)).toEqual([52, 211, 153, 0.18]);
  expect(rgba(got.wash5)).toEqual([255, 255, 255, 0.05]);
  expect(rgba(got.ink45)).toEqual([0, 0, 0, 0.45]);
  expect(rgba(got.accentRaw)).toEqual(rgba(got.aliasRaw)); // the alias is proven identical
});
