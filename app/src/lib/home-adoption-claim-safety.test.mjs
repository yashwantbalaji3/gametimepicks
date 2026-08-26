/**
 * HOMEPAGE ADOPTION CLAIM-SAFETY (Adoption Sprint · Phase 3). The landing surfaces added/changed this sprint —
 * the sim/research/prediction triad (what-this-is), the return hook, and the reframed top-bar money chip — must
 * carry NO profit/edge/guarantee language and must not present the money figure as a headline profit claim.
 * Run: npx tsx --test src/lib/home-adoption-claim-safety.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (p) => fs.readFileSync(path.join(app, p), "utf8");
// Only the human-visible copy matters; strip line comments + block comments so a "do not say X" note never trips the scan.
const visible = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const FORBIDDEN = ["beat the market", "guaranteed", "profitable", "best bet", " lock ", "locks in", "value pick", "market mistake", "\\bedge\\b"];

const HOME_SURFACES = [
  "src/components/home/what-this-is.tsx",
  "src/components/home/return-hook.tsx",
  "src/components/slate-status-bar.tsx",
];

test("1 · the new/changed landing surfaces carry no forbidden profit/edge/guarantee vocabulary", () => {
  for (const f of HOME_SURFACES) {
    const s = visible(read(f)).toLowerCase();
    for (const term of FORBIDDEN) {
      const re = new RegExp(term.toLowerCase());
      assert.ok(!re.test(s), `${f} must not contain ${JSON.stringify(term)}`);
    }
  }
});

test("2 · the triad keeps the honest three-way separation (live / building-gated / not-claimed)", () => {
  const s = read("src/components/home/what-this-is.tsx");
  assert.match(s, /Live now/i, "states what is live");
  assert.match(s, /gated|Building/i, "states what is being built (gated)");
  assert.match(s, /don.?t claim|No locks/i, "states what is NOT claimed");
});

test("3 · the return hook gives an honest reason to return WITHOUT inventing a schedule", () => {
  const s = read("src/components/home/return-hook.tsx");
  assert.match(s, /official box score/i, "anchors the return reason to honest settlement");
  // Must NOT hardcode a specific next-slate clock time (would be an invented schedule).
  assert.doesNotMatch(visible(s), /next slate .*\b\d{1,2}:\d{2}\b/i, "no fabricated next-slate time");
  assert.doesNotMatch(visible(s), /\bat \d{1,2}(:\d{2})?\s?(am|pm)\b/i, "no fabricated clock time");
});

test("4 · no money figure in the global top bar; the home record section leads with the RECORD (no profit-claim framing)", () => {
  /*
   * P208 F3 moved the bankroll chips OFF the global strip entirely — the strongest form of the
   * original rule (no profit-claim framing above every page). The claim-safety intent transfers to
   * the homepage's Recent-results strip, which still leads with the RECORD label and carries no
   * headline dollar at all: figures arrive pre-formatted from the same owner /results renders.
   */
  const bar = read("src/components/slate-status-bar.tsx");
  assert.doesNotMatch(bar, /Paper record|usd\(/, "the global strip carries no bankroll figure");
  const strip = read("src/components/home/recent-results-strip.tsx");
  assert.match(strip, /Paper record/, "the home proof section is labelled a paper RECORD");
  assert.doesNotMatch(strip, /\$\{?\s*\d|toLocaleString\("en-US", \{ minimumFractionDigits: 2/, "no dollar figure composed in the strip");
});
