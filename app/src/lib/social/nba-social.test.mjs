/* NBA social data contract gtp-social-nba@1 (launch program 2026-10-28): built only from the published lane + record,
   through the pages' own accessors — never a second forecast. Committed data + controls. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildNbaSocialDay, nbaSocialSlateState, nbaSocialToday, NBA_SOCIAL_SCHEMA, NBA_SOCIAL_SLATE_STATES, NBA_SOCIAL_TODAY_STATUSES, PLAYER_FAMILIES } from "./nba-social.mjs";
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

/* ADDITIVE FIELDS (Batch 1 fix #9, 2026-10-29): isLatest, slateState, today — schemaVersion unchanged. */
const KEYS_V1 = ["schemaVersion", "date", "publication", "builtForEtDate", "stale", "contract", "playerFamilies", "events", "record", "usageRules"];

test("additive only: every existing key keeps its place and value; the new keys are appended after them", () => {
  const d = buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-29", latestDate: "2026-10-28", laneSha256: "x" });
  assert.equal(d.schemaVersion, "gtp-social-nba@1");
  assert.deepEqual(Object.keys(d), [...KEYS_V1, "isLatest", "slateState"]);
  // the existing fields' bytes do not depend on the new input
  const strip = (o) => { const c = { ...o }; delete c.isLatest; delete c.slateState; return JSON.stringify(c); };
  assert.equal(strip(d), strip(buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-29", laneSha256: "x" })));
  assert.equal(d.stale, true, "an archived day keeps stale: true, unchanged");
});

test("isLatest: true only on the newest shipped date; an archived day is false, never a broken today", () => {
  assert.equal(buildNbaSocialDay({ lane, buildEtDate: "2026-10-29", latestDate: "2026-10-27" }).isLatest, true);
  assert.equal(buildNbaSocialDay({ lane, buildEtDate: "2026-10-29", latestDate: "2026-10-28" }).isLatest, false);
  assert.equal(buildNbaSocialDay({ lane, buildEtDate: "2026-10-29" }).isLatest, false, "no latest date given → false");
  assert.equal(buildNbaSocialDay({ lane: null, buildEtDate: "2026-10-29", latestDate: "2026-10-29" }).isLatest, false);
});

test("slateState comes from the file's own finals and the build's ET date — no clock", () => {
  const ev = (final) => ({ result: { state: final ? "MATCHED" : "PENDING", final: final ? { away: 1, home: 2, winnerSide: "home" } : null } });
  assert.equal(nbaSocialSlateState([], "2026-10-27", "2026-10-27"), null, "no games → null");
  assert.equal(nbaSocialSlateState([ev(true), ev(true)], "2026-10-27", "2026-10-28"), "SETTLED");
  assert.equal(nbaSocialSlateState([ev(true), ev(false)], "2026-10-27", "2026-10-27"), "IN_PROGRESS");
  assert.equal(nbaSocialSlateState([ev(false)], "2026-10-27", "2026-10-28"), "IN_PROGRESS", "a past slate without finals is played, not upcoming");
  assert.equal(nbaSocialSlateState([ev(false)], "2026-10-27", "2026-10-27"), "UPCOMING");
  assert.equal(nbaSocialSlateState([ev(false)], "2026-10-28", "2026-10-27"), "UPCOMING");
  // through the builder: the record's finals decide (a HELD final still has `final`)
  const all = lane.games.map((g) => ({ providerEventId: g.providerEventId, state: "HELD", final: { away: 100, home: 101, winnerSide: "home" } }));
  assert.equal(buildNbaSocialDay({ lane, recordGames: all, buildEtDate: "2026-10-28" }).slateState, "SETTLED");
  assert.equal(buildNbaSocialDay({ lane, recordGames: rec, buildEtDate: "2026-10-28" }).slateState, "IN_PROGRESS");
  assert.equal(buildNbaSocialDay({ lane, buildEtDate: "2026-10-27" }).slateState, "UPCOMING");
  assert.equal(buildNbaSocialDay({ lane: { date: "2026-10-28", games: [] }, buildEtDate: "2026-10-28" }).slateState, null, "NO_GAMES day");
  for (const s of ["SETTLED", "IN_PROGRESS", "UPCOMING"]) assert.ok(NBA_SOCIAL_SLATE_STATES.includes(s));
});

test("today: the build's ET date and the /nba hub's own state, mapped one-to-one", () => {
  assert.deepEqual(nbaSocialToday("2026-10-29", "PUBLISHED"), { etDate: "2026-10-29", status: "PUBLISHED" });
  assert.deepEqual(nbaSocialToday("2026-10-29", "PENDING"), { etDate: "2026-10-29", status: "NOT_YET_PUBLISHED" });
  assert.deepEqual(nbaSocialToday("2026-10-29", "NO_GAMES"), { etDate: "2026-10-29", status: "NO_GAMES" });
  assert.deepEqual(nbaSocialToday("2026-10-29", "DISABLED"), { etDate: "2026-10-29", status: "DISABLED" });
  assert.throws(() => nbaSocialToday("2026-10-29", "LIVE"), /unknown hub state/);
  assert.deepEqual([...NBA_SOCIAL_TODAY_STATUSES], ["PUBLISHED", "NOT_YET_PUBLISHED", "NO_GAMES", "DISABLED"]);
});
