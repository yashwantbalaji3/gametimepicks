/**
 * Level A · NFL (founder decision 2026-11-10, Parlay Lab V3 decision 1). SYNTHETIC fixtures: no real forecast, no price.
 *   npx tsx --test src/lib/products/level-a/level-a-nfl.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nflSelectionsFrom } from "./nfl-source.mjs";
import { levelASuggestions, levelALeg, tierForJoint, fairAmerican, PARLAY_LAB_ONLY_SPORTS } from "./suggestions.mjs";
import { levelAMixed } from "./mixed.mjs";
import { recordEntries, appendRecord } from "./record.mjs";
import { gradeLevelALeg } from "./grade.mjs";
import { indexDepthCharts } from "../../sports/nfl/depth-chart.mjs";
import { nflWinPct, nflWinChanceText, NFL_FORECAST_LABEL } from "../../sports/nfl/win-chance-text.mjs";
import { PARLAY_ODDS_BANDS } from "../../parlays/risk-odds-bands.mjs";
import { SOURCES } from "../../sports/nfl/forecast-view.mjs";

const NOW = "2026-11-15T12:00:00Z"; const DAY = "2026-11-15";
const KO = (h) => `2026-11-15T${h}:00Z`;
const teams = [["BUF", "2"], ["NYJ", "20"], ["KC", "12"], ["ATL", "1"], ["MIN", "16"], ["GB", "9"], ["SEA", "26"], ["LV", "13"]];
const game = (i, ko) => ({ providerEventId: String(900 + i), dateUtc: ko, statusRaw: "STATUS_SCHEDULED", away: { abbr: teams[2 * i][0], providerTeamId: teams[2 * i][1] }, home: { abbr: teams[2 * i + 1][0], providerTeamId: teams[2 * i + 1][1] } });
const schedule = { generatedAt: "2026-11-15T09:00:00Z", rows: [game(0, KO(18)), game(1, KO(18)), game(2, KO(18)), game(3, KO(21))] };
const forecast = (row, side, pHome, state = "NO_STARTING_QB_ABSENCE") => ({ providerEventId: row.providerEventId, kickoffUtc: row.dateUtc, generatedAt: "2026-11-15T08:00:00Z",
  model: { id: "nfl-regular-season-public-v1", version: 2, inputHash: "abc" }, sideDecision: { publishedSide: side },
  forecastSummary: { winProbability: { home: pHome, away: Math.round((1 - pHome - 0.004) * 1e4) / 1e4, tieMass: 0.004 } }, teamInputs: { state } });
const F = { "900": forecast(schedule.rows[0], "AWAY", 0.2), "901": forecast(schedule.rows[1], "AWAY", 0.36), "902": forecast(schedule.rows[2], "HOME", 0.62), "903": forecast(schedule.rows[3], "AWAY", 0.24) };
const offOf = (over = {}) => (id) => (id in over ? over[id] : F[id] ? { basis: "LIVE", forecast: F[id], snapshot: { snapshotId: `snap-${id}` } } : null);
const qb = (team, i) => ({ timestamp: "2026-11-14T13:00:00Z", team, quarterbacks: [{ playerId: String(5000 + i), name: `QB ${team}`, rank: 1 }] });
const depthIndex = indexDepthCharts({ snapshots: teams.map(([t], i) => qb(t, i)) });
const injuries = (entries = []) => ({ generatedAt: "2026-11-15T10:00:00Z", entries });
const roster = { generatedAt: "2026-11-15T10:00:00Z", teams: teams.map(([, id], i) => ({ providerTeamId: id, players: [{ id: String(5000 + i), status: { type: "active" } }] })) };
const sels = (o = {}) => nflSelectionsFrom({ schedule, offOf: offOf(o.off), depthIndex: o.depthIndex ?? depthIndex, injuries: o.injuries ?? injuries(), roster, now: NOW, productDay: DAY });

test("parity: an NFL leg's team, side and probability equal the official forecast, and its text is the game page's", () => {
  const ans = levelASuggestions({ selections: sels(), now: NOW, productDay: DAY });
  assert.equal(ans.legs.length, 4);
  for (const l of ans.legs) {
    const f = F[l.eventId]; const side = f.sideDecision.publishedSide.toLowerCase();
    assert.equal(l.selection.code, side);
    assert.equal(l.probability, f.forecastSummary.winProbability[side], "the same number, copied");
    assert.equal(l.label, NFL_FORECAST_LABEL); assert.equal(l.label, SOURCES.record.label);
    assert.equal(l.shownPct, nflWinPct(l.probability)); assert.equal(nflWinChanceText(l.probability), `${l.shownPct} to win`);
    assert.equal(l.forecast.snapshotId, `snap-${l.eventId}`); assert.equal(l.forecast.modelId, "nfl-regular-season-public-v1@v2");
  }
  /* the game page prints through the same formatter */
  const hero = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../components/nfl/forecast/game-hero.tsx"), "utf8");
  assert.match(hero, /nflWinChanceText\(r\.winProbability\.away\)/); assert.match(hero, /nflWinChanceText\(r\.winProbability\.home\)/);
});

