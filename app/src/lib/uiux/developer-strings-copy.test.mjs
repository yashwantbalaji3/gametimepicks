/**
 * DEVELOPER STRINGS COPY (Stage 2C truth-copy batch, prep rows #13, #28-#32, #34-#39).
 *
 * Public pages printed developer strings: a shell command ("npx tsx scripts/…"), data file names
 * ("model_audit.json", "settled_leans.jsonl", "moonshot-lane/active.json", "mr-dub/portfolio.json"),
 * registry enums ("SCAFFOLD_ONLY", "SHADOW", "PUBLIC_EXPERIMENTAL") and internal store names. This batch
 * rewrote them in the reader's words. This guard keeps them out of the RENDERED strings of the files
 * the batch touched.
 *
 * What counts as rendered: comments are stripped first, exactly as the D6 ratchet in
 * claims-contract.test.mjs does (a comment explaining removed wording is not the wording). Then two
 * kinds of string that never reach a reader are removed before scanning:
 *   - import / export-from specifiers;
 *   - PATH-ONLY string literals: a quoted literal with no whitespace and no interpolation whose whole
 *     content is a path ending in .json/.jsonl (e.g. read("nfl/model-status.json"), an href to a
 *     published download). These are file reads and link targets, not prose. A literal with a space
 *     in it is prose and is scanned.
 * A ".json" preceded by a backslash is a regex literal (a filename filter), not text, and is skipped.
 *
 * KNOWN_NON_RENDERED is an exact-count ratchet for the remaining hits that are data, not copy. Each
 * count must match exactly, so removing one forces the number down and it can never grow.
 *
 * Run: npx tsx --test src/lib/uiux/developer-strings-copy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveMoonshotState } from "../products/moonshot-state.mjs";
import { sportLadderCapabilityRefusal } from "../parlays/sport-lab-cards.ts";

const app = process.cwd();
const BANNED = /npx tsx|(?<!\\)\.jsonl?\b|SCAFFOLD_ONLY|\bSHADOW\b|\(P\d{3}/g;

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripNonRendered = (src) =>
  src
    .replace(/^\s*(import|export)\b[^;\n]*\bfrom\s+["'][^"']*["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']*["'];?\s*$/gm, "")
    .replace(/(["'`])[^\s"'`$]*\.jsonl?\1/g, '""');
const rendered = (rel) => stripNonRendered(stripComments(fs.readFileSync(path.join(app, rel), "utf8")));

/** Every file this batch changed copy in. */
const SCANNED_FILES = [
  "src/lib/parlays/sport-lab-cards.ts",
  "src/app/bank-builder/page.tsx",
  "src/lib/products/moonshot-state.mjs",
  "src/app/moonshot/page.tsx",
  "src/app/mr-dub/page.tsx",
  "src/components/results/candidate-readout.tsx",
  "src/app/results/model-audit/page.tsx",
  "src/app/about/page.tsx",
  "src/app/nfl/page.tsx",
  "src/components/nfl/simulation-v2-report.tsx",
];

/** rel path -> exact number of banned hits that are data, not copy. */
const KNOWN_NON_RENDERED = {
  // portfolioRecord.source = "mr-dub/portfolio.json .moonshot": a provenance key pinned by
  // read-model / moonshot-state tests (prep row #31 keeps it). Since row #32 no page renders `.source`;
  // the derived contradiction strings name "the current receipts record" instead (checked below).
  "src/lib/products/moonshot-state.mjs": 1,
};

test("no shell command, data file name, registry enum or program tag in the rendered strings of the touched files", () => {
  const offenders = [];
  const known = {};
  for (const rel of SCANNED_FILES) {
    const hits = [...rendered(rel).matchAll(BANNED)];
    if (hits.length === 0) continue;
    if (rel in KNOWN_NON_RENDERED) { known[rel] = hits.length; continue; }
    offenders.push(`${rel}: ${hits.map((m) => JSON.stringify(m.input.slice(Math.max(0, m.index - 30), m.index + 30))).join(", ")}`);
  }
  assert.deepEqual(offenders, [], `developer strings back in rendered copy:\n  ${offenders.join("\n  ")}`);
  for (const [rel, n] of Object.entries(KNOWN_NON_RENDERED)) {
    assert.equal(known[rel] ?? 0, n,
      `${rel}: KNOWN_NON_RENDERED says ${n} hit(s), found ${known[rel] ?? 0}. If you removed one, lower the count; it may never grow.`);
  }
});

test("probe: the scan catches each banned shape in JSX text and in prose literals", () => {
  for (const s of [
    "<p>Reproduce: npx tsx scripts/x.mjs</p>",
    "<p>Sourced from <code>model_audit.json</code>,</p>",
    "<code>settled_leans.jsonl</code>",
    "`moonshot-lane/active.json declares status`",
    "`as ${cap.state}`; 'UFC is SCAFFOLD_ONLY'",
    "<td>SHADOW · experimental</td>",
    "<p>(P250 · A01) note</p>",
  ]) assert.ok(stripNonRendered(stripComments(s)).match(BANNED), `probe missed: ${s}`);
  // …and leaves data reads, download links and filename regexes alone.
  for (const s of ['read("nfl/model-status.json")', '<a href="/data/mlb/x.json">the register</a>', "/^\\d{4}\\.json$/.test(f)", 'import x from "./a.json";'])
    assert.equal(stripNonRendered(stripComments(s)).match(BANNED), null, `false positive: ${s}`);
});

