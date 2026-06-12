/**
 * Hot-lava casino theme contract: the base surfaces must read WARM volcanic (not the
 * old cool graphite), the universal card borders/rules must be EMBER (not gold-tinted),
 * a premium geometric headline face must be wired, and readability (warm cream text)
 * preserved. Source-level assertions on globals.css + tailwind config, matching the
 * repo's component-test convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/app/globals.css", "utf8");
const tw = fs.readFileSync("tailwind.config.ts", "utf8");

test("base + panel surfaces are warm volcanic, not cool graphite", () => {
  assert.ok(css.includes("--vault-bg: #0C0806;"), "vault base warmed to volcanic obsidian");
  assert.ok(css.includes("--gtp-card:            #1C140E;"), "card surface warmed");
  assert.ok(!css.includes("--vault-bg: #0A0B10;"), "old cool graphite base removed");
});

test("universal borders/rules are ember (lava sitewide), gold kept only as crown", () => {
  assert.ok(css.includes("--vault-border: rgba(255, 120, 60, 0.16);"), "card border is ember");
  assert.ok(css.includes("--vault-rule: rgba(255, 120, 60, 0.10);"), "section rule is ember");
  assert.ok(css.includes("--gtp-shell-border:    rgba(255, 120, 60, 0.18);"), "shell border is ember");
  // crown gold stays available for brand/Bank Builder accents
  assert.ok(css.includes("--vault-gold-bright: #F0C75E;"), "gold crown accent preserved");
});

test("text stays warm cream for readability (not reduced to chase visuals)", () => {
  assert.ok(css.includes("--vault-text: #F8F4E9;"), "primary text warm cream");
});

test("premium geometric headline face is wired", () => {
  assert.ok(css.includes("Space+Grotesk"), "Space Grotesk loaded via the font import");
  assert.ok(css.includes('--font-headline: "Space Grotesk"'), "headline token defined");
  assert.ok(tw.includes('display: ["var(--font-headline)"'), "font-display class maps to the headline face");
  assert.ok(css.includes("font-family: var(--font-headline);"), "headline classes use the face");
});
