/**
 * THE v3 TOTALS HEAD IS THE MODEL THAT WAS SCORED, NOT A LOOKALIKE (P295).
 *
 * The historical replay scored v3 once, on 5,878 held-out games, with a research script that lives
 * outside the app. Production folds through totals-play-efficiency.mjs instead. Two implementations of
 * one recurrence drift apart silently — a seed rule, a same-day ordering, a franchise map — and the
 * published number stops being the evaluated one while every receipt still says ELIGIBLE.
 *
 * So the proof runs the PRODUCTION fold over the committed tables and requires it to reproduce the
 * receipt's own held-out figures, season by season. If this passes, the website runs what was tested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  foldTotalsV3, totalsV3Gate, totalsV3Coverage, gamesFromTable, etDateOf, toNflverseAbbr,
  TOTALS_REPLAY_RECEIPT, TOTALS_REPLAY_PREREG, GAMES_HISTORY, EFFICIENCY_HISTORY, NFL_TOTALS_V3_HEAD_ID,
} from "./totals-play-efficiency.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const receipt = read(TOTALS_REPLAY_RECEIPT);
const prereg = read(TOTALS_REPLAY_PREREG);
const games = gamesFromTable(read(GAMES_HISTORY));
const efficiency = read(EFFICIENCY_HISTORY).rows;

test("THE PARITY PROOF: the production fold reproduces the replay receipt on every held-out season", () => {
  const gate = totalsV3Gate(receipt, prereg);
  assert.equal(gate.state, "READY", gate.reason);
  const [first, last] = prereg.frozen.seasons.heldOut;
  const per = new Map();
  foldTotalsV3({
    games, efficiencyRows: efficiency, frozen: gate.frozen, fit: gate.fit,
    onDay: (day, predict) => {
      for (const g of day) {
        if (g.season < first || g.season > last) continue;
        const mu = predict(g.home, g.away);
        const o = per.get(g.season) ?? { n: 0, mu: 0, ae: 0 };
        o.n += 1;
        o.mu += mu;
        o.ae += Math.abs(g.total - mu);
        per.set(g.season, o);
      }
    },
  });

  let n = 0;
  for (let s = first; s <= last; s += 1) {
    const want = receipt.results.v3PlayEfficiency.seasons[s];
    const got = per.get(s);
    assert.ok(want && got, `${s}: the receipt or the fold has no predictions for this season`);
    assert.equal(got.n, want.n, `${s}: game count`);
    assert.ok(Math.abs(got.mu / got.n - want.meanPredicted) < 1e-4, `${s}: mean predicted ${got.mu / got.n} vs receipt ${want.meanPredicted}`);
    assert.ok(Math.abs(got.ae / got.n - want.mae) < 1e-4, `${s}: MAE ${got.ae / got.n} vs receipt ${want.mae}`);
    n += got.n;
  }
  assert.equal(n, receipt.population.heldOutGames, "every held-out game was predicted");
});

test("the gate refuses anything but the receipt's own ELIGIBLE verdict with complete parameters", () => {
  assert.equal(totalsV3Gate(receipt, prereg).state, "READY");
  assert.equal(totalsV3Gate(null, prereg).state, "REFUSED");
  assert.equal(totalsV3Gate({ ...receipt, verdicts: { ...receipt.verdicts, v3PlayEfficiency: "REJECTED" } }, prereg).state, "REFUSED");
  assert.equal(totalsV3Gate({ ...receipt, devFits: { ...receipt.devFits, v3PlayEfficiency: { ...receipt.devFits.v3PlayEfficiency, cE: null } } }, prereg).state, "REFUSED");
  assert.equal(totalsV3Gate(receipt, { frozen: { ...prereg.frozen, franchiseMap: undefined } }).state, "REFUSED");
  /* v2 was REJECTED by the same receipt; nothing here may reach for it. */
  assert.equal(receipt.verdicts.v2LeagueRelative, "REJECTED");
});

test("strictly pre-game: a result on the target date never moves that date's prediction", () => {
  const gate = totalsV3Gate(receipt, prereg);
  const recent = games.filter((g) => g.season >= 2024);
  /* A Sunday: the probe needs other games on the same date whose results could leak in. */
  const target = recent.find((g) => g.season === 2025 && g.date > "2025-10-01" && recent.filter((x) => x.date === g.date).length >= 3);
  const tampered = recent.map((g) => (g.date === target.date ? { ...g, total: g.total + 40 } : g));
  const a = foldTotalsV3({ games: recent, efficiencyRows: efficiency, frozen: gate.frozen, fit: gate.fit, beforeDate: target.date });
  const b = foldTotalsV3({ games: tampered, efficiencyRows: efficiency, frozen: gate.frozen, fit: gate.fit, beforeDate: target.date });
  assert.equal(a.muFor(target.home, target.away), b.muFor(target.home, target.away));
  assert.equal(a.head, NFL_TOTALS_V3_HEAD_ID);
  /* …and the previous date's results DO move it, so the probe above is not vacuous. */
  const prior = recent.filter((g) => g.date < target.date).at(-1);
  const moved = recent.map((g) => (g.date === prior.date ? { ...g, total: g.total + 40 } : g));
  const c = foldTotalsV3({ games: moved, efficiencyRows: efficiency, frozen: gate.frozen, fit: gate.fit, beforeDate: target.date });
  assert.notEqual(a.muFor(target.home, target.away), c.muFor(target.home, target.away));
});