test("excluded: QB-blind forecast, an expected starting QB listed Out, a stale depth chart, a moved kickoff, a missing forecast", () => {
  const reasons = (s, id) => levelALeg(s.find((x) => x.eventId === id), { now: NOW, productDay: DAY }).refusal?.reasons ?? [];
  const blind = sels({ off: { "900": { basis: "LIVE", forecast: { ...F["900"], teamInputs: { state: "BLIND_TO_STARTING_QB_ABSENCE" } }, snapshot: null } } });
  assert.ok(reasons(blind, "900").includes("QB_BLIND"));
  const out = sels({ injuries: injuries([{ athleteId: "5000", status: "Out", statedAt: "2026-11-14T20:00Z" }]) });
  assert.ok(reasons(out, "900").includes("QB_UNVERIFIED"), "BUF's QB1 is Out");
  assert.deepEqual(reasons(out, "901"), []);
  const stale = sels({ depthIndex: indexDepthCharts({ snapshots: teams.map(([t], i) => ({ ...qb(t, i), timestamp: "2026-11-01T13:00:00Z" })) }) });
  assert.ok(stale.every((s) => s.gateRefusals.includes("QB_UNVERIFIED")));
  const moved = sels({ off: { "902": { basis: "LIVE", forecast: { ...F["902"], kickoffUtc: KO(20) }, snapshot: null } } });
  assert.ok(reasons(moved, "902").includes("KICKOFF_UNVERIFIED"));
  assert.ok(reasons(sels({ off: { "903": null } }), "903").includes("FORECAST_MISSING"));
  /* excluded games show as unavailable research with a short reason, never as a leg */
  const ans = levelASuggestions({ selections: out, now: NOW, productDay: DAY });
  assert.ok(!ans.legs.some((l) => l.eventId === "900"));
  assert.ok(ans.refused.find((r) => r.eventId === "900").text.some((t) => /starting quarterback/.test(t)));
  /* no player name is printed for a dropped game */
  assert.ok(!JSON.stringify(ans.refused).includes("QB BUF"));
});

test("a same-game pair is never multiplied; one leg per game", () => {
  const dup = [...sels(), { ...sels()[0], selection: { code: "home", label: "NYJ to win" }, probability: 0.8 }];
  const ans = levelASuggestions({ selections: dup, now: NOW, productDay: DAY });
  assert.equal(ans.legs.filter((l) => l.eventId === "900").length, 1);
  for (const t of ans.parlayLab) if (t.card) assert.equal(new Set(t.card.legs.map((l) => l.eventId)).size, t.card.legs.length);
});

test("tier edges are the published price bands converted to implied probability (no new constant)", () => {
  const implied = (am) => (am < 0 ? -am / (-am + 100) : 100 / (am + 100));
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.low.maxAmerican)), "low");
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.low.minAmerican)), "low");
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.medium.maxAmerican)), "medium");
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.high.maxAmerican)), "high");
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.high.maxAmerican) - 0.001), "longshot");
  assert.equal(tierForJoint(implied(PARLAY_ODDS_BANDS.low.minAmerican) + 0.01), null, "above Low's top edge is no tier");
  assert.equal(fairAmerican(0.5), -100);
});

