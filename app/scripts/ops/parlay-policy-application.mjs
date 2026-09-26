#!/usr/bin/env node
/**
 * DOES THE LEARNING POLICY DO WHAT IT SAYS IT DID? — one command, one question.
 *
 * Usage:
 *   node app/scripts/ops/parlay-policy-application.mjs               # today's optimizer artifact
 *   node app/scripts/ops/parlay-policy-application.mjs --date 2026-09-26
 *   node app/scripts/ops/parlay-policy-application.mjs --all         # every committed artifact
 *   node app/scripts/ops/parlay-policy-application.mjs --json
 *
 * ⚠ READ-ONLY. No provider call, no write, no refetch — the lifecycle-trace rule.
 *
 * EXIT CODES
 *   0  every claim the artifact makes about its own scoring is honoured (or it makes none)
 *   1  at least one claim is not honoured by the same artifact's numbers
 *   2  the audit could not run
 *
 * The rule lives in app/src/lib/parlays/policy-application.mjs and is tested there against
 * synthetic artifacts, so it is exercised without waiting for a slate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditPolicyApplication } from "../../src/lib/parlays/policy-application.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const DIR = path.join(ROOT, "app/public/data/parlays/optimizer");

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const JSON_OUT = process.argv.includes("--json");
const ALL = process.argv.includes("--all");
const DATE = arg("--date");

if (!fs.existsSync(DIR)) { console.error(`REFUSED: no optimizer directory at ${DIR}`); process.exit(2); }
const files = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const chosen = ALL ? files : DATE ? files.filter((f) => f.startsWith(DATE)) : files.slice(-1);
if (!chosen.length) { console.error(`REFUSED: no optimizer artifact for ${DATE ?? "the requested scope"}`); process.exit(2); }

const out = [];
for (const f of chosen) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); }
  catch (e) { out.push({ date: f.slice(0, 10), error: e.message }); continue; }
  const warnings = doc?.learningPolicy?.policyWarnings ?? [];
  const legs = doc?.legPool?.legs ?? [];
  out.push({
    date: f.slice(0, 10),
    applied: doc?.learningPolicy?.learningPolicyApplied ?? null,
    legs: legs.length,
    ...auditPolicyApplication({ policyWarnings: warnings, legs }),
  });
}

const brokenTotal = out.reduce((s, o) => s + (o.broken ?? 0), 0);
if (JSON_OUT) { console.log(JSON.stringify({ artifact: "parlay-policy-application", asOf: new Date().toISOString(), days: out }, null, 1)); process.exit(brokenTotal ? 1 : 0); }

const MARK = { HONOURED: "✓", CLAIMED_EXCLUDED_BUT_CONTRIBUTES: "!", CLAIMED_NEUTRAL_BUT_PROMOTES: "!", NO_COMPONENT: "·", UNPARSED: "?" };
console.log("PARLAY LEARNING-POLICY APPLICATION · as of", new Date().toISOString());
console.log("(✓ the artifact's claim matches its own numbers  ! it does not  · nothing to measure  ? no known signal named)\n");
for (const o of out) {
  if (o.error) { console.log(`${o.date}  UNREADABLE — ${o.error}\n`); continue; }
  console.log(`${o.date}  learningPolicyApplied=${o.applied}  ${o.legs} leg(s)  → ${o.state}`);
  if (!o.rows.length) console.log("   · the artifact claims nothing about its scoring — nothing to hold it to");
  for (const r of o.rows) console.log(`   ${MARK[r.verdict]} ${String(r.signal ?? "—").padEnd(10)} claims ${String(r.claim ?? "—").padEnd(14)} ${r.verdict}\n       ${r.detail}\n       warning: "${r.text}"`);
  console.log("");
}
console.log(`TOTAL: ${brokenTotal} unhonoured claim(s) across ${out.length} artifact(s)`);
process.exit(brokenTotal ? 1 : 0);