test("game days are Eastern: a Sunday-night kickoff belongs to Sunday, not to Monday in UTC", () => {
  assert.equal(etDateOf("2026-09-14T00:20Z"), "2026-09-13");
  assert.equal(etDateOf("2026-09-13T17:00Z"), "2026-09-13");
  assert.equal(etDateOf("2026-12-26T01:15Z"), "2026-12-25");
});

test("every ESPN schedule abbreviation reaches a rated franchise — none silently takes the league average", () => {
  /* ESPN writes WSH and LAR; nflverse writes WAS and LA. Unmapped, both teams would find no rating and
     every forecast involving them would quietly use league means — the P170-B join failure. */
  assert.equal(toNflverseAbbr("WSH"), "WAS");
  assert.equal(toNflverseAbbr("LAR"), "LA");
  assert.equal(toNflverseAbbr("KC"), "KC");
  const gate = totalsV3Gate(receipt, prereg);
  const state = foldTotalsV3({ games, efficiencyRows: efficiency, frozen: gate.frozen, fit: gate.fit });
  assert.equal(state.hasTeam("WSH"), false, "the raw ESPN code is NOT a rated team — which is why the map exists");
  const schedule = read("app/public/data/nfl/schedule/latest.json");
  const espn = new Set(schedule.rows.flatMap((r) => [r.home?.abbr, r.away?.abbr]).filter(Boolean));
  assert.ok(espn.size >= 28, `the schedule carries the league (${espn.size} teams)`);
  for (const a of espn) assert.ok(state.hasTeam(toNflverseAbbr(a)), `${a} → ${toNflverseAbbr(a)} has no rating history`);
});

test("the committed tables carry only current franchise codes — one rating stream per franchise", () => {
  /* The mutation probe showed the fold's own franchise map is a no-op on these tables (they were mapped
     when built), so a table written without the map would pass the parity proof and still split the
     Rams across STL and LA. The property that matters is the codes in the tables; guard that. */
  const relocated = new Set(Object.keys(prereg.frozen.franchiseMap));
  for (const g of games) assert.ok(!relocated.has(g.home) && !relocated.has(g.away), `${g.gameId}: pre-relocation code in the games table`);
  for (const r of efficiency) assert.ok(!relocated.has(r.team), `${r.gameId}: pre-relocation code ${r.team} in the efficiency table`);
  assert.ok(games.some((g) => g.season === 2010 && (g.home === "LA" || g.away === "LA")), "the map was applied: 2010 Rams games read LA");
});

test("coverage names every official final the fold is missing — a result or its play data", () => {
  const frozen = prereg.frozen;
  const g = [
    { gameId: "2026_01_A_B", espnId: "1", season: 2026, date: "2026-09-10", home: "B", away: "A", total: 40 },
    { gameId: "2026_01_C_D", espnId: "2", season: 2026, date: "2026-09-13", home: "D", away: "C", total: 50 },
  ];
  const eff = [{ gameId: "2026_01_A_B", team: "A" }, { gameId: "2026_01_A_B", team: "B" }, { gameId: "2026_01_C_D", team: "D" }];
  const finals = [
    { providerEventId: "1", dateUtc: "2026-09-11T00:20Z" },
    { providerEventId: "2", dateUtc: "2026-09-13T17:00Z" },
    { providerEventId: "3", dateUtc: "2026-09-13T20:25Z" },
  ];
  const before13 = totalsV3Coverage({ games: g, efficiencyRows: eff, officialFinals: finals, beforeDate: "2026-09-13", frozen });
  assert.equal(before13.complete, true, "only Thursday is due before Sunday");
  const before14 = totalsV3Coverage({ games: g, efficiencyRows: eff, officialFinals: finals, beforeDate: "2026-09-14", frozen });
  assert.deepEqual(before14.missingGames, ["3"], "a Sunday final nflverse has not published yet");
  assert.deepEqual(before14.missingEfficiency, ["2026_01_C_D"], "a final whose away side has no play data");
  assert.equal(before14.complete, false);
});
