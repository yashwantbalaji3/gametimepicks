/**
 * NBA Elo shadow (frozen pre-tip challenger forecasts) and the confirmatory challenger ledger. SYNTHETIC games, ratings,
 * finals and outcomes only; the real approval constants are used (synthetic games dated after the approval instant).
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/elo-shadow.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { shadowForecastDoc, challengerLedger, SHADOW_SCHEMA } from "./elo-shadow.mjs";
import { PREREG_APPROVED_AT, APPROVED_PREREG_SHA256, INSEASON_CHALLENGER_ID } from "./elo-ha-walkforward.mjs";
import { winProbability } from "./team-rating.mjs";
import { LABELS } from "./experimental-forecast.mjs";
import { mulberry32 } from "./bootstrap.mjs";

const OPENS = PREREG_APPROVED_AT[APPROVED_PREREG_SHA256[0]];
const RATING = { 1: 1550, 2: 1500, 3: 1480, 4: 1470 };
/** SYNTHETIC official v0.1 forecast game (constant official ratings, the official pHome). */
function official(id, h, a, tipUtc, inputAsOf) {
  return {
    providerEventId: id, label: LABELS[2], dateUtc: tipUtc, neutralSite: false,
    home: { providerTeamId: String(h), abbr: `T${h}` }, away: { providerTeamId: String(a), abbr: `T${a}` },
    forecast: { inputAsOf, elo: { home: { rating: RATING[h] }, away: { rating: RATING[a] }, pHome: Number(winProbability(RATING[h], RATING[a]).toFixed(4)) } },
  };
}
/** SYNTHETIC corpus rows (a prior season among the same four teams, keyed by team id). */
function corpus() {
  const rnd = mulberry32(4);
  return Array.from({ length: 200 }, (_, i) => {
    const h = 1 + Math.floor(rnd() * 4); let a = 1 + Math.floor(rnd() * 3); if (a >= h) a += 1;
    const w = rnd() < 0.58;
    return { providerEventId: `c${i}`, home: String(h), away: String(a), ftHome: w ? 110 : 100, ftAway: w ? 100 : 110, dateUtc: new Date(Date.UTC(2025, 10, 1) + i * 86400e3).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z"), season: 2026, phase: 2, neutralSite: false };
  });
}
const finals = (list) => ({ finals: list.map(([id, h, a, homeWins, dateUtc]) => ({ providerEventId: id, dateUtc, phase: "REGULAR", exhibition: false, neutralSite: false, home: { providerTeamId: String(h), tricode: `T${h}` }, away: { providerTeamId: String(a), tricode: `T${a}` }, ftHome: homeWins ? 110 : 100, ftAway: homeWins ? 100 : 110, winnerSide: homeWins ? "home" : "away" })), conflicts: [] });

test("shadow: frozen before tip from the official instant; write-once — a committed entry is carried, never recomputed", () => {
  const slate = [official("g1", 1, 2, "2026-11-12T00:30Z", "2026-11-11T11:00:00Z"), official("g2", 3, 4, "2026-11-12T03:00Z", "2026-11-11T11:00:00Z")];
  const rec = finals([["p1", 1, 3, true, "2026-11-10T00:30Z"], ["p2", 2, 4, false, "2026-11-10T01:00Z"]]);
  const inputs = { date: "2026-11-11", slateGames: slate, officialGames: slate, corpusRows: corpus(), finalsRecord: rec };
  const first = shadowForecastDoc({ ...inputs, now: "2026-11-11T15:00:00Z" });
  assert.equal(first.doc.schema, SHADOW_SCHEMA);
  assert.equal(first.doc.publicSurface, false);
  assert.equal(first.added, 2);
  const g1 = first.doc.games[0];
  assert.equal(g1.frozenAt, "2026-11-11T15:00:00Z");
  assert.equal(g1.inseason.challenger, INSEASON_CHALLENGER_ID);
  assert.equal(g1.inseason.updates, 2, "both earlier finals updated the in-season ratings");
  assert.equal(g1.official.pHome, slate[0].forecast.elo.pHome);
  // later run, new finals: the frozen entries come back byte-identical
  const rec2 = finals([["p1", 1, 3, true, "2026-11-10T00:30Z"], ["p2", 2, 4, false, "2026-11-10T01:00Z"], ["p3", 1, 2, false, "2026-11-11T20:00Z"]]);
  const again = shadowForecastDoc({ ...inputs, finalsRecord: rec2, now: "2026-11-11T22:00:00Z", existing: first.doc });
  assert.equal(again.added, 0);
  assert.deepEqual(again.doc, first.doc);
  // a game at or after tip is never added
  const late = shadowForecastDoc({ ...inputs, now: "2026-11-12T01:00:00Z" });
  assert.deepEqual(late.doc.games.map((g) => g.providerEventId), ["g2"]);
  assert.deepEqual(late.refused, [{ providerEventId: "g1", reason: "AT_OR_AFTER_TIP" }]);
  // deterministic bytes
  assert.equal(JSON.stringify(shadowForecastDoc({ ...inputs, now: "2026-11-11T15:00:00Z" }).doc), JSON.stringify(first.doc));
});

/** SYNTHETIC shadow docs + officials + finals for n confirmatory games (tips after the approval instant). */
function season(n, { edge = 0.1, before = 0, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const shadow = [], offs = [], fin = [];
  for (let i = 0; i < n + before; i += 1) {
    const tip = new Date(Date.parse(i < before ? "2026-11-05T00:30:00Z" : "2026-11-12T00:30:00Z") + i * 3600e3).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
    const o = official(`s${i}`, 1, 2, tip, new Date(Date.parse(tip) - 12 * 3600e3).toISOString());
    const truth = 0.3 + 0.4 * rnd();
    const y = rnd() < truth;
    o.forecast.elo.pHome = Number(Math.min(0.95, truth + 0.1).toFixed(4));
    offs.push(o);
    fin.push([o.providerEventId, 1, 2, y, tip]);
    shadow.push({ providerEventId: o.providerEventId, tipUtc: tip, frozenAt: o.forecast.inputAsOf, official: { pHome: o.forecast.elo.pHome }, inseason: { pHome: Number(Math.max(0.05, o.forecast.elo.pHome - edge).toFixed(4)) }, haOnly: { pHome: o.forecast.elo.pHome } });
  }
  return { shadowDocs: [{ games: shadow }], officialGames: offs, finalsRecord: finals(fin) };
}

test("ledger: confirmatory rows only, running n/300, verdict null before the look, no interim score", () => {
  const s = season(120, { before: 30 });
  const l = challengerLedger(s);
  assert.equal(l.n, 120);
  assert.equal(l.progress, "120/300");
  assert.equal(l.counts.exploratory, 30, "games tipping at or before the approval instant are counted, never rows");
  assert.equal(l.verdict, null);
  assert.ok(l.rows.every((r) => Date.parse(r.tipUtc) > Date.parse(OPENS)));
  assert.equal(JSON.stringify(l).includes("ci95"), false, "no interim interval anywhere");
  assert.equal(l.preregistration.approvedAt, "2026-11-11T00:09:14Z");
  assert.equal(JSON.stringify(challengerLedger(s)), JSON.stringify(l), "deterministic");
});

test("ledger: exclusions — pending or under-review final, shadow not frozen pre-tip, official mismatch, no official", () => {
  const s = season(6);
  s.finalsRecord.finals = s.finalsRecord.finals.filter((f) => f.providerEventId !== "s0");      // pending
  s.finalsRecord.conflicts = [{ providerEventId: "s1" }];                                       // under review
  s.shadowDocs[0].games[2].frozenAt = s.shadowDocs[0].games[2].tipUtc;                           // not pre-tip
  s.shadowDocs[0].games[3].official.pHome = 0.123;                                              // not the official value
  s.officialGames = s.officialGames.filter((g) => g.providerEventId !== "s4");                  // no official
  const l = challengerLedger(s);
  assert.deepEqual(l.counts, { exploratory: 0, pendingFinal: 1, finalUnderReview: 1, noOfficial: 1, shadowNotPreTip: 1, officialMismatch: 1 });
  assert.deepEqual(l.rows.map((r) => r.providerEventId), ["s5"]);
});

test("ledger: the SINGLE look at n ≥ 300 freezes the verdict; later builds carry it unchanged", () => {
  const s = season(300, { edge: 0.1 });
  const first = challengerLedger(s);
  assert.equal(first.verdict.lookAtN, 300);
  assert.equal(first.verdict.rowIds.length, 300);
  assert.equal(first.verdict.result.primary.challenger, INSEASON_CHALLENGER_ID);
  assert.equal(first.verdict.result.primary.verdict, "CHALLENGER_BETTER");
  // more games arrive, including ones that would flip the result: the frozen verdict is carried as is
  const more = season(400, { edge: -0.3, seed: 99 });
  const later = challengerLedger({ ...more, previous: first });
  assert.equal(later.n, 400);
  assert.deepEqual(later.verdict, first.verdict);
});

test("the shadow feeds no public surface: nothing under src/app or src/components imports it", () => {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/\.(mjs|js|ts|tsx)$/.test(e.name) && /elo-shadow|elo-ha-walkforward/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
    }
  };
  for (const d of ["src/app", "src/components"]) walk(path.join(process.cwd(), d));
  assert.deepEqual(hits, []);
});
