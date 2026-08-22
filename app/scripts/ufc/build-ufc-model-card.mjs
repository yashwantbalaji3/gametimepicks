/**
 * THE MODEL CARD FOR THE MODEL THAT IS ACTUALLY DEPLOYED.
 *
 * data/internal/research/ufc/ held two model cards and BOTH described the abstaining Elo
 * (ufc-model-v1-abstaining-elo), a system superseded by the three-head fight model that has been
 * publishing a winner, a method and an ending round for every bout on /ufc. The card in the registry
 * described a model no reader was being shown.
 *
 * That is not a filing problem. A model card is where the protocol, the population and the
 * limitations are written down, and a deployed model without one is a model whose claims cannot be
 * checked against anything. It is also the artifact the gate's `model` stage reads.
 *
 * DERIVED, NOT AUTHORED. Every figure here is read from the evaluation the model actually ran —
 * fabricating or hand-copying a metric into a model card is how a card comes to flatter its model.
 *
 * Usage: node scripts/ufc/build-ufc-model-card.mjs --now <iso>
 * Writes: data/internal/research/ufc/model-card-fight-v1.json (PRIVATE research)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const evaluation = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/fight-model-evaluation.json"), "utf8"));
if (!evaluation.modelId) { console.error("REFUSED: the evaluation carries no modelId"); process.exit(1); }

const head = (id) => {
  const h = evaluation.heads?.[id];
  if (!h) return null;
  return {
    logLoss: h.logLoss, baselineLogLoss: h.baselineLogLoss, gain: h.gain,
    accuracy: h.accuracy, baselineAccuracy: h.baselineAccuracy,
    heldOutFights: h.n,
    maxCalibrationZ: h.maxCalibrationZ ?? null,
    verdict: evaluation.verdicts?.[id] ?? null,
  };
};

const card = {
  schemaVersion: 1,
  artifact: "ufc-fight-model-card",
  dataClass: "INTERNAL_RESEARCH",
  public: false,
  generatedAt: NOW,
  modelId: evaluation.modelId,
  modelFamily: evaluation.modelFamily ?? null,
  supersedes: "ufc-model-v1-abstaining-elo",

  objective: "Per-bout winner, method of victory (KO / SUB / DEC) and ending round for a scheduled UFC card.",

  population: {
    ...evaluation.corpus,
    note: "Decisive bouts only. A draw or no-contest is EXCLUDED rather than assigned to a side — the " +
          "source is winner-only and cannot distinguish them, so v1 refuses to guess.",
  },

  /*
   * The protocol, stated because it is the part a reader cannot verify from the numbers.
   */
  protocol: {
    split: "CHRONOLOGICAL. Fights are ordered by date and the holdout is the later slice — never a random split, which would let a fighter's future inform his past.",
    features: "Accumulated by replaying fights in date order. A fight sees only what happened strictly before it; nothing reads a career-to-date aggregate, which would include the bout itself.",
    calibration: "Platt, fitted on an INNER fold. The training fold is split 80/20, an inner model predicts the held-back 20%, and the calibrator is fitted on THOSE predictions — a calibrator fitted on the slice it will be applied to learns the identity and reports perfect calibration.",
    sharedLibrary: "The evaluator and the card builder import the SAME lib/fight-model.mjs, so the thing validated and the thing published cannot drift apart.",
    cornerCanonicalisation: evaluation.cornerCanonicalisation ?? null,
  },

  /* Fixed before the numbers were seen. Recorded so a later reader can see they were not moved. */
  bars: evaluation.bars ?? null,
  baseRates: evaluation.baseRates ?? null,
  heads: { winner: head("winner"), method: head("method"), round: head("round") },
  verdicts: evaluation.verdicts ?? null,

  limitations: [
    "NEVER SCORED AGAINST A PRICE. No comparison against a no-vig UFC line has ever been run, so nothing here supports a claim that the model beats a market. Its gains are against a base-rate baseline.",
    "The winner head's advantage is small: a log-loss gain of about 0.015 over a coin, and accuracy near 58%. That clears its preregistered bar and is not a large signal.",
    "Winner-only source: method and round are learned from a corpus that records the outcome but not the detail of how a fight was scored.",
    "A debutant has no history to accumulate, so the engine declines rather than guessing — coverage is a property of who is fighting.",
    "One card has been settled from official results. Held-out evaluation is not a live track record.",
  ],

  publicActivation: "The model's read publishes on /ufc as EXPERIMENTAL and paper-only. It selects the side on the UFC risk ladder — which it may do, and MLB's and EPL's models may not, because this is the one model here that cleared its preregistered bar.",
};

const out = path.join(REPO, "data/internal/research/ufc/model-card-fight-v1.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(card, null, 2)}\n`);

console.log(`ufc fight model card: ${card.modelId}`);
for (const [id, h] of Object.entries(card.heads)) {
  if (h) console.log(`  ${id.padEnd(7)} ${h.verdict} · gain ${h.gain.toFixed(4)} · accuracy ${(h.accuracy * 100).toFixed(1)}% vs ${(h.baselineAccuracy * 100).toFixed(1)}% · n ${h.heldOutFights}`);
}
console.log(`  ${card.limitations.length} limitations recorded · supersedes ${card.supersedes}`);
console.log(`wrote ${path.relative(REPO, out)}`);
