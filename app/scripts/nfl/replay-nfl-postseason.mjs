/**
 * NFL postseason HISTORICAL_REPLAY through the SHARED runner (Program 151 · Release A proof).
 *
 * Replays the 2025 postseason (13 games) from an Elo state frozen at the cutoff before its first
 * game — every rating comes from regular seasons + earlier postseasons only, fit inside the
 * adapter with the SAME parameters the evaluation script documents (K=20, HA=48, neutral-site
 * suppression, tie=half, 1/3 season regression). The runner owns cutoff enforcement, quarantine,
 * mode stamping and determinism. Tie probability is NOT modeled in v1: probs are binary H/A and
 * say so; a tie in the slate would grade as a miss against both.
 *
 * Run: node scripts/nfl/replay-nfl-postseason.mjs --season 2025 --now 2026-08-10T03:10:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReplay } from "../../src/lib/sports/research/replay-runner.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nfl");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now"), SEASON = Number(arg("--season", "2025"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const games = corpus.rows.filter((r) => r.phase !== 1); // preseason never fits (evaluation policy)
const slateRows = games.filter((g) => g.season === SEASON && g.phase === 3);
if (!slateRows.length) { console.error(`REFUSED: no postseason games for ${SEASON}`); process.exit(1); }
const cutoffIso = `${slateRows.map((g) => g.dateUtc).sort()[0].slice(0, 10)}T00:00:00Z`;

const K = 20, HA = 48, MEAN = 1505;
const adapter = {
  sport: "nfl",
  trainingRows: () => games.map((g) => ({ ...g, eventKey: g.providerEventId })),
  slate: () => slateRows.map((g) => ({ eventKey: g.providerEventId, dateUtc: g.dateUtc, home: g.home, away: g.away, neutralSite: g.neutralSite })),
  fit: (rows) => {
    const elo = new Map(); const get = (t) => elo.get(t) ?? MEAN;
    let season = null;
    for (const g of rows) {
      if (season != null && g.season !== season) for (const [t, r] of elo) elo.set(t, r + (MEAN - r) / 3);
      season = g.season;
      const ha = g.neutralSite ? 0 : HA;
      const exp = 1 / (1 + Math.pow(10, (get(g.away) - (get(g.home) + ha)) / 400));
      const s = g.result === "H" ? 1 : g.result === "T" ? 0.5 : 0;
      elo.set(g.home, get(g.home) + K * (s - exp));
      elo.set(g.away, get(g.away) + K * ((1 - s) - (1 - exp)));
    }
    return { get };
  },
  predict: (fit, ev) => {
    const ha = ev.neutralSite ? 0 : HA;
    const p = 1 / (1 + Math.pow(10, (fit.get(ev.away) - (fit.get(ev.home) + ha)) / 400));
    return { probs: { H: p, A: 1 - p }, elo: { home: Math.round(fit.get(ev.home)), away: Math.round(fit.get(ev.away)) }, neutralSite: ev.neutralSite, tieNote: "tie probability not modeled in v1 — binary H/A" };
  },
};

const artifact = runReplay({ sportAdapter: adapter, cutoffIso, targetMarket: "moneyline", nowIso: NOW });
const byKey = Object.fromEntries(slateRows.map((g) => [g.providerEventId, g]));
artifact.validation = artifact.predictions.map((p) => {
  const g = byKey[p.eventKey];
  return { eventKey: p.eventKey, matchup: `${g.away} at ${g.home}${g.neutralSite ? " (neutral)" : ""}`, actualScore: `${g.ftHome}-${g.ftAway}`, actualResult: g.result, modelProbOfActualResult: g.result === "T" ? 0 : Number(p.probs[g.result].toFixed(4)) };
});

fs.mkdirSync(path.join(ROOT, "replays"), { recursive: true });
const file = `replay-${SEASON}-postseason.json`;
fs.writeFileSync(path.join(ROOT, "replays", file), JSON.stringify(artifact, null, 1));
const hits = artifact.validation.filter((v) => { const p = artifact.predictions.find((x) => x.eventKey === v.eventKey); return v.actualResult !== "T" && (p.probs.H >= 0.5 ? "H" : "A") === v.actualResult; }).length;
console.log(`${file}: mode ${artifact.mode}, id ${artifact.deterministicId}, training ${artifact.trainingCount}, excluded ${artifact.excludedAtOrAfterCutoffCount}, quarantined ${artifact.quarantinedCount}, top-class ${hits}/${artifact.predictions.length}`);
