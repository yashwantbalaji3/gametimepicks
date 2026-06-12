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

test("canonical --lava-* design system exists with warm volcanic + ember values", () => {
  assert.ok(css.includes("--lava-bg: #0C0806;"), "lava base is warm volcanic");
  assert.ok(css.includes("--lava-card: #1C140E;"), "lava-glass card surface defined");
  assert.ok(css.includes("--lava-border: rgba(255, 120, 60, 0.16);"), "lava ember border defined");
  assert.ok(css.includes("--lava-text: #F8F4E9;"), "lava text is warm cream");
});

test("legacy --vault-* tokens reference the lava system (lava is the source of truth)", () => {
  assert.ok(css.includes("--vault-bg: var(--lava-bg);"), "vault base wired to lava");
  assert.ok(css.includes("--vault-border: var(--lava-border);"), "vault border wired to lava ember");
  assert.ok(css.includes("--vault-text: var(--lava-text);"), "vault text wired to lava cream");
  assert.ok(!css.includes("--vault-bg: #0A0B10;"), "old cool graphite base removed");
});

test("universal section rule + shell border are ember (lava sitewide), gold kept as crown", () => {
  assert.ok(css.includes("--vault-rule: rgba(255, 120, 60, 0.10);"), "section rule is ember");
  assert.ok(css.includes("--gtp-shell-border:    rgba(255, 120, 60, 0.18);"), "shell border is ember");
  assert.ok(css.includes("--vault-gold-bright: #F0C75E;"), "gold crown accent preserved");
});

test("card surfaces are warm volcanic, not cool navy (no hardcoded rgba(7,11,26))", () => {
  // The cool-navy card bg that made cards read graphite must be gone sitewide.
  const comps = fs.readdirSync("src/components", { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
    .map((f) => fs.readFileSync(`src/components/${f}`, "utf8")).join("\n");
  assert.ok(!/rgba\(7,\s*11,\s*26/.test(comps), "no cool-navy rgba(7,11,26) card backgrounds remain");
  assert.ok(/rgba\(26, 16, 11/.test(comps), "cards use the warm volcanic surface");
});

test("premium geometric headline face is wired", () => {
  assert.ok(css.includes("Space+Grotesk"), "Space Grotesk loaded via the font import");
  assert.ok(css.includes('--font-headline: "Space Grotesk"'), "headline token defined");
  assert.ok(tw.includes('display: ["var(--font-headline)"'), "font-display class maps to the headline face");
  assert.ok(css.includes("font-family: var(--font-headline);"), "headline classes use the face");
});
