/**
 * Founder P0 2026-11-11 (~17:40Z): experimental starting-QB projections — exact labels, the sim simulates every identified
 * starter (the flag gates display only), and a flag-OFF build shows no experimental QB number anywhere.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { QB_FALLBACK_LABEL, QB_FALLBACK_NOTE, qbFallbackEntry } from "./qb-fallback.mjs";
import { simStarterDecision, SIM_STARTER } from "./sim-v2/starter-qb.mjs";
import { EXPERIMENTAL_PASSER, experimentalStarterTeams, maskExperimentalReceipt, maskExperimentalStarters } from "../../simulation-theater/qb-fallback-mask.mjs";

const APP = process.cwd();

test("labels are the founder's exact strings; nothing says validated", () => {
  assert.equal(QB_FALLBACK_LABEL.A_CLUB_HISTORY, "MODEL PROJECTION");
  assert.equal(QB_FALLBACK_LABEL.B_ALL_CLUB_HISTORY, "EXPERIMENTAL MODEL PROJECTION — limited individual history");
  assert.equal(QB_FALLBACK_LABEL.D_CONTEXTUAL_FALLBACK, "EXPERIMENTAL MODEL PROJECTION — rookie/contextual fallback");
  assert.equal(QB_FALLBACK_NOTE.D_CONTEXTUAL_FALLBACK, "Tends to project rookies high in historical testing.");
  const e = qbFallbackEntry({ eventId: "1", team: "MIA", opponent: "IND", starter: { playerId: "nfl-athlete-7", name: "Kyle McCord" }, tier: "D_CONTEXTUAL_FALLBACK", source: "depth chart QB1", careerAttempts: 0, market: { median: 189, p10: 87, p90: 352 }, basis: "tier (d)" });
  assert.equal(e.label, QB_FALLBACK_LABEL.D_CONTEXTUAL_FALLBACK);
  for (const v of [...Object.values(QB_FALLBACK_LABEL), ...Object.values(QB_FALLBACK_NOTE)]) assert.doesNotMatch(v, /validated/i);
  const panel = fs.readFileSync(path.join(APP, "src/components/nfl/qb-fallback-panel.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(panel, /validated/i, "no rendered copy says validated");
});

test("the sim simulates every identified starter, experimental included; an unconfirmed one passes to OTHER", () => {
  const board = (q) => ({ integrity: { qbStarter: [q] } });
  const d = simStarterDecision(board({ team: "MIA", state: "WITHHELD_STARTER_NOT_CONFIRMED", tier: "D_CONTEXTUAL_FALLBACK", experimental: true, starter: { playerId: "nfl-athlete-7", name: "Kyle McCord" } }), "MIA");
  assert.equal(d.state, SIM_STARTER.STARTER);
  assert.equal(d.experimental, true);
  assert.equal(d.starterQb, "nfl-athlete-7");
  assert.equal(simStarterDecision(board({ team: "MIA", state: "WITHHELD_STARTER_NOT_CONFIRMED", tier: null, reason: "x" }), "MIA").state, SIM_STARTER.WITHHELD);
});

test("flag OFF: the Theater and the simulation report show no experimental QB number or name", () => {
  const receipt = {
    inputSnapshotIds: { starters: { MIA: { state: "STARTER", starterQb: "qb7", experimental: true }, IND: { state: "STARTER", starterQb: "qb9" } } },
    playerStatDistributions: [{ playerId: "qb7", team: "MIA", stats: { passYds: { p50: 190 } } }, { playerId: "qb9", team: "IND", stats: { passYds: { p50: 230 } } }],
    scoringEventDistributions: { firstTdScorer: [{ playerId: "qb7", p: 0.02 }, { playerId: "wr", p: 0.1 }] },
  };
  assert.deepEqual(experimentalStarterTeams(receipt), ["MIA"]);
  const r = maskExperimentalReceipt(receipt);
  assert.deepEqual(r.playerStatDistributions.map((p) => p.playerId), ["qb9"]);
  assert.deepEqual(r.scoringEventDistributions.firstTdScorer.map((x) => x.playerId), ["wr"]);
  const side = (abbr, id) => ({ abbr, passing: [{ id, name: "QB", position: "QB", cmp: 20, passAtt: 31, passYds: 205, passTd: 1, int: 0 }], rushing: [{ id, name: "QB", position: "QB", rushAtt: 4, rushYds: 12, rushTd: 0, fumLost: 0 }], receiving: [], tdScorers: [], turnovers: [], team: { passYds: 205 } });
  const boxes = maskExperimentalStarters({ boxes: { 3: { away: side("MIA", "qb7"), home: side("IND", "qb9") } } }, receipt);
  const mia = boxes.boxes[3].away;
  assert.equal(mia.passing[0].name, EXPERIMENTAL_PASSER);
  assert.ok(["cmp", "passAtt", "passYds", "passTd", "int"].every((k) => mia.passing[0][k] === "—"));
  assert.equal(mia.rushing[0].rushYds, "—");
  assert.equal(mia.team.passYds, 205, "the team line keeps the run's totals");
  assert.equal(boxes.boxes[3].home.passing[0].passYds, 205, "an established starter is untouched");
});

test("the game page, Theater and simulation report gate the experimental display on the compile-time flag", () => {
  const game = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.match(game, /if \(process\.env\.GTP_NFL_QB_FALLBACK_PUBLIC === "1"\) \{\s*const \{ default: QbFallbackPanel \} = await import\("@\/components\/nfl\/qb-fallback-panel"\);\s*const \{ readQbFallback \} = await import\("@\/lib\/sports\/nfl\/qb-fallback-read\.mjs"\);/);
  assert.doesNotMatch(game, /^import .*qb-fallback-(panel|read)/m, "never a static import");
  const theater = fs.readFileSync(path.join(APP, "src/components/simulation-theater/PublicTheaterSection.tsx"), "utf8");
  assert.match(theater, /process\.env\.GTP_NFL_QB_FALLBACK_PUBLIC === "1" \? stored : maskExperimentalStarters\(stored, rec\?\.receipt\)/);
  const sim = fs.readFileSync(path.join(APP, "src/app/nfl/simulation/[eventId]/page.tsx"), "utf8");
  assert.match(sim, /process\.env\.GTP_NFL_QB_FALLBACK_PUBLIC === "1" \? r : maskExperimentalReceipt\(r\)/);
});
