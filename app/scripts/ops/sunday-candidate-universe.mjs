#!/usr/bin/env node
/**
 * THE SUNDAY CANDIDATE UNIVERSE — can NFL legitimately compete for a Bank Builder / Moonshot slot?
 *
 * ⚠ READ-ONLY, AND IT MUST STAY THAT WAY. It reads the FROZEN boards and the published family states
 *   and writes nothing. The frozen Sunday baseline is protected until acceptance; this command exists
 *   to describe it, never to move it.
 *
 * ⚠ IT RELAXES NO GATE. Every state comes from an artifact the producers already publish:
 *   family state from nfl/model-status.json, participation from the board row, line/price/capturedAt
 *   from the board's own frozen `market` block. `NO QUALIFYING PLAY` is a valid, correct answer.
 *
 * Usage — npx tsx, NOT bare node:
 *   npx tsx app/scripts/ops/sunday-candidate-universe.mjs --date 2026-09-27
 *   npx tsx app/scripts/ops/sunday-candidate-universe.mjs --date 2026-09-27 --json
 *
 * ⚠ tsx IS REQUIRED because this imports the V2 contract, which imports V1, which imports
 *   `sport-capability-registry.ts`. Bare node fails with ERR_UNKNOWN_FILE_EXTENSION. The same chain
 *   means a PLAIN-NODE consumer — `api/ask.mjs` is the live example — can never import V2 directly;
 *   anything it needs must be derived into a committed artifact first.
 *
 * EXIT CODES — a report describes.
 *   0  it ran   ·   2  it could not run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCandidate, foldUniverse, CANDIDATE_STATE, SETTLEMENT_SUPPORT } from "../../src/lib/products/candidate-universe.mjs";
import { loadNflBoardCandidates } from "../../src/lib/products/engine-v2/nfl-boards.mjs";
import { PROBABILITY_BASIS, evaluateLegV2, eligibilityFunnel } from "../../src/lib/products/eligible-leg/v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const DATE = arg("--date");
const JSON_OUT = has("--json");
/* The contract's own bound (LEG_BOUNDS.maxPriceAgeMs). Named, not invented. */
const MAX_PRICE_AGE_MS = Number(arg("--max-price-age-hours", "12")) * 3_600_000;

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };
if (!DATE) die("--date <YYYY-MM-DD> is required — this command never guesses a slate");

/* ── ONE LOADER (Session 7): family states, boards, settlement tri-state and probability basis come from
   lib/products/engine-v2/nfl-boards.mjs, the same owner the daily recommendation universe reads — so this
   ops command and the products cannot disagree about a Sunday. ──────────────────────────────────────── */
function nextDay(d) { const t = Date.parse(`${d}T00:00:00Z`); return new Date(t + 86400000).toISOString().slice(0, 10); }
const BOARDS = path.join(APP, "public/data/nfl/player-board");
if (!fs.existsSync(BOARDS)) die(`no player-board directory at ${BOARDS}`);
const statusDoc = read(path.join(APP, "public/data/nfl/model-status.json"));
if (!statusDoc?.playerFamilies) die("nfl/model-status.json has no playerFamilies — cannot judge a family state");
/* Sunday night games kick after midnight UTC, so the slate spans two UTC dates. */
const { boards, candidates, familyState, unknownFamilies } = loadNflBoardCandidates({
  dataRoot: path.join(APP, "public/data"),
  workflowsDir: path.resolve(APP, "..", ".github/workflows"),
  boardFilter: (b) => { const k = String(b.kickoffUtc ?? ""); return k.startsWith(DATE) || k.startsWith(nextDay(DATE)); },
});

if (!boards.length) {
  console.log(`NO_BOARDS — ${DATE} has no published NFL player board. A result, not a gap.`);
  process.exit(0);
}

/* asOf is the boards' OWN generation instant, never a wall clock: this describes a frozen slate. */
const asOf = boards[0].generatedAt;
if (unknownFamilies.length) console.error(`⚠ UNDECLARED FAMILIES SKIPPED: ${unknownFamilies.join(", ")} — add them to NFL_FAMILY_MARKET_SHAPE rather than letting them read as unpriced`);

