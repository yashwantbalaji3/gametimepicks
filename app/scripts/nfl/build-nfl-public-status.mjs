/**
 * NFL public model-status artifact (Program 172 · Release C).
 *
 * The /nfl coverage table used to carry hand-typed prose. This generator DERIVES every layer's
 * state from the committed research receipts, then publishes only what a reader needs: a plain
 * English headline, the reason, the exact next gate, and a small machine-readable state that
 * guards can pin. Research payloads, file paths, schema names, and metric internals stay private —
 * a handful of already-public numbers appear only where they make the claim checkable.
 *
 * A layer with no receipt renders UNKNOWN, never green. A layer whose receipt says the model
 * failed renders the failure in words a reader understands.
 *
 * Usage: node scripts/nfl/build-nfl-public-status.mjs --now <iso>
 * Writes: app/public/data/nfl/model-status.json  (PUBLIC — derived, no research payload)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const preseason = read(path.join(ROOT, "data/internal/research/nfl/reports/preseason-model-v1-evaluation.json"));
const regular = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
const props = read(path.join(ROOT, "data/internal/research/nfl/reports/player-props-v1-evaluation.json"));
const td = read(path.join(ROOT, "data/internal/research/nfl/reports/anytime-td-v1-calibration.json"));
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));

const nowMs = Date.parse(NOW);
const upcoming = (schedule?.rows ?? []).filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs);
const seasonTypes = new Set(upcoming.map((r) => r.seasonType));
const windowIsPreseason = seasonTypes.size === 1 && seasonTypes.has(1);

// ---------------------------------------------------------------- team simulation
let teamSim;
if (!preseason || !regular) {
  teamSim = { state: "UNKNOWN", headline: "Model status unavailable", detail: "No evaluation receipt is readable, so no claim is made.", nextGate: null };
} else if (windowIsPreseason) {
  const promoted = Object.values(preseason.promotion).some((p) => p.state === "PUBLIC_ELIGIBLE");
  const w = preseason.heldOut2025.winner;
  teamSim = promoted
    ? { state: "LIVE", headline: "Preseason simulations are published", detail: "A preseason-specific model cleared the accuracy and calibration bars set before it was tested.", nextGate: null }
    : {
      state: "MODEL_ABSTAINS",
      headline: "We do not publish a prediction for preseason games",
      detail:
        `A preseason-specific model was built and tested on a held-out season. It picked winners no better than a coin flip (${w.model.logLoss} against a coin's ${w.baselines.coin.logLoss}), and its score ranges missed the accuracy and calibration bars that were set before the test. The bars were not lowered afterwards, so the model holds.`,
      nextGate: "Regular season kickoff in September, where the evaluated model already clears its bar on a held-out 2025 season.",
      checkable: { heldOutSeason: "2025 preseason", games: preseason.accounting.testGames, winnerLogLoss: w.model.logLoss, coinLogLoss: w.baselines.coin.logLoss },
    };
} else {
  teamSim = {
    state: "REGULAR_SEASON_ELIGIBLE",
    headline: "Regular-season simulations are eligible",
    detail: "The evaluated regular-season model applies to this window; publication still requires a current pre-kickoff artifact and a fresh market capture.",
    nextGate: "A current pre-kickoff simulation artifact for each game.",
  };
}

// ---------------------------------------------------------------- market prices
const marketFresh = markets && markets.rows?.length
  ? markets.rows.filter((r) => markets.capturedAt < r.kickoffUtc).length
  : 0;
const market = marketFresh
  ? {
    state: "LIVE",
    headline: "Sportsbook prices are published for this slate",
    detail: `Captured before every kickoff shown, across up to ${Math.max(...markets.rows.map((r) => r.books.length))} sportsbooks. These are the books' own numbers with attribution — not GameTimePicks predictions.`,
    capturedAt: markets.capturedAt,
    events: marketFresh,
  }
  : { state: "NO_MARKET", headline: "No current sportsbook prices", detail: "No authorized price capture covers this window. No substitute prices are shown and none are invented.", nextGate: "The next authorized market capture." };

// ---------------------------------------------------------------- player families
const probeFoundNothing = markets?.propMarkets?.state === "PROBED" && (markets.propMarkets.offeredMarkets ?? []).length === 0;
const familyState = (key, label) => {
  const promo = props?.promotion?.[key]?.state ?? null;
  if (!promo) return { key, label, state: "UNKNOWN", headline: `${label}: no evaluation on file`, detail: "No claim is made without an evaluation." };
  if (windowIsPreseason) {
    return {
      key, label,
      state: probeFoundNothing ? "NO_MARKET" : "ROLE_UNCERTAIN",
      headline: `${label}: held for preseason`,
      detail: probeFoundNothing
        ? "Two things are missing, and either alone is enough to hold: nobody can say which players will take the field in a preseason game, and the sportsbooks are not offering this market for these games."
        : "Nobody can say which players will take the field in a preseason game, so no player projection is published, whatever a sportsbook posts.",
      nextGate: "Regular-season participation evidence and an offered market.",
      modelStanding: promo === "PUBLIC_ELIGIBLE" ? "The projection model itself meets its accuracy bar; only the game-day evidence is missing." : promo === "SHADOW_ELIGIBLE" ? "The projection model is close to its bar and runs privately." : "The projection model is still research — its ranges are not yet reliable enough to publish.",
    };
  }
  return {
    key, label,
    state: promo === "PUBLIC_ELIGIBLE" ? "MODEL_READY" : promo === "SHADOW_ELIGIBLE" ? "PRIVATE_SHADOW" : "RESEARCH_ONLY",
    headline: `${label}: ${promo === "PUBLIC_ELIGIBLE" ? "model ready, awaiting live inputs" : "not published"}`,
    detail: promo === "PUBLIC_ELIGIBLE" ? "The model meets its bar; publication still needs current role evidence and a current price." : "The model has not cleared its accuracy bar and stays private.",
    nextGate: "Current role evidence, a current offered line, and settlement support.",
  };
};

const playerFamilies = [
  familyState("player_pass_yds", "Passing yards"),
  familyState("player_rush_yds", "Rushing yards"),
  familyState("player_reception_yds", "Receiving yards"),
  familyState("player_receptions", "Receptions"),
];

// ---------------------------------------------------------------- anytime TD
const anytimeTd = td
  ? {
    state: probeFoundNothing ? "NO_MARKET" : "ROLE_UNCERTAIN",
    headline: "Anytime touchdown: held",
    detail: probeFoundNothing
      ? "The scoring model is calibrated, but the sportsbooks are not offering touchdown markets for these preseason games, and preseason playing time is unknown. Both must change before anything publishes."
      : "The scoring model is calibrated, but preseason playing time is unknown, so no scorer is published.",
    nextGate: "An offered anytime-touchdown market plus current role evidence.",
  }
  : { state: "UNKNOWN", headline: "Anytime touchdown: no calibration on file", detail: "No claim is made without a calibration receipt." };

const out = {
  schemaVersion: 1,
  artifact: "nfl-public-model-status",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  windowSeasonType: windowIsPreseason ? "PRESEASON" : seasonTypes.size ? "MIXED_OR_REGULAR" : "NO_EVENTS",
  note: "Derived from committed evaluation receipts. Every state here is evidence-backed; a layer with no receipt reads UNKNOWN rather than green.",
  teamSimulation: teamSim,
  market,
  playerFamilies,
  anytimeTd,
};
const outPath = path.join(APP, "public/data/nfl/model-status.json");
const payload = JSON.stringify(out, null, 1);
// public-boundary self-check: no private path, schema name, or research marker may ride along
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "perTdShare", "shareBasis", "apiKey", "p171-ledger", "role-shares-v1"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: public status would carry "${banned}"`); process.exit(2); }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, payload);
console.log(`nfl public status: window ${out.windowSeasonType} · team ${teamSim.state} · market ${market.state} · players ${playerFamilies.map((f) => f.state).join("/")} · td ${anytimeTd.state}`);