test("the replacement words are what renders (rows #28-#32, #34-#39)", () => {
  const bb = rendered("src/app/bank-builder/page.tsx");
  assert.match(bb, /from the official\s+daily receipts\. A retired record \(last written/);
  assert.match(bb, /it is history and does not move this board\./);
  assert.match(bb, /The ladder step and the retired record agree today\./);
  assert.doesNotMatch(bb, /An older store|lifecycle store|step-counter divergence/);
  // #32: the legacy note names the ledger, never the record's file path.
  assert.match(rendered("src/app/moonshot/page.tsx"), /settled in the June 2026 ledger\./);
  assert.match(rendered("src/app/mr-dub/page.tsx"), /June multi-leg cards from the June 2026 ledger\./);
  for (const rel of ["src/app/moonshot/page.tsx", "src/app/mr-dub/page.tsx"])
    assert.doesNotMatch(rendered(rel), /Record\.source\}/, `${rel} renders a record's file path`);
  assert.match(rendered("src/components/results/candidate-readout.tsx"), /Reproducible from the project&rsquo;s published audit scripts\./);
  const audit = rendered("src/app/results/model-audit/page.tsx");
  assert.match(audit, /Sourced from the model audit, rebuilt after every settlement\./);
  assert.match(audit, /this page from the settled-leans record/);
  const about = rendered("src/app/about/page.tsx");
  // TR-COPY-1 retired the archived curated-rail and confidence-overlay bullets that carried rows #35-#36;
  // the page now labels those methods retired (their May 22 figures stay for the record), and the developer
  // names stay out.
  assert.match(about, /the edge-ranked curated rail it describes are retired methods,\s+kept here for the record only/);
  assert.match(about, /Retired method · MLB confidence tiers on the May 22/);
  assert.match(about, /High was 49\.7% on 396 settled rows,\s+Medium 50\.4% on 141, Low 53\.3% on 435/);
  assert.doesNotMatch(about, /pipeline\.(snapshot|grade)_curated/);
  // #38: words in the Status cell; the colour check still reads the raw state.
  const nfl = rendered("src/app/nfl/page.tsx");
  assert.match(nfl, />\{coverageStateLabel\(c\.state\)\}<\/td>/);
  assert.match(nfl, /color: c\.state === "LIVE" \|\| c\.state === "DEPLOYED"/);
  assert.doesNotMatch(nfl, />\{c\.state\}</, "the coverage table prints the raw enum");
  // #39: no enum, no market enum, no receipt file path.
  const sim = rendered("src/components/nfl/simulation-v2-report.tsx");
  assert.match(sim, /Research only · experimental · not promoted · not our main forecast/);
  assert.match(sim, /"Not used as an input"/);
  assert.doesNotMatch(sim, /\{r\.promotionState\}|file\.split/);
});

test("the derived strings carry no file names or enums (rows #13, #30, #31)", () => {
  for (const sport of ["mlb", "ufc", "epl", "nfl", "soccer"]) {
    const reason = sportLadderCapabilityRefusal(sport);
    if (!reason) continue;
    assert.match(reason, /is not cleared to show forward-looking model cards right now: /);
    assert.doesNotMatch(reason, /capability registry|SCAFFOLD_ONLY|EXPERIMENTAL_PUBLIC/, `${sport}: refusal names a registry enum`);
  }
  const lane = { status: "active", generatedAt: "2026-08-17T14:00:00Z", lanes: [{ laneId: "A", status: "active", ladder: [{ step: 1, status: "active", card: { cardId: "m-a", stake: 25, result: null, legs: [{ participant: "X", result: null, official: null }] } }] }] };
  const productLedger = { productId: "moonshot", results: [{ productId: "moonshot", date: "2026-06-23", outcome: "lost", stake: 25, payout: 0 }] };
  for (const portfolioMoonshot of [
    { status: "stopped", exposure: 0, record: { wins: 0, losses: 1, voids: 0, pending: 0 } },
    { status: "stopped", inBankrollSince: "2026-08-15", record: { wins: 4, losses: 33, voids: 0, pending: 0 } },
  ]) {
    const s = deriveMoonshotState({ today: "2026-09-01", hasScheduledGenerator: false, hasWiredSettler: false, lane, productLedger, portfolioMoonshot });
    assert.ok(s.contradictions.length >= 3, "the fixture exercises the stale-lane, two-record, pending and stopped strings");
    for (const c of [...s.contradictions, s.publicNote ?? ""]) assert.equal(c.match(BANNED), null, `rendered Moonshot string: ${c}`);
    assert.match(s.contradictions.join(" | "), /The old lane record still says "active"/);
    assert.match(s.contradictions.join(" | "), /the June 2026 ledger/);
  }
});
