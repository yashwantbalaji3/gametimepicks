#!/usr/bin/env node
/**
 * FRESHNESS CONTRACT AUDIT (§15) — which "when" is each surface actually showing?
 *
 * §15's complaint is that one word, "Updated", stands in for eleven different clocks, so a reader
 * cannot tell a stale prediction from a fresh page. This walks the real pages and reports, per
 * occurrence, WHICH canonical clock the displayed value resolves to.
 *
 * ⚠ READ-ONLY, AND DELIBERATELY SO TONIGHT. Sunday's NFL PRE baseline is frozen; re-labelling a
 *   published surface is a change to what a reader sees and waits for the acceptance event. This
 *   command produces the list that work will be driven from.
 *
 * Usage:
 *   node app/scripts/ops/freshness-contract-audit.mjs
 *   node app/scripts/ops/freshness-contract-audit.mjs --json
 *
 * EXIT CODES — an audit describes.
 *   0  it ran
 *   2  it could not run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLOCK } from "../../src/lib/freshness/clocks.mjs";
import { classifyLabelLine } from "../../src/lib/freshness/label-classifier.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const has = (n) => process.argv.includes(n);

const walk = (dir, out = []) => {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
  } catch { /* skip */ }
  return out;
};

const roots = [path.join(APP, "src/app"), path.join(APP, "src/components")];
if (!roots.some((r) => fs.existsSync(r))) { console.error("REFUSED: no src/app or src/components"); process.exit(2); }
const files = roots.flatMap((r) => walk(r));

const findings = [];
const notClocks = [];
for (const file of files) {
  const rel = path.relative(APP, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const c = classifyLabelLine(line, lines);
    const at = { file: rel, line: i + 1, word: c.word, excerpt: line.trim().slice(0, 120) };
    if (c.kind !== "CLOCK") { if (c.word) notClocks.push(at); return; }
    findings.push({ ...at, clock: c.clock, domain: c.domain, unresolved: c.unresolved, collapsedSource: c.collapsedSource, buildClockAsHeadline: c.buildClockAsHeadline, via: c.via });
  });
}

const byClock = {};
for (const f of findings) byClock[f.clock ?? "UNRESOLVED"] = (byClock[f.clock ?? "UNRESOLVED"] ?? 0) + 1;
const collapsed = findings.filter((f) => f.word === "Updated");
const fold = {
  labels: findings.length,
  distinctClocks: Object.keys(byClock).filter((k) => k !== "UNRESOLVED").length,
  byClock,
  collapsedToUpdated: collapsed.length,
  buildClockAsHeadline: findings.filter((f) => f.buildClockAsHeadline).length,
  unresolved: findings.filter((f) => f.unresolved).length,
  /* Reported so the exclusion is auditable rather than invisible. */
  notClockLabels: notClocks.length,
  collapsedSource: findings.filter((f) => f.collapsedSource).length,
};

if (has("--json")) {
  /* Synchronous — see nfl-opportunity-conservation.mjs on why console.log loses a piped tail. */
  fs.writeSync(1, JSON.stringify({ artifact: "freshness-contract-audit", readOnly: true, fold, findings, notClockLabels: notClocks }, null, 1) + "\n");
  process.exit(0);
}

console.log(`FRESHNESS CONTRACT AUDIT (§15) · ${files.length} page/component files\n`);
console.log('READ-ONLY. No surface is re-labelled here — that changes what a reader sees and waits');
console.log("for Sunday's acceptance event.\n");

for (const f of findings) {
  const tag = f.collapsedSource ? "!! NAMED \"UPDATED\"" : f.unresolved ? "?? UNRESOLVED" : f.buildClockAsHeadline ? "!! BUILD CLOCK" : `   ${f.clock}`;
  console.log(`${tag.padEnd(26)} ${f.file}:${f.line}  "${f.word}"${f.via ? `   via ${f.via}` : ""}`);
  if (f.unresolved || f.buildClockAsHeadline) console.log(`                           ${f.excerpt}`);
}

console.log(`\nFOLD · ${fold.labels} "when" label(s) across ${fold.distinctClocks} distinct canonical clock(s)`);
for (const [c, n] of Object.entries(byClock).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} × ${c}${c === "UNRESOLVED" ? "  ← the value's clock could not be identified from the line" : ""}`);
}
console.log(`\n  ${fold.collapsedToUpdated} label(s) say the single word "Updated" — §15's complaint, and they do NOT all mean the same clock.`);
console.log(`  ${fold.buildClockAsHeadline} label(s) present the BUILD clock as a surface's "when" — §15 rule 2.`);
console.log(`  ${fold.collapsedSource} label(s) render a real time whose SOURCE is itself named "updated" — the codebase never decided which clock it is.`);
console.log(`  ${fold.notClockLabels} line(s) matched a label WORD but render no time (a count, a heading, prose) and are excluded:`);
for (const n of notClocks) console.log(`        ${n.file}:${n.line}  "${n.word}"  ${n.excerpt.slice(0, 80)}`);
process.exit(0);
