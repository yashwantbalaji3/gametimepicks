/* NBA social data contract gtp-social-nba@1 (launch program 2026-10-28): built only from the published lane + record,
   through the pages' own accessors — never a second forecast. Committed data + controls. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildNbaSocialDay, NBA_SOCIAL_SCHEMA, PLAYER_FAMILIES } from "./nba-social.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";

const DIR = path.join(process.cwd(), "public/data/nba/experimental-public");
const lane = JSON.parse(fs.readFileSync(path.join(DIR, "2026-10-27.json"), "utf8"));
const rec = [{ providerEventId: lane.games[0].providerEventId, state: "MATCHED", final: { away: 124, home: 125, winnerSide: "home" } }];

test("every event mirrors the lane: side, frozen time, receipt, medians — nothing recomputed", () => {
  const d = buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-27" });
  assert.equal(d.schemaVersion, NBA_SOCIAL_SCHEMA);
  assert.equal(d.events.length, lane.games.length);
  assert.equal(d.stale, false);
  for (const [i, e] of d.events.entries()) {
    const g = lane.games[i];
    assert.equal(e.frozenAt, g.frozenAt);
    assert.equal(e.receipt.payloadSha256, g.receipt.payloadSha256);
    assert.equal(e.official.favouredTeam, g.elo.state === "FAVOURED" ? g.elo.favoured : null);
    const est = eloWinProbabilityOf(g);
    assert.deepEqual(e.official.eloEstimate ? [e.official.eloEstimate.home, e.official.eloEstimate.away] : null, est ? [est.home, est.away] : null, "the one accessor decides");
    const all = [...g.players.away, ...g.players.home];
    assert.equal(e.players.length, all.length);
    for (const p of e.players) {
      const src = all.find((x) => String(x.providerAthleteId) === p.id);
      for (const f of PLAYER_FAMILIES) assert.equal(p.medians[f.key], (f.combo ? src.comboMedians?.[f.key] : src.medians?.[f.key]) ?? null, `${p.name} ${f.key}`);
    }
  }
  assert.deepEqual(d.events[0].result, { state: "MATCHED", final: { away: 124, home: 125, winnerSide: "home" } }, "the record's row, verbatim");
  assert.equal(d.events[1].result.state, "NOT_IN_RECORD", "no row → said so, never a guessed result");
});

test("switch off or missing provenance → the estimate is WITHHELD with a reason; no prices, picks or accuracy claims anywhere", () => {
  const off = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", eloEnabled: false });
  assert.ok(off.events.every((e) => e.official.eloEstimate === null && e.withheld.some((w) => w.family === "eloEstimate")));
  assert.equal(off.contract.eloEstimate, "WITHHELD");
  const text = JSON.stringify(buildNbaSocialDay({ lane, buildEtDate: "2026-10-27" }));
  assert.doesNotMatch(text, /americanOdds|"odds":|"line":/, "no price or line fields");
  assert.match(text, /"accuracyClaim":false|"record":null/);
});

test("a lane older than the build day is marked stale; an empty lane is not PUBLISHED", () => {
  assert.equal(buildNbaSocialDay({ lane, buildEtDate: "2026-10-28" }).stale, true);
  assert.equal(buildNbaSocialDay({ lane: { date: "2026-10-28", games: [] }, buildEtDate: "2026-10-28" }).publication.status, "NO_GAMES");
});

test("deterministic: same inputs → identical bytes (no wall-clock field)", () => {
  const a = JSON.stringify(buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-27", laneSha256: "x" }));
  const b = JSON.stringify(buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-27", laneSha256: "x" }));
  assert.equal(a, b);
  assert.doesNotMatch(a, /generatedAt"(?!:)|"builtAt"/);
});

test("line comparisons: PRIVATE by default — the feed carries no line, price, book or difference", () => {
  const d = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27" });
  assert.equal(d.lineComparisons.displayPermission, "PRIVATE");
  const lc = d.events[0].players[0].lineComparison;
  assert.deepEqual(Object.keys(lc).sort(), PLAYER_FAMILIES.map((f) => f.key).sort());
  for (const v of Object.values(lc)) assert.deepEqual([v.status, v.displayPermission], ["NOT_AUTHORIZED", "PRIVATE"]);
  assert.doesNotMatch(JSON.stringify(d), /"overPrice"|"underPrice"|"difference"|"book":/, "nothing priced leaks while private");
  assert.match(d.events[0].snapshotId, /^[0-9a-f]{16}@/);
});

test("line comparisons when authorized: COMPARED rows carry line, prices, book, capture, difference, direction; others say why", () => {
  const g = lane.games[0], p = g.players.away[0];
  const board = { rows: [{ eventId: String(g.providerEventId), athleteId: String(p.providerAthleteId), family: "pts", direction: "ABOVE", line: 10.5, overPrice: -110, underPrice: -110, book: "draftkings", marketKey: "player_points", capturedAt: "2026-10-27T20:00:00Z", difference: 0.9 }], coverage: { compared: 1 } };
  const d = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board, lineDisplay: { public: true, social: true } });
  const lc = d.events[0].players.find((x) => x.id === String(p.providerAthleteId)).lineComparison;
  assert.deepEqual([lc.pts.status, lc.pts.direction, lc.pts.difference, lc.pts.book, lc.pts.overPrice], ["COMPARED", "ABOVE", 0.9, "draftkings", -110]);
  assert.deepEqual([lc.reb.status, lc.reb.reason], ["UNAVAILABLE", "NO_LINE"]);
  assert.equal(d.lineComparisons.displayPermission, "PUBLIC");
});
