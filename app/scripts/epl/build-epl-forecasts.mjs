#!/usr/bin/env node
/**
 * BUILD EPL FORECASTS — the missing end of the EPL chain.
 *
 * Capture, evaluate, replay and simulate all existed; nothing turned fixtures + odds + strength into
 * a published prediction. NFL has build-nfl-forecasts and UFC has its preflight; EPL had no
 * equivalent, so the engine priced fixtures correctly and the output reached no artifact and no
 * surface. That is the same orphaned shape as the UFC de-vig path, one layer further out.
 *
 *   node scripts/epl/build-epl-forecasts.mjs --now <iso> [--lookahead-hours 96] [--write]
 *
 * Writes data/internal/research/epl/forecasts/<date>.json + latest.json (PRIVATE research). Public
 * activation stays OFF on every row — this publishes the RUN, not a recommendation.
 *
 * Every state the ladder can reach is emitted with its reason. A fixture that cannot price is listed
 * as READY_EXCEPT_ODDS or ABSTAIN rather than dropped, because a forecast set that silently contains
 * only its successes misrepresents the slate it claims to cover.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength } from "../../src/lib/sports/epl/strength-state.mjs";
import { runEplShadow } from "../../src/lib/sports/epl/shadow-run.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "96"));
const WRITE = process.argv.includes("--write");
if (!Number.isFinite(Date.parse(NOW))) { console.error("usage: build-epl-forecasts.mjs --now <iso>"); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const EPL = path.join(APP, "public/data/soccer/epl");

const capFile = fs.readdirSync(path.join(EPL, "fixtures")).find((f) => f.startsWith("capture-") && f.endsWith(".json"));
if (!capFile) { console.error("no committed season capture — nothing to forecast"); process.exit(2); }
const season = readJson(path.join(EPL, "fixtures", capFile));

/* Odds are OPTIONAL by design: without them every fixture lands on READY_EXCEPT_ODDS with its reason
   stated, which is honest. Absent odds must never become approximated odds. */
const oddsPath = path.join(EPL, "odds", "latest.json");
const oddsSnapshot = fs.existsSync(oddsPath) ? readJson(oddsPath) : null;

const corpus = readJson(path.join(REPO, "data/internal/research/epl/corpus-v1.json"));
/* Cutoff at NOW: the fit may never see a result from a match it is about to forecast. */
const strengthState = fitEplStrength({ rows: corpus.rows, cutoffIso: NOW });

const nowMs = Date.parse(NOW);
const upcoming = (season.rows ?? []).filter((f) => {
  const k = Date.parse(f.kickoffIso ?? "");
  return Number.isFinite(k) && k > nowMs && k <= nowMs + LOOKAHEAD_H * 3600_000;
});

const rows = upcoming.map((fixture) => {
  const out = runEplShadow({ fixture, nowIso: NOW, strengthState, oddsSnapshot });
  return {
    eventId: fixture.eventId,
    matchup: `${fixture.homeClub} v ${fixture.awayClub}`,
    kickoffUtc: fixture.kickoffIso,
    matchweek: fixture.matchweek ?? null,
    state: out.state,
    rule: out.rule ?? null,
    reason: out.reason ?? null,
    /*
     * The model's own probabilities live at artifact.model.probs — NOT artifact.threeWay, which does
     * not exist. My first version read the wrong path and published nine rows stamped
     * CURRENT_PRE_EVENT with `threeWay: null`: a forecast set asserting it had predicted, carrying
     * no prediction. Nothing failed, because a missing field reads exactly like a quiet one.
     */
    model: out.artifact?.model
      ? { probs: out.artifact.model.probs, totals: out.artifact.model.totals, lambdas: out.artifact.model.lambdas, coldStart: out.artifact.model.coldStart, modelId: out.artifact.model.modelId }
      : null,
    market: out.artifact?.market
      ? { books: out.artifact.market.bookmakers.length, impliedSum: out.artifact.market.bookmakers[0]?.impliedSum ?? null }
      : null,
    publicActivation: "OFF",
  };
});

/*
 * A CURRENT_PRE_EVENT row without probabilities is not a forecast, and shipping one is worse than
 * shipping nothing — it looks like coverage. Refuse the whole set rather than persist it.
 */
const hollow = rows.filter((r) => r.state === "CURRENT_PRE_EVENT" && !r.model?.probs);
if (hollow.length > 0) {
  console.error(`REFUSED — ${hollow.length} row(s) claim CURRENT_PRE_EVENT while carrying no probabilities: ${hollow.map((r) => r.matchup).join(", ")}`);
  process.exit(3);
}

const counts = {};
for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;

const artifact = {
  schemaVersion: 1,
  artifact: "epl-forecast-set",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  competition: "epl",
  generatedAt: NOW,
  lookaheadHours: LOOKAHEAD_H,
  oddsCapturedAt: oddsSnapshot?.capturedAt ?? null,
  fixturesConsidered: upcoming.length,
  counts,
  /* Named so a reader can see WHY a fixture is absent from the priced set. */
  rows,
  note: "Forecast distributions only. publicActivation is OFF on every row; nothing here is a recommendation.",
};

const date = NOW.slice(0, 10);
const outDir = path.join(REPO, "data/internal/research/epl/forecasts");
if (WRITE) {
  fs.mkdirSync(outDir, { recursive: true });
  const payload = JSON.stringify(artifact, null, 1) + "\n";
  fs.writeFileSync(path.join(outDir, `${date}.json`), payload);
  fs.writeFileSync(path.join(outDir, "latest.json"), payload);
}

for (const r of rows) console.log(`  ${r.state.padEnd(18)} ${r.matchup}${r.threeWay ? ` · H ${r.threeWay.H} D ${r.threeWay.D} A ${r.threeWay.A}` : ""}`);
console.log(`\n${upcoming.length} fixture(s) in the next ${LOOKAHEAD_H}h · ${JSON.stringify(counts)}`);
console.log(WRITE ? `wrote ${path.relative(REPO, outDir)}/${date}.json + latest.json` : "dry run — pass --write to persist.");
