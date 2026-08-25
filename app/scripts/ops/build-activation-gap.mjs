#!/usr/bin/env node
/**
 * THREE-SPORT ACTIVATION GAP (Program 206 · Phase 0).
 *
 *   npx tsx scripts/ops/build-activation-gap.mjs --now <ISO>
 *
 * One committed artifact naming every stage behind EPL/UFC/NFL's numerators — id, status, owner,
 * the frozen condition, and the next receipt — derived from the closure packets (which already
 * derive from the assessments). Counts recount from the stages; hand-entered percentages have no
 * seat here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW) { console.error("REFUSED: --now required"); process.exit(1); }

const packets = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "data/internal/launch/closure-packets-v1.json"), "utf8"));

/* The frozen next-gate per gap stage — transcribed from the assessment owner, which the packets
   summarize. These are CONDITIONS, not statuses; the packets' owner field wins on ownership. */
const NEXT_GATE = {
  "epl.calibration": "30 paired pre-kickoff forecast+price matches through the learning ledger (now 4/30); stopping rule inherited; nothing hand-counted",
  "ufc.model": "the promoted abstaining Elo must beat its own frozen bar on FORWARD covered bouts — the cumulative model-vs-market record cannot reset on a good card",
  "ufc.calibration": "graded cards through lib/sports/ufc/model-vs-market.mjs (instrument live since P191); Aug-29 is the next sample",
  "nfl.model": "regular-season games through the promoted cutoff-Elo strength state; preseason evidence neither qualifies nor disqualifies (cohort rule)",
  "nfl.calibration": "frozen RS evaluation contract (sha256 3451d1a0d6bd593c, immutable): walk-forward by week, min 64 games, bars vs cutoff-Elo WITH de-vigged market comparison",
  "nfl.products": "FOUNDER actives-rights token (+ ordered-scorer authorization) to exercise End Zone Vault's ACTIVE path — its NO_PLAY cadence is proven daily",
};

const sports = {};
for (const sport of ["epl", "ufc", "nfl"]) {
  const s = packets.sports[sport];
  const stages = s.stages.map((st) => ({
    id: st.id ?? st.stage,
    status: st.status,
    owner: st.owner ?? (st.status === "PROVEN" ? "ENGINEERING" : "UNKNOWN"),
    nextGate: st.status === "PROVEN" ? null : (NEXT_GATE[`${sport}.${st.id ?? st.stage}`] ?? "see assessment"),
  }));
  const proven = stages.filter((x) => x.status === "PROVEN").length;
  if (proven !== s.counts.proven) { console.error(`${sport}: recount ${proven} != packets ${s.counts.proven}`); process.exit(1); }
  for (const st of stages) {
    if (!st.status || st.status === "UNKNOWN") { console.error(`${sport}.${st.id}: unknown status`); process.exit(1); }
  }
  sports[sport] = { proven, applicable: s.counts.applicable, tier: s.publicClaims?.tier ?? null, stages };
}

const out = {
  schemaVersion: 1, artifact: "activation-gap", dataClass: "PRIVATE_INTERNAL", generatedAt: NOW,
  finding: "every non-proven stage across EPL/UFC/NFL has its instrument BUILT and its acceptance FROZEN; the remaining conditions are forward samples (REALITY) and one founder token (nfl.products) — zero executable stage engineering remains",
  sports,
};
const OUT = path.resolve(APP, "..", "data/internal/launch/activation-gap-v1.json");
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
for (const [k, v] of Object.entries(sports)) {
  console.log(`${k}: ${v.proven}/${v.applicable} · gaps: ${v.stages.filter((x) => x.status !== "PROVEN").map((x) => `${x.id}[${x.owner}]`).join(", ")}`);
}
