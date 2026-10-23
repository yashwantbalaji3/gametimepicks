/**
 * PUBLIC VOCABULARY guard (P209 · Release G — F7 closure).
 *
 * Scans the VISIBLE TEXT of every built public page (tags and scripts stripped, entities decoded):
 *   · retired destination names may never return anywhere;
 *   · internal pipeline vocabulary stays off primary surfaces — the labelled technical pages
 *     (methodology, research, system-status, market-guide) may use their own subject's terms.
 * Text-only by design: a route string inside an href is wiring, not copy, and denial phrases in
 * comments never render. No-ops when out/ is absent (CI unit lane).
 *
 * Run: npx tsx --test src/lib/uiux/public-vocabulary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(APP, "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

const RETIRED_EVERYWHERE = ["Picks Lab", "Build-a-Pick", "Parlay Lab"];
/*
 * Founder directive 2026-10-23 public readiness: the hedging phrases retired in favour of the five public terms
 * (lib/public-registry.ts RETIRED_PUBLIC_PHRASES — Official Forecast · Game Simulation · What-if Scenario · Model
 * Performance · Unavailable). Case-insensitive. /results and the Forecast Record belong to their own owners, who adopt
 * the registry's terms in their own PRs — they are excluded here until then, by name.
 */
const { RETIRED_PUBLIC_PHRASES } = await import("../public-registry.ts");
const RETIRED_PHRASES_OWNED_ELSEWHERE = new Set(["results", "forecast-record"]);
/* /nba/projections/** is covered too (release owner 2026-10-23: Workstream F's PR #1199 removed the phrases there). */
const RETIRED_PATHS_OWNED_ELSEWHERE = [];
const INTERNAL_OFF_PRIMARY = ["optimizer", "settlement contract", "shadow lane", "research corpus", "leakage-safe"];
const TECHNICAL_PAGES = new Set(["methodology", "research", "system-status", "market-guide", "bucket-blitz", "goal-rush"]);

function* publicPages() {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (["_next", "data"].includes(e.name)) continue;
        walk(path.join(dir, e.name));
      } else if (e.name === "index.html") {
        pages.push(path.join(dir, e.name));
      }
    }
  };
  const pages = [];
  walk(OUT);
  yield* pages;
}

const decode = (s) =>
  s.replace(/&rsquo;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—");

function visibleText(file) {
  let h = fs.readFileSync(file, "utf8");
  h = h.replace(/<script[\s\S]*?<\/script>/g, " ");
  return decode(h.replace(/<[^>]+>/g, " "));
}

/*
 * P225: EVIDENCE-STRENGTH CLAIMS.
 *
 * The repo already bans the outcome words — "edge", "lock", "guaranteed", "best bet", "profitable",
 * "beat the market". Nothing banned a claim about how STRONG the evidence is, which is the same
 * overstatement wearing an academic coat. Found by injecting one into /ufc while proving the CI
 * re-sequencing: the page turned "the sample is far too small to support any claim" into "the
 * evidence is compelling and consistent", and not one guard in the suite noticed.
 *
 * Deliberately narrow. It fires only when a strength word actually modifies the evidence — "a
 * compelling matchup" is a description of a fight and stays legal. Zero matches across the built
 * export when written, so it starts at a true zero rather than a grandfathered exception list.
 */
const EVIDENCE_OVERCLAIM = new RegExp(
  [
    String.raw`\b(compelling|conclusive|overwhelming|irrefutable|definitive|undeniable)\b[^.]{0,40}\b(evidence|data|record|sample|results?|track record)\b`,
    String.raw`\b(evidence|data|record|sample|results?|track record)\b[^.]{0,40}\b(compelling|conclusive|overwhelming|irrefutable|definitive|undeniable)\b`,
    String.raw`\bproven\s+(winner|system|edge|record|profit)`,
    String.raw`\bconsistently\s+(beats?|outperforms?|wins?|profitable)`,
  ].join("|"),
  "i",
);
test("no public page claims its evidence is stronger than a sample size can support", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const m = EVIDENCE_OVERCLAIM.exec(visibleText(p).replace(/\s+/g, " "));
    if (m) offenders.push(`${p.replace(OUT, "")}: "${m[0].trim()}"`);
  }
  assert.deepEqual(offenders, [], `evidence-strength overclaims:\n  ${offenders.join("\n  ")}`);
});

test("retired destination names never render on any public page", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const text = visibleText(p);
    for (const term of RETIRED_EVERYWHERE) {
      if (text.includes(term)) offenders.push(`${p.replace(OUT, "")}: "${term}"`);
    }
  }
  assert.deepEqual(offenders, [], `retired names rendering:\n  ${offenders.join("\n  ")}`);
});

test("internal pipeline vocabulary stays off primary public surfaces", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const top = p.replace(OUT, "").split("/").filter(Boolean)[0] ?? "";
    if (TECHNICAL_PAGES.has(top)) continue; // labelled technical depth may speak its own subject
    const text = visibleText(p).toLowerCase();
    for (const term of INTERNAL_OFF_PRIMARY) {
      if (text.includes(term)) offenders.push(`${p.replace(OUT, "")}: "${term}"`);
    }
  }
  assert.deepEqual(offenders, [], `internal vocabulary on primary surfaces:\n  ${offenders.join("\n  ")}`);
});

test("founder directive 2026-10-23: the retired hedging phrases never render on a public page (registry vocabulary instead)", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const top = p.replace(OUT, "").split("/").filter(Boolean)[0] ?? "";
    if (RETIRED_PHRASES_OWNED_ELSEWHERE.has(top) || RETIRED_PATHS_OWNED_ELSEWHERE.some((x) => p.replace(OUT, "").startsWith(x))) continue;
    const text = visibleText(p).replace(/\s+/g, " ").toLowerCase();
    for (const term of RETIRED_PUBLIC_PHRASES) if (text.includes(term.toLowerCase())) offenders.push(`${p.replace(OUT, "")}: "${term}"`);
  }
  assert.deepEqual(offenders, [], `retired hedging phrases rendering:\n  ${offenders.join("\n  ")}`);
});