const evaluated = candidates.map((c) => evaluateCandidate(c, { asOf, maxPriceAgeMs: MAX_PRICE_AGE_MS }));
const fold = foldUniverse(evaluated);

/* The V2 contract over the same candidates, and the funnel the products are judged on. */
const v2legs = candidates.map((c) => evaluateLegV2(c, { asOf, maxPriceAgeMs: MAX_PRICE_AGE_MS }));
const funnel = eligibilityFunnel(v2legs);
const basisMix = {};
for (const l of v2legs) basisMix[l.probabilityBasis] = (basisMix[l.probabilityBasis] ?? 0) + 1;
/* The anti-masquerade invariant, checked on real data rather than asserted in a comment. */
const masquerading = v2legs.filter((l) => l.modelProbability != null && l.probabilityBasis !== PROBABILITY_BASIS.MODEL_PUBLISHED);

if (JSON_OUT) {
  /* Synchronous — console.log + process.exit truncates a large payload on a pipe at 65536 bytes. */
  fs.writeSync(1, JSON.stringify({
    artifact: "sunday-candidate-universe", readOnly: true, relaxesNoGate: true,
    date: DATE, asOf, boards: boards.length, maxPriceAgeHours: MAX_PRICE_AGE_MS / 3_600_000,
    familyStates: Object.fromEntries(familyState),
    fold, funnel, probabilityBasis: basisMix, masqueradingLegs: masquerading.length,
    candidates: evaluated, v2: v2legs,
  }, null, 1) + "\n");
  process.exit(0);
}

console.log(`SUNDAY CANDIDATE UNIVERSE · ${DATE} · ${boards.length} board(s) · asOf ${asOf}`);
console.log("READ-ONLY. No gate relaxed; every state comes from an artifact the producers publish.\n");

console.log("FAMILY STATES (from nfl/model-status.json — the states the product path never consulted):");
for (const [k, v] of [...familyState].sort()) {
  const cleared = ["PUBLISHED", "VALIDATED_PICK", "ADOPTED"].includes(v);
  console.log(`  ${cleared ? "✓" : "✗"} ${k.padEnd(22)} ${v}`);
}

console.log(`\nCANDIDATES · ${fold.total} rows → ${fold.eligible} eligible · ${fold.rejected} rejected`);
console.log(`VERDICT: ${fold.verdict}\n`);

console.log("by PRIMARY blocking state:");
for (const [s, n] of Object.entries(fold.byPrimary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${s}`);
}

console.log("\nby FAMILY:");
for (const [f, v] of Object.entries(fold.byFamily).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${f.padEnd(30)} ${String(v.total).padStart(4)} rows · ${v.eligible} eligible · state=${v.familyState}`);
}

/* The distribution of ALL failing gates, so no leg looks one fix from eligible when it is four. */
const allGates = {};
for (const e of evaluated) for (const s of e.states) if (s !== CANDIDATE_STATE.ELIGIBLE) allGates[s] = (allGates[s] ?? 0) + 1;
const settleMix = {};
for (const e of evaluated) settleMix[e.settlementSupport] = (settleMix[e.settlementSupport] ?? 0) + 1;
console.log("\nsettlement support (tri-state — \"prove it once\" is not \"build it\"):");
for (const [k, n] of Object.entries(settleMix).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

console.log("\nEVERY failing gate (a row can fail several — a first-fail count would mislead):");
for (const [s, n] of Object.entries(allGates).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${s}`);

console.log("\nELIGIBILITY FUNNEL (each stage is a SUBSET of the one above, so drops are attributable):");
for (const st of funnel.stages) console.log(`  ${String(st.remaining).padStart(4)}  ${st.stage}`);
console.log(`  BINDING STAGE: ${funnel.bindingStage ?? "(none — nothing was lost outright)"}`);

console.log("\nprobabilityBasis (a market-implied number can never be read as ours):");
for (const [k, n] of Object.entries(basisMix).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`  masquerading legs (a modelProbability on a non-model basis): ${masquerading.length}`);

if (fold.eligible === 0) {
  console.log("\nNO QUALIFYING PLAY for NFL on this slate — a correct output, not a failure.");
  console.log("Producing one would have required ignoring a gate, which is the one thing forbidden here.");
}
process.exit(0);
