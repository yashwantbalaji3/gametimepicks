#!/usr/bin/env node
/**
 * v1.7 Phase H — forward shadow of the preregistered selectors, run every product day beside the live
 * generator WITHOUT changing what is published.
 *
 *   npx tsx scripts/products/build-selector-shadow.mjs --date YYYY-MM-DD --now ISO [--write]
 *
 * Network-free. Reads the committed public artifacts through the ProductEligibleLeg builder at `--now`,
 * runs the control policies and the shadow policies (SHADOW_POLICIES), and writes
 *   data/internal/products/selector-shadow/<date>.json   cards + receipts + no-play reasons, all policies
 *   data/internal/products/selector-shadow/state.json    each policy's ladder position (from ITS OWN graded
 *                                                        shadow results, never the live receipts) + history
 * Idempotent per day: a re-run on the same date overwrites that day's cards only if nothing is graded yet.
 * The nightly grader (grade-selector-shadow.mjs) settles cards and advances positions.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildEligibleLegs } from "./build-product-eligible-legs.mjs";
import { guardLegs } from "../../src/lib/products/eligible-leg/contract.mjs";
import { selectProduct } from "../../src/lib/products/selector/select.mjs";
import { POLICIES, policyId } from "../../src/lib/products/selector/policies.mjs";
import { SHADOW_POLICIES } from "../../src/lib/products/selector/shadow.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const DIR = path.join(REPO, "data", "internal", "products", "selector-shadow");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const NOW = arg("--now", new Date().toISOString());
const DATE = arg("--date", NOW.slice(0, 10));
const ALL = [...new Set(Object.values(SHADOW_POLICIES).flatMap((p) => [p.control, ...p.shadow]))];

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const state = readJson(path.join(DIR, "state.json"), { schemaVersion: 1, policies: {} });
for (const name of ALL) state.policies[name] ??= { policyId: policyId(name), positions: { A: { step: 1, stake: POLICIES[name].seed }, B: { step: 1, stake: POLICIES[name].seed } }, lastPlaced: { A: null, B: null }, bestJointPByStep: {} };

// FIRST PUBLICATION WINS. The live generator runs more than once a day; the shadow must be judged at the
// instant it first saw the slate, so a later run never rewrites the day (that would be the S7 defect in
// a new place). `--force` exists for a deliberate rebuild of an ungraded day.
const existing = readJson(path.join(DIR, `${DATE}.json`), null);
if (existing && !process.argv.includes("--force")) { console.log(`[selector-shadow] ${DATE} already published at ${existing.asOf} — first publication wins, nothing rewritten`); process.exit(0); }
if (existing && Object.values(existing.policies).some((p) => Object.values(p.lanes).some((l) => l.graded))) { console.log(`[selector-shadow] ${DATE} already graded — refusing --force`); process.exit(0); }

// INPUTS MISSING IS NOT A NO-PLAY (docs/V17_SHADOW_INTEGRITY_AUDIT.md, I1/I2). Every shadow policy pools
// MLB only, and the MLB universe comes from mlb/team-markets/<date>.json, which the paid ingest writes
// ~10:00Z on the product day. A caller that runs before it exists (the nightly roll did, 01–06 ET) would
// publish a day of INSUFFICIENT_CANDIDATES and, under first-publication-wins, lock the real slate out.
// Refuse to publish instead: a missing slate is never a no-play. Exit 0 — the caller distinguishes this
// from a no-play by the absence of the day file and by this line.
const TEAM_MARKETS = path.join(REPO, "app", "public", "data", "mlb", "team-markets", `${DATE}.json`);
if (!fs.existsSync(TEAM_MARKETS)) { console.log(`[selector-shadow] ${DATE}: INPUTS_MISSING — no mlb/team-markets/${DATE}.json at ${NOW}; not published (a missing slate is never a no-play)`); process.exit(0); }

const { artifact, manifest } = buildEligibleLegs({ date: DATE, now: NOW });
const { kept, refused } = guardLegs(artifact.legs, { asOf: NOW });
// The guarded universe every policy (control and candidates alike) ranked over, fingerprinted so a later
// rewrite of eligible-legs/<date>.json (that file is regenerated on every run) can never change what
// this day was judged on without the change being visible (audit I6).
const universeLegIds = kept.map((l) => l.legId).sort();
const universe = { legIds: universeLegIds, sha256: createHash("sha256").update(JSON.stringify(universeLegIds)).digest("hex") };
const day = { schemaVersion: 1, artifact: "selector-shadow-day", dataClass: "internal-research", date: DATE, asOf: NOW, generatedAt: new Date().toISOString(), eligibleLegs: kept.length, refusedAtRead: refused.length, universe, availability: Object.fromEntries(Object.entries(manifest.sports).map(([s, m]) => [s, { eligible: m.eligibleLegCount, rejected: m.rejectedLegCount }])), policies: {} };

for (const name of ALL) {
  const st = state.policies[name];
  const positions = { A: { ...st.positions.A, state: st.positions.A.pending ? "held" : "ready" }, B: { ...st.positions.B, state: st.positions.B.pending ? "held" : "ready" } };
  const cadence = POLICIES[name].cadenceDays ? { A: { lastPlacedDate: st.lastPlaced.A, date: DATE }, B: { lastPlacedDate: st.lastPlaced.B, date: DATE } } : null;
  const sel = selectProduct({ policyName: name, legs: kept, positions, asOf: NOW, cadence, history: { bestJointPByStep: st.bestJointPByStep } });
  day.policies[name] = { policyId: st.policyId, lanes: {} };
  for (const lane of ["A", "B"]) {
    const r = sel[lane];
    if (r.status !== "CARD") { day.policies[name].lanes[lane] = { status: "NO_QUALIFYING_PLAY", reason: r.reason, detail: r.detail, step: r.rung.step, stake: r.rung.stake, receipt: r.receipt }; continue; }
    day.policies[name].lanes[lane] = { status: "placed", step: r.rung.step, stake: r.card.stake, american: r.card.american, decimal: r.card.decimal, potentialReturn: r.card.potentialReturn, jointP: r.card.jointP, probabilityBasis: r.card.probabilityBasis, sports: r.card.sports, relationships: r.card.relationshipsRecorded, legs: r.card.legs, receipt: r.receipt, graded: null };
    if (WRITE) { st.positions[lane].pending = true; st.lastPlaced[lane] = DATE; }
    // history for the relative floor: best qualifying joint p seen at this rung (the card chosen IS the best)
    if (WRITE) { (st.bestJointPByStep[r.rung.step] ??= []).push(r.card.jointP); st.bestJointPByStep[r.rung.step] = st.bestJointPByStep[r.rung.step].slice(-30); }
  }
}
const line = ALL.map((n) => `${n}: ${["A", "B"].map((l) => { const x = day.policies[n].lanes[l]; return x.status === "placed" ? `${l}=s${x.step}@${x.american > 0 ? "+" : ""}${x.american}` : `${l}=${x.reason}`; }).join(" ")}`).join(" · ");
console.log(`[selector-shadow] ${DATE} @ ${NOW}: eligible ${kept.length} · ${line}`);
if (WRITE) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${DATE}.json`), JSON.stringify(day, null, 1));
  fs.writeFileSync(path.join(DIR, "state.json"), JSON.stringify(state, null, 1));
  console.log(`[selector-shadow] wrote ${path.relative(REPO, path.join(DIR, `${DATE}.json`))} + state.json`);
} else console.log("[selector-shadow] dry run — pass --write to persist");
