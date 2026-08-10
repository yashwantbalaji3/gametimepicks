/**
 * UFC card HISTORICAL_REPLAY through the SHARED runner (Program 153 · Release A proof).
 *
 * Replays the LAST completed card in the corpus from a state fit strictly on earlier bouts, with
 * the SAME abstention rules the evaluator documents (either fighter <3 prior decisive bouts or
 * idle >540 days → ABSTAIN). Abstentions are first-class artifact rows: the runner sees only the
 * covered slate; abstained bouts are recorded beside it with their reasons, so the denominator is
 * visible on the artifact itself.
 *
 * Run: node scripts/ufc/replay-ufc-card.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReplay } from "../../src/lib/sports/research/replay-runner.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "ufc");

const arg = (n, f) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const rows = corpus.rows;
const lastCardId = rows[rows.length - 1].providerCardId;
const slateAll = rows.filter((b) => b.providerCardId === lastCardId);
const cardName = slateAll[0].cardName;
const cutoffIso = `${slateAll.map((b) => b.dateUtc).sort()[0].slice(0, 10)}T00:00:00Z`;

const K = 32, START = 1500, SPARSE = 3, IDLE_DAYS = 540;
function fitState(training) {
  const elo = new Map(), hist = new Map();
  const gE = (id) => elo.get(id) ?? START;
  for (const b of training) {
    if (b.outcome !== "DRAW_OR_NC") {
      const exp = 1 / (1 + Math.pow(10, (gE(b.blue.id) - gE(b.red.id)) / 400));
      const y = b.outcome === "R" ? 1 : 0;
      elo.set(b.red.id, gE(b.red.id) + K * (y - exp));
      elo.set(b.blue.id, gE(b.blue.id) + K * ((1 - y) - (1 - exp)));
    }
    for (const id of [b.red.id, b.blue.id]) {
      const h = hist.get(id) ?? { n: 0, last: null };
      h.n += b.outcome !== "DRAW_OR_NC" ? 1 : 0; h.last = b.dateUtc; hist.set(id, h);
    }
  }
  return { gE, hist };
}

// Abstention decided OUTSIDE the runner so abstained bouts never look like predictions.
const training = rows.filter((b) => Date.parse(b.dateUtc) < Date.parse(cutoffIso));
const st = fitState(training);
const t0 = Date.parse(cutoffIso);
const abstains = [];
const covered = [];
for (const b of slateAll) {
  const hr = st.hist.get(b.red.id) ?? { n: 0, last: null };
  const hb = st.hist.get(b.blue.id) ?? { n: 0, last: null };
  const idle = (h) => h.last != null && (t0 - Date.parse(h.last)) / 86400000 > IDLE_DAYS;
  const reasons = [];
  if (hr.n < SPARSE) reasons.push(`red ${b.red.name}: ${hr.n} prior decisive bouts in-corpus`);
  if (hb.n < SPARSE) reasons.push(`blue ${b.blue.name}: ${hb.n} prior decisive bouts in-corpus`);
  if (idle(hr)) reasons.push(`red idle >${IDLE_DAYS}d`);
  if (idle(hb)) reasons.push(`blue idle >${IDLE_DAYS}d`);
  if (reasons.length) abstains.push({ boutId: b.providerBoutId, matchup: `${b.red.name} vs ${b.blue.name}`, reasons });
  else covered.push(b);
}

const adapter = {
  sport: "ufc",
  trainingRows: () => training.map((b) => ({ ...b, eventKey: b.providerBoutId })),
  slate: () => covered.map((b) => ({ eventKey: b.providerBoutId, dateUtc: b.dateUtc, red: b.red, blue: b.blue })),
  fit: (t) => fitState(t),
  predict: (fit, ev) => {
    const p = 1 / (1 + Math.pow(10, (fit.gE(ev.blue.id) - fit.gE(ev.red.id)) / 400));
    return { probs: { R: p, B: 1 - p }, elo: { red: Math.round(fit.gE(ev.red.id)), blue: Math.round(fit.gE(ev.blue.id)) } };
  },
};

const artifact = runReplay({ sportAdapter: adapter, cutoffIso, targetMarket: "bout_winner", nowIso: NOW });
artifact.card = { providerCardId: lastCardId, name: cardName };
artifact.coverage = { slateBouts: slateAll.length, covered: covered.length, abstained: abstains.length, rate: Number((covered.length / slateAll.length).toFixed(4)) };
artifact.abstentions = abstains;
const byKey = Object.fromEntries(slateAll.map((b) => [b.providerBoutId, b]));
artifact.validation = artifact.predictions.map((p) => {
  const b = byKey[p.eventKey];
  return { eventKey: p.eventKey, matchup: `${b.red.name} vs ${b.blue.name}`, actualOutcome: b.outcome, modelProbOfActual: b.outcome === "DRAW_OR_NC" ? 0 : Number(p.probs[b.outcome].toFixed(4)) };
});

fs.mkdirSync(path.join(ROOT, "replays"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "replays", "replay-last-card.json"), JSON.stringify(artifact, null, 1));
const hits = artifact.validation.filter((v) => { const p = artifact.predictions.find((x) => x.eventKey === v.eventKey); return v.actualOutcome !== "DRAW_OR_NC" && (p.probs.R >= 0.5 ? "R" : "B") === v.actualOutcome; }).length;
console.log(`replay-last-card.json (${cardName}): mode ${artifact.mode}, id ${artifact.deterministicId}, covered ${covered.length}/${slateAll.length} (abstained ${abstains.length}), top-class ${hits}/${artifact.predictions.length}`);
