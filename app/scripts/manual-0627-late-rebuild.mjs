/**
 * ONE-OFF (operator executive override, June 27 late slate): restart Lane A to a fresh $100 Step-1 cycle
 * and write the approved-card lock for BOTH Bank Builder lanes using ONLY the two not-yet-started 10 PM ET
 * games (Algeria/Austria, Jordan/Argentina). Cards use proven-settleable markets only (moneyline_90,
 * match_total_goals, btts) so tonight's official settlement grades them. NEVER touches canonical
 * bankroll/crown/record — only the active-ladder lane state + the lock. activate-daily-portfolio then
 * builds + prices + force-activates from the lock.
 *   cd app && npx tsx scripts/manual-0627-late-rebuild.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const apply = process.argv.includes("--apply");
const nowIso = new Date().toISOString();
const rd = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));

// Pull real odds/kickoff/provider for a (matchId, market, pick) from the fresh projections.
const proj = rd("world-cup/projections/2026-06-27.json");
const find = (matchId, market, pickTest) => {
  const m = proj.matches.find((x) => x.matchId === matchId && x.market === market && pickTest(x));
  if (!m) throw new Error(`projection not found: ${matchId} ${market}`);
  return m;
};
const kickoffEt = (utc) => new Date(utc).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
const leg = (id, matchup, marketLabel, selection, p) => ({
  id, matchup, market: marketLabel, selection, player: null,
  odds: p.americanOdds, provider: p.bookmaker ?? "consensus",
  modelConfidence: p.modelProbability ?? null, kickoffEt: kickoffEt(p.kickoffUtc),
  risk: "Lower-volatility", photoUrl: null, teamLogo: null,
});

// matchId 72 = Jordan vs Argentina, 71 = Algeria vs Austria (from the projections).
const argML = find(72, "moneyline_90", (x) => true);
const bttsAA = find(71, "btts", (x) => true);
const ausML = find(71, "moneyline_90", (x) => true);
const bttsJA = find(72, "btts", (x) => true);
// per-outcome odds:
const oArg = argML.outcomes.find((o) => /argentina/i.test(o.label)).americanOdds;            // -700
const oBttsNoAA = bttsAA.outcomes.find((o) => /no/i.test(o.label)).americanOdds;             // -148 (Algeria/Austria)
const oAus = ausML.outcomes.find((o) => /austria/i.test(o.label)).americanOdds;              // +188
const oBttsNo = bttsJA.outcomes.find((o) => /no/i.test(o.label)).americanOdds;               // -182 (Jordan/Argentina)

const laneAlegs = [
  leg("team:72:moneyline_90:away", "Jordan vs Argentina", "Match Result", "Argentina", { ...argML, americanOdds: oArg }),
  leg("team:71:btts:no", "Algeria vs Austria", "Both Teams To Score", "Both teams to score: No", { ...bttsAA, americanOdds: oBttsNoAA }),
];
const laneBlegs = [
  leg("team:71:moneyline_90:away", "Algeria vs Austria", "Match Result", "Austria", { ...ausML, americanOdds: oAus }),
  leg("team:72:btts:no", "Jordan vs Argentina", "Both Teams To Score", "Both teams to score: No", { ...bttsJA, americanOdds: oBttsNo }),
];
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
const comb = (legs) => legs.reduce((d, l) => d * dec(l.odds), 1);
console.log(`Lane A (fresh $100 Step 1): ${laneAlegs.map((l) => `${l.selection} (${l.odds})`).join(" + ")} → combined ${Math.round((comb(laneAlegs) - 1) * 100) > 0 ? "+" : ""}${Math.round((comb(laneAlegs) - 1) * 100)} · $100→$${(100 * comb(laneAlegs)).toFixed(2)}`);
console.log(`Lane B ($206.25 Step 2): ${laneBlegs.map((l) => `${l.selection} (${l.odds})`).join(" + ")} → combined +${Math.round((comb(laneBlegs) - 1) * 100)} · $206.25→$${(206.25 * comb(laneBlegs)).toFixed(2)}`);

// ── 1) Restart ladder Lane A → fresh cycle, $100 Step 1; prior stopped lane preserved in priorLane. ──
const ladderPath = path.join(DATA, "methodology", "launch", "dual-bank-builder-active.json");
const ladderDoc = rd("methodology/launch/dual-bank-builder-active.json");
const run = ladderDoc.run ?? ladderDoc;
const priorA = JSON.parse(JSON.stringify(run.laneA));
const newCycle = (run.laneA.cycle ?? 3) + 1;
run.laneA = {
  laneId: "A", label: `Lane A: lower-volatility survival lane (cycle ${newCycle})`,
  legs: [], steps: [{ step: 1, status: "active" }], laneStatus: "active", currentStep: 1,
  cycle: newCycle, cycleStartedAt: nowIso,
  note: `Restarted June-27 (operator executive override): fresh $100 Step-1 on the late slate after the June-26 Step-2 loss (preserved in priorLane + the ledger). Diversified vs Lane B.`,
  priorLane: priorA,
};
// Lane B continues at Step 2 — ensure an open Step-2 slot exists for settlement to record into.
if (!run.laneB.steps.some((s) => s.step === 2)) run.laneB.steps.push({ step: 2, status: "active" });

// ── 2) Write the approved-card lock (operator override) for both lanes. ──
const lock = {
  date: "2026-06-27", status: "approved",
  note: "Operator EXECUTIVE OVERRIDE (June 27 late slate): manually approved cards on the only two not-yet-started 10 PM ET games. Overrides the quality engine's refusal on the thin late slate. Proven-settleable markets only.",
  bankBuilder: {
    A: { legs: laneAlegs, approvedAt: nowIso, reason: "late-slate manual restart" },
    B: { legs: laneBlegs, approvedAt: nowIso, reason: "late-slate manual continuation" },
  },
  moonshot: {},
};

if (!apply) { console.log("\nDRY-RUN — no files written. Re-run with --apply."); process.exit(0); }
fs.writeFileSync(ladderPath, JSON.stringify(ladderDoc, null, 2) + "\n");
fs.writeFileSync(path.join(DATA, "mr-dub", "bank-builder-locks.json"), JSON.stringify(lock, null, 2) + "\n");
console.log("\nAPPLIED → ladder Lane A restarted (cycle " + newCycle + ", $100 Step 1) + lock written. Run activate-daily-portfolio --apply next.");
