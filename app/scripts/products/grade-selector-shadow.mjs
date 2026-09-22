#!/usr/bin/env node
/**
 * v1.7 Phase H — grade the forward-shadow cards from the committed official linescore cache and roll the
 * shadow ladders forward. Runs in nightly-settle after the MLB linescores are fetched.
 *
 *   npx tsx scripts/products/grade-selector-shadow.mjs [--write]
 *
 * Reads every data/internal/products/selector-shadow/<date>.json with an ungraded placed lane, grades it
 * from data/internal/mlb/linescores/<date>.json (pending stays pending — a missing final is never a loss),
 * advances that policy's position by the ladder rule, and rebuilds ledger.json: per-policy metrics and the
 * preregistered adoption gate against the control. Nothing here touches the live products or the money.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeCardFromLinescores, advancePosition, policyMetrics, adoptionGate, settledDecimal, SHADOW_POLICIES } from "../../src/lib/products/selector/shadow.mjs";
import { policyId } from "../../src/lib/products/selector/policies.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const DIR = path.join(REPO, "data", "internal", "products", "selector-shadow");
const WRITE = process.argv.includes("--write");
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const linescores = (date) => { const d = readJson(path.join(REPO, "data", "internal", "mlb", "linescores", `${date}.json`), null); return d ? (Array.isArray(d) ? d : (d.linescores ?? d.games ?? Object.values(d))) : null; };

const state = readJson(path.join(DIR, "state.json"), { schemaVersion: 1, policies: {} });
const days = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
let graded = 0, pending = 0;
const rowsByPolicy = {};
for (const f of days) {
  const day = readJson(path.join(DIR, f), null); if (!day) continue;
  const rows = linescores(day.date);
  let changed = false;
  for (const [name, p] of Object.entries(day.policies)) {
    for (const lane of ["A", "B"]) {
      const x = p.lanes[lane];
      if (x.status === "placed" && !x.graded) {
        const g = rows ? gradeCardFromLinescores({ legs: x.legs }, rows) : { status: "pending", legs: x.legs.map(() => "pending") };
        if (g.status === "pending") { pending++; }
        else {
          // A pushed leg pays 1.0: the ladder rolls on the SETTLED decimal, never the published one (audit I5).
          const settled = settledDecimal(x.legs, g.legs) ?? x.decimal;
          x.graded = { ...g, gradedAt: new Date().toISOString(), source: "statsapi_linescore", settledDecimal: settled, payout: g.status === "won" ? +(x.stake * settled).toFixed(2) : g.status === "push" ? x.stake : 0 };
          const st = state.policies[name]; if (st) { const next = advancePosition(name, st.positions[lane], g.status, { stake: x.stake, decimal: settled }); x.completed = next.completed; st.positions[lane] = { step: next.step, stake: next.stake, pending: false }; }
          graded++; changed = true;
        }
      }
      (rowsByPolicy[name] ??= []).push({ date: day.date, lane, status: x.status === "placed" ? (x.graded?.status ?? "pending") : "NO_QUALIFYING_PLAY", reason: x.reason ?? null, step: x.step, jointP: x.jointP ?? null, american: x.american ?? null, completed: !!x.completed });
    }
  }
  if (changed && WRITE) fs.writeFileSync(path.join(DIR, f), JSON.stringify(day, null, 1));
}
const ledger = { schemaVersion: 1, artifact: "selector-shadow-ledger", dataClass: "internal-research", generatedAt: new Date().toISOString(), days: days.length, firstDate: days[0]?.slice(0, 10) ?? null, lastDate: days.at(-1)?.slice(0, 10) ?? null, policies: {}, gates: {} };
for (const [name, rows] of Object.entries(rowsByPolicy)) ledger.policies[name] = { policyId: policyId(name), metrics: policyMetrics(rows) };
for (const [product, cfg] of Object.entries(SHADOW_POLICIES)) for (const s of cfg.shadow) if (ledger.policies[s] && ledger.policies[cfg.control]) ledger.gates[s] = { product, control: cfg.control, ...adoptionGate({ shadow: ledger.policies[s].metrics, control: ledger.policies[cfg.control].metrics }) };
console.log(`[selector-shadow] graded ${graded} lane-day(s), ${pending} still pending, ${days.length} day file(s)`);
for (const [n, p] of Object.entries(ledger.policies)) { const m = p.metrics; console.log(`  ${n.padEnd(10)} placed ${m.placed} decided ${m.decided} W-L-P ${m.won}-${m.lost}-${m.push} survival ${m.survivalPerStep ?? "—"} noPlay ${m.noPlayLaneDays}`); }
for (const [n, g] of Object.entries(ledger.gates)) console.log(`  gate ${n}: ${g.state}${g.reasons.length ? " — " + g.reasons.join("; ") : ""}`);
if (WRITE) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, "state.json"), JSON.stringify(state, null, 1)); fs.writeFileSync(path.join(DIR, "ledger.json"), JSON.stringify(ledger, null, 1)); console.log("[selector-shadow] wrote state.json + ledger.json"); }
