#!/usr/bin/env node
/**
 * BUILD THE SPORT CLOSURE PACKETS — Program 196 · Release A.
 *
 *   npx tsx scripts/ops/build-closure-packets.mjs --now 2026-08-24T02:00:00Z [--check]
 *
 * Writes data/internal/launch/closure-packets-v1.json with STABLE BYTES: same inputs, identical
 * file. `--now` is required because the packet's freshness verdicts are claims about a moment,
 * and re-deriving that moment inside the generator is how artifacts stop being reproducible
 * (the artifact-regeneration rule this repo already operates under). `--check` builds twice and
 * compares serialized bytes — the determinism receipt, cheap enough to run every time.
 *
 * INTERNAL ONLY. The artifact lands under data/internal/ and is consumed by /launch (itself
 * excluded from the public export); nothing here is public surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SPORT_ASSESSMENTS } from "../../src/lib/sports/sport-assessments.mjs";
import { buildWorkBoard } from "../../src/lib/launch/work-board.mjs";
import { REALITY_GATED_WATCHES } from "../../src/lib/launch/watches.mjs";
import { founderActionSheet } from "../../src/lib/launch/shared-blockers.mjs";
import { buildClosurePackets, executionQueue, stableStringify } from "../../src/lib/launch/closure-packets.mjs";
import { readCurrentEvents, readProductReceipt, readRouteInventory, readEplCalibrationAuthority } from "../../src/lib/launch/closure-packet-sources.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "..", "data/internal/launch/closure-packets-v1.json");

const nowIdx = process.argv.indexOf("--now");
const NOW = nowIdx !== -1 ? process.argv[nowIdx + 1] : null;
if (!NOW || !Number.isFinite(Date.parse(NOW))) {
  console.error("REFUSED: --now <ISO> required — packet freshness is a claim about a stated moment");
  process.exit(2);
}
const CHECK = process.argv.includes("--check");

function assembleInputs() {
  const board = buildWorkBoard();
  const tickets = [...Object.values(board.columns).flat(), ...board.founderQueue];
  const founderGates = founderActionSheet().map((b) => ({
    ...b,
    sport: b.id.match(/blocker-(mlb|nfl|epl|ufc|nba)/)?.[1] ?? null,
  }));
  return {
    assessments: SPORT_ASSESSMENTS,
    tickets,
    watches: REALITY_GATED_WATCHES,
    founderGates,
    currentEvents: readCurrentEvents({ appDir: APP, nowIso: NOW }),
    productReceipt: readProductReceipt({ appDir: APP }),
    routeInventory: readRouteInventory({ appDir: APP }),
    calibrationAuthorities: { epl: readEplCalibrationAuthority({ appDir: APP }) },
    nowIso: NOW,
  };
}

const first = buildClosurePackets(assembleInputs());
const queue = executionQueue(first);
const artifact = {
  schemaVersion: 1,
  artifact: "sport-closure-packets",
  dataClass: "PRIVATE_OPERATING_RECORD",
  public: false,
  ...first,
  executionQueue: queue,
};
const bytes = stableStringify(artifact) + "\n";

if (CHECK) {
  const second = stableStringify({
    schemaVersion: 1, artifact: "sport-closure-packets", dataClass: "PRIVATE_OPERATING_RECORD", public: false,
    ...buildClosurePackets(assembleInputs()), executionQueue: queue,
  }) + "\n";
  if (bytes !== second) {
    console.error("REFUSED: two builds from the same inputs produced different bytes — determinism is broken");
    process.exit(3);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bytes);

console.log(`closure packets @ ${NOW}`);
for (const sport of Object.keys(first.sports)) {
  const p = first.sports[sport];
  console.log(
    `  ${sport.padEnd(4)} ${String(p.counts.proven).padStart(2)}/${p.counts.applicable}` +
    ` · tier ${p.publicClaims.tier.padEnd(17)} · event ${p.currentEvent.state.padEnd(7)} — ${p.currentEvent.detail}`,
  );
}
console.log(`  queue: ${queue.engineering.length} engineering-ready · ${queue.realityWatch.length} reality watch(es) · ${queue.founderQueue.length} founder`);
for (const q of queue.engineering.slice(0, 10)) console.log(`    ${q.order}. [${q.sport}] ${q.stage} — ${q.action.slice(0, 110)}`);
console.log(`→ wrote ${path.relative(path.join(APP, ".."), OUT)}${CHECK ? " (determinism check passed)" : ""}`);
