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

test("canonical design system is the GREEN base palette (P193)", () => {
  assert.ok(css.includes("--lava-bg: #070B09;"), "base is near-black with a green cast");
  assert.ok(css.includes("--lava-card: #121A16;"), "card surface is the green-cast dark");
  assert.ok(css.includes("--lava-border: rgba(52, 211, 153, 0.34);"), "border is brand green at legible alpha");
  assert.ok(css.includes("--lava-text: #F5F7F6;"), "text is high-contrast white");
});

test("legacy --vault-* tokens reference the lava system (lava is the source of truth)", () => {
  assert.ok(css.includes("--vault-bg: var(--lava-bg);"), "vault base wired to lava");
  assert.ok(css.includes("--vault-border: var(--lava-border);"), "vault border wired to lava ember");
  assert.ok(css.includes("--vault-text: var(--lava-text);"), "vault text wired to lava cream");
  assert.ok(!css.includes("--vault-bg: #0A0B10;"), "old cool graphite base removed");
});

test("universal section rule + shell border are BRAND GREEN (P193 sitewide), gold kept only as crown", () => {
  assert.ok(css.includes("--vault-rule: rgba(52, 211, 153, 0.22);"), "section rule is brand green at legible alpha");
  assert.ok(css.includes("--gtp-shell-border:    rgba(52, 211, 153, 0.32);"), "shell border is brand green at legible alpha");
  // Program 137 lightened this crimson #F23645 -> #FA4A5A: as a TEXT colour the original
  // measured 3.21-4.49:1 on the dark surfaces, under WCAG AA everywhere it labelled
  // something. The guard still asserts what it always meant — the site accent is CRIMSON,
  // not the legacy gold — against the value that is now actually shipped.
  /*
   * P185 repointed this token to the honest name. The guard's INTENT is unchanged and is now
   * checked against the wiring rather than one literal string: the site accent must still be the
   * brand green #34D399, and --vault-gold-bright must still resolve to it. Asserting BOTH halves
   * is stricter than the old single-line check — the accent cannot be changed by editing either
   * the alias or the value it points at.
   */
  assert.ok(css.includes("--vault-accent: #34D399;"), "site accent is brand green");
  assert.ok(css.includes("--vault-gold-bright: var(--vault-accent);"),
    "the legacy accent name must resolve to the canonical accent, not carry its own value");
  assert.ok(css.includes("--vault-gold: #D4AF37;"), "true gold preserved for the Bank Builder crown");
});

test("RED IS RESERVED — it means a loss, or UFC, and is never structural", () => {
  // The whole point of the green base: in a paper-trading product a red border reads as failure.
  // Red survives in exactly two roles, and this guard fails if it creeps back into the chrome.
  const structural = ["--vault-rule", "--gtp-shell-border", "--gtp-card-border", "--lava-border", "--vault-border-active"];
  for (const token of structural) {
    const m = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
    assert.ok(m, `${token} is defined`);
    assert.ok(!/rgba\(\s*2[0-9]{2},\s*[0-5][0-9],|#(FA4A5A|E11D2A|9B1B16)/i.test(m[1]),
      `${token} is ${m[1].trim()} — structural colour must not be red; red means a loss`);
  }
  assert.ok(css.includes("--sport-ufc: #FB923C;"), "fight night is ember, distinct from a losing result");
  assert.ok(css.includes("--vault-danger: #F87171;"), "and one more: a losing result");
});

test("every sport keeps a DISTINCT accent once green becomes the base", () => {
  // The green base claims emerald for the brand, so any sport still sitting on it would read as
  // ordinary chrome. Each sport hue must differ from the brand accent and from every other sport.
  const brand = "#34D399";
  const hues = {};
  for (const sport of ["mlb", "nfl", "ufc", "soccer", "nba", "nhl"]) {
    const m = new RegExp(`--sport-${sport}:\\s*(#[0-9A-Fa-f]{6});`).exec(css);
    assert.ok(m, `--sport-${sport} is defined`);
    assert.notEqual(m[1].toUpperCase(), brand, `--sport-${sport} is the brand accent — it would vanish into the chrome`);
    hues[sport] = m[1].toUpperCase();
  }
  const dangerMatch = /--vault-danger:\s*(#[0-9A-Fa-f]{6});/.exec(css);
  assert.ok(dangerMatch, "--vault-danger is defined");
  const seen = new Map();
  for (const [sport, hex] of Object.entries(hues)) {
    assert.notEqual(hex, dangerMatch[1].toUpperCase(),
      `--sport-${sport} is the LOSS colour — a sport chip must never read as a losing result`);
    assert.ok(!seen.has(hex), `${sport} and ${seen.get(hex)} share ${hex} — sports must be told apart at a glance`);
    seen.set(hex, sport);
  }
});

test("card surfaces are the GREEN-CAST dark, not cool navy and no longer warm volcanic", () => {
  // The cool-navy card bg that made cards read graphite must be gone sitewide.
  const comps = fs.readdirSync("src/components", { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
    .map((f) => fs.readFileSync(`src/components/${f}`, "utf8")).join("\n");
  assert.ok(!/rgba\(7,\s*11,\s*26/.test(comps), "no cool-navy rgba(7,11,26) card backgrounds remain");
  // Two retired surfaces must stay retired: the cool navy that made cards read graphite, and the
  // warm volcanic brown of the crimson era, which P193 replaced so the chrome no longer carries the
  // old palette's temperature underneath the green base.
  assert.ok(!/rgba\(\s*26,\s*16,\s*11/.test(comps), "no warm volcanic rgba(26,16,11) surfaces remain");
  /* P210 (F8 closure): components no longer carry the literal — they consume the token. The
     invariant is unchanged and now asserted at both ends: the token DEFINES the green-cast value,
     and components actually consume it. */
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /--vault-scrim-base:\s*#0B120E/i, "the scrim token IS the green-cast dark");
  assert.ok(/var\(--vault-scrim-base\)/.test(comps), "cards consume the green-cast surface via its token");
});

test("premium geometric headline face is wired", () => {
  assert.ok(css.includes("Space+Grotesk"), "Space Grotesk loaded via the font import");
  assert.ok(css.includes('--font-headline: "Space Grotesk"'), "headline token defined");
  assert.ok(tw.includes('display: ["var(--font-headline)"'), "font-display class maps to the headline face");
  assert.ok(css.includes("font-family: var(--font-headline);"), "headline classes use the face");
});