test("NFL is Parlay-Lab only: never in a Bank Builder or Moonshot suggestion (founder decision 2026-11-10)", () => {
  assert.deepEqual(PARLAY_LAB_ONLY_SPORTS, ["nfl"]);
  const ans = levelASuggestions({ selections: sels(), now: NOW, productDay: DAY });
  assert.equal(ans.bankBuilder.card, null); assert.equal(ans.moonshot.card, null);
  assert.ok(ans.parlayLab.some((t) => t.card && t.card.legs.every((l) => l.sport === "nfl")));
  const mixed = levelAMixed({ crossSportLegs: ans.legs, nbaLegs: [], enabled: true });
  for (const c of [mixed.bankBuilder.card, mixed.moonshot.card]) assert.ok(!c || c.legs.every((l) => l.sport !== "nfl"));
});

test("the frozen card: recorded with forecast versions, selection time and eligibility; after kickoff nothing new is recorded and the entry is unchanged", () => {
  const ans = levelASuggestions({ selections: sels(), now: NOW, productDay: DAY });
  const before = recordEntries(ans, { recordedAt: NOW, shownAt: NOW });
  const nfl = before.filter((e) => e.legs?.some((l) => l.sport === "nfl"));
  assert.ok(nfl.length > 0);
  const frozen = JSON.stringify(nfl);
  for (const e of nfl) for (const l of e.legs) {
    assert.ok(l.forecast?.snapshotId && l.forecast?.modelId && l.forecast?.stampedAt, "forecast version recorded");
    assert.equal(l.eligibility?.contractVersion, "eligibility@1");
    assert.ok(l.eligibility.quarterbacks.every((q) => q.ok));
  }
  const after = levelASuggestions({ selections: sels(), now: "2026-11-15T22:00:00Z", productDay: DAY });
  assert.ok(after.legs.every((l) => Date.parse(l.startUtc) > Date.parse("2026-11-15T22:00:00Z")), "a started game is never a leg");
  assert.equal(JSON.stringify(nfl), frozen, "the recorded entries are not edited by a later build");
  const late = recordEntries(levelASuggestions({ selections: sels(), now: "2026-11-15T17:45:00Z", productDay: DAY }), { recordedAt: "2026-11-15T18:05:00Z", shownAt: "2026-11-15T18:05:00Z" });
  assert.equal(appendRecord(before, late.filter((e) => e.legs.some((l) => l.startUtc === KO(18)))).length, 0, "nothing shown at or after its first kickoff is recorded");
  /* outcome: graded later through the NFL settlement contract; a tie pushes (void), no final is pending */
  const leg = nfl[0].legs[0];
  const g = (r) => gradeLevelALeg(leg, { nfl: () => r }).result;
  assert.equal(g(null), "pending");
  assert.equal(g({ status: "STATUS_FINAL", homePointsFT: 20, awayPointsFT: 20 }), "void");
  assert.ok(["win", "loss"].includes(g({ status: "STATUS_FINAL", homePointsFT: 27, awayPointsFT: 10 })));
});

test("vocabulary and no-price leak: NFL legs carry no price, odds or payout, and no pick vocabulary", () => {
  const ans = levelASuggestions({ selections: sels(), now: NOW, productDay: DAY });
  const text = JSON.stringify({ legs: ans.legs, refused: ans.refused, parlayLab: ans.parlayLab });
  for (const l of ans.legs) { assert.equal(l.price, null); assert.equal(l.priced, false); }
  assert.ok(!/"(american|odds|book|payout|line)":/i.test(text.replace(/"payout":null/g, "")), "no price field");
  for (const w of [/\brecommended\b/i, /\bedge\b/i, /\block\b/i, /\bconfiden(t|ce)\b/i, /\bguarantee/i, /\bbest bet\b/i]) assert.ok(!w.test(text), String(w));
});
