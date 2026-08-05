/**
 * V1 immersive crimson-black theme contract (revamp): the base surfaces read NEUTRAL
 * near-black (not warm volcanic, not cool graphite), the universal card borders/rules are
 * CRIMSON (not gold/ember), a premium geometric headline face is wired, and text is
 * high-contrast. Gold survives ONLY on the dedicated crown token (--vault-gold).
 * Source-level assertions on globals.css + tailwind config, matching the repo convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/app/globals.css", "utf8");
const tw = fs.readFileSync("tailwind.config.ts", "utf8");

test("canonical --lava-* design system is the V1 crimson-black palette", () => {
  assert.ok(css.includes("--lava-bg: #0A0A0B;"), "base is V1 neutral near-black");
  assert.ok(css.includes("--lava-card: #17171A;"), "card surface is V1 dark");
  assert.ok(css.includes("--lava-border: rgba(225, 29, 42, 0.20);"), "border is crimson");
  assert.ok(css.includes("--lava-text: #F5F5F7;"), "text is high-contrast white");
});

test("legacy --vault-* tokens reference the lava system (lava is the source of truth)", () => {
  assert.ok(css.includes("--vault-bg: var(--lava-bg);"), "vault base wired to lava");
  assert.ok(css.includes("--vault-border: var(--lava-border);"), "vault border wired to lava ember");
  assert.ok(css.includes("--vault-text: var(--lava-text);"), "vault text wired to lava cream");
  assert.ok(!css.includes("--vault-bg: #0A0B10;"), "old cool graphite base removed");
});

test("universal section rule + shell border are crimson (V1 sitewide), gold kept only as crown", () => {
  assert.ok(css.includes("--vault-rule: rgba(225, 29, 42, 0.12);"), "section rule is crimson");
  assert.ok(css.includes("--gtp-shell-border:    rgba(225, 29, 42, 0.20);"), "shell border is crimson");
  // Program 137 lightened this crimson #F23645 -> #FA4A5A: as a TEXT colour the original
  // measured 3.21-4.49:1 on the dark surfaces, under WCAG AA everywhere it labelled
  // something. The guard still asserts what it always meant — the site accent is CRIMSON,
  // not the legacy gold — against the value that is now actually shipped.
  assert.ok(css.includes("--vault-gold-bright: #FA4A5A;"), "site accent is V1 crimson");
  assert.ok(css.includes("--vault-gold: #D4AF37;"), "true gold preserved for the Bank Builder crown");
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
