/**
 * FOOTER IDENTITY (Restructure Chunk 1, Phase 2) — the footer identity copy is simulation-first and
 * multi-sport, not the old NBA-player-prop framing, and the footer surfaces the flagship products.
 * Paper-only / educational framing stays; no banned copy; money untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const FOOTER = fs.readFileSync("src/components/footer.tsx", "utf8");
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
  assert.match(FOOTER, /href="\/simulate"[^>]*>Simulate</, "links Simulate");
  assert.match(FOOTER, /href="\/today"[^>]*>Today</, "links Today");
  assert.match(FOOTER, /href="\/bank-builder"[^>]*>Bank Builder</, "links Bank Builder");
  assert.match(FOOTER, /href="\/results"[^>]*>Results</, "links Results");
  // Methodology / How It Works stay reachable.
  assert.match(FOOTER, /href="\/methodology"[^>]*>Methodology</, "links Methodology");
  assert.match(FOOTER, /href="\/learn"[^>]*>How It Works</, "links How It Works");
});

// ── 3 · simulation-first, paper-only, same-output identity copy present ───────────────────────────
test("footer carries simulation-first + paper-only identity copy", () => {
  assert.match(FOOTER, /simulation-first/i, "simulation-first framing present");
  assert.match(FOOTER, /paper-only/i, "paper-only framing present");
  assert.match(FOOTER, /same model output for every\s*\n?\s*user/i, "same-output-for-every-user framing present");
  assert.match(FOOTER, /not betting advice/i, "not-betting-advice disclaimer present");
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
