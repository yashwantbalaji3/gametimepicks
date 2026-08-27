/**
 * FOOTER IDENTITY (Restructure Chunk 1, Phase 2) — the footer identity copy is simulation-first and
 * multi-sport, not the old NBA-player-prop framing, and the footer surfaces the flagship products.
 * Paper-only / educational framing stays; no banned copy; money untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FOOTER = fs.readFileSync("src/components/footer.tsx", "utf8");
const app = process.cwd();
/** The rendered sitemap from the built export, when one exists. Null on a source-only run. */
function builtSitemap() {
  const f = path.join(app, "out", "today", "index.html");
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, "utf8");
  const i = html.indexOf('aria-label="Site map"');
  return i === -1 ? null : html.slice(i, i + 6000);
}
// House banned copy (whole words where ambiguous). "block"/"unlock" are fine.
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free|easy money/i;

// ── 1 · the footer no longer carries the stale NBA-only identity ──────────────────────────────────
test("footer identity is no longer NBA-only", () => {
  assert.ok(!/NBA player-prop/i.test(FOOTER), "old 'NBA player-prop analytics' tagline is gone");
  assert.ok(!/NBA player\s*\n?\s*props/i.test(FOOTER), "old 'NBA player props' identity prose is gone");
  assert.ok(!/Transparent NBA/i.test(FOOTER), "old 'Transparent NBA…' tagline is gone");
  // A per-sport "NBA · off-season" LINK is fine — that is a sport link, not the site identity.
});

// ── 2 · the footer surfaces the flagship products ────────────────────────────────────────────────
test("footer links the flagship products (Simulate, Today, Bank Builder, Results)", () => {
  /*
   * P185 derived the footer from the canonical destination list, so these hrefs no longer appear
   * literally in footer.tsx — the same move P196 made for the top nav, rail and mobile bar. The
   * assertion is unchanged in intent and STRONGER in reach: it now checks the rendered sitemap
   * where one exists, which proves what a visitor is served rather than what a source file says.
   */
  const built = builtSitemap();
  const expected = [
    ["/simulate", "Simulate"], ["/today", "Today"], ["/bank-builder", "Bank Builder"],
    ["/results", "Results"], ["/methodology", "Methodology"], ["/learn", "How It Works"],
  ];
  if (built) {
    for (const [href, label] of expected) {
      // The static export writes trailing slashes.
      assert.match(built, new RegExp(`href="${href}/?"[^>]*>${label}`), `links ${label}`);
    }
    return;
  }
  const registry = fs.readFileSync(path.join(app, "src/lib/navigation.ts"), "utf8");
  for (const [href, label] of expected) {
    assert.match(registry, new RegExp(`href: "${href}", label: "${label}"`), `${label} is a destination`);
    // A destination the footer does not carry cannot appear in the sitemap.
    const decl = registry.slice(registry.indexOf(`href: "${href}"`));
    assert.match(decl.slice(0, decl.indexOf("},")), /"footer"/, `${label} carries the footer surface`);
  }
});

// ── 3 · ONE approved educational sentence + the About link (P213 · Release A) ─────────────────────
/*
 * The footer used to REQUIRE the full identity paragraph ("simulation-first… same model output for
 * every user"). P213's copy governance centralizes identity/methodology prose at /about — and the
 * old footer paragraph had already rotted ("MLB is the one sport currently modelled" survived EPL
 * forecasts and UFC predictions going live). The footer's contract now: the ONE approved
 * educational/legal sentence, paper-only stated, and the About link to the identity owner.
 */
test("footer carries the one approved educational sentence and links the About owner", () => {
  assert.match(FOOTER, /paper-only/i, "paper-only framing present");
  assert.match(FOOTER, /not betting advice/i, "not-betting-advice disclaimer present");
  assert.match(FOOTER, /educational and research use only/i, "the approved sentence is intact");
  assert.match(FOOTER, /href="\/about\/?"/, "the About owner is linked where the paragraph used to be");
  assert.ok(!/one sport currently modelled/i.test(FOOTER), "the stale coverage claim never returns");
});

// ── 4 · no banned copy anywhere in the footer ────────────────────────────────────────────────────
test("no banned copy in the footer", () => {
  assert.ok(!BANNED.test(FOOTER), "footer has no banned/hype copy");
});

// ── 5 · canonical money file untouched ───────────────────────────────────────────────────────────
test("canonical money (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync("public/data/mr-dub/portfolio.json")).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
