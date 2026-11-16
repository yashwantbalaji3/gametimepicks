#!/usr/bin/env node
/**
 * Read-only audit: run the NFL leg screen (lib/sports/nfl/leg-screen.mjs) over every upcoming player board, both
 * sides of every projected family, and print how many legs pass and why the rest are refused. Writes nothing.
 *   node app/scripts/nfl/audit-leg-screen.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { familiesFrom, legCandidates } from "../../src/lib/sports/nfl/leg-candidates.mjs";
import { readEvidenceFor } from "../../src/lib/sports/nfl/player-evidence-file.mjs";
import { AMOUNTS, GOAL_CAP, buildScenario, screenLegs } from "../../src/lib/sports/nfl/leg-screen.mjs";
import { isEligibleProvider } from "../../src/lib/sports/odds/eligible-operators.mjs";
import { sanitizePlayerBoard } from "../../src/lib/sports/odds/public-offer-sanitizer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const families = familiesFrom(JSON.parse(fs.readFileSync(path.join(ROOT, "app/public/data/nfl/family-eligibility.json"), "utf8")));
const dir = path.join(ROOT, "app/public/data/nfl/player-board");
const boards = [], evidenceByEvent = {};
for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
  const b = sanitizePlayerBoard(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const ev = readEvidenceFor(ROOT, b.providerEventId);
  if (!Object.keys(ev).length) continue;
  boards.push(b); evidenceByEvent[String(b.providerEventId)] = ev;
}
const cands = legCandidates({ boards, evidenceByEvent, now: new Date().toISOString() }); // read-only audit: the live clock
const r = screenLegs(cands, { families, isEligibleBook: isEligibleProvider });
const scen = {};
for (const [product, amounts] of Object.entries(AMOUNTS)) for (const stake of amounts) { const s = buildScenario(r.passed, { stake, goal: GOAL_CAP[product] }); scen[`${product}:${stake}`] = s.state === "BUILT" ? `BUILT ${s.legs.length} legs ×${s.multiple}` : `${s.state} (${s.reason})`; }
console.log(JSON.stringify({ candidates: cands.length, passed: r.passed.length, byTier: { "5/5": r.passed.filter((l) => l.tier === "5/5").length, "4/5": r.passed.filter((l) => l.tier === "4/5").length }, refusedBy: r.reasons, scenarios: scen }, null, 2));
