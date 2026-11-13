/**
 * CONS-DAYVIEW (2026-11-09): Today's NBA rows and the homepage's NBA lane say the SAME thing about every game's official
 * win chance — the identical text from the one accessor (PR 1219, via elo-win-chance-read.mjs), or the same withheld
 * reason. Checked on COMMITTED data for every NBA game of the newest committed slates, with the switch on and off.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { committedLaneDates, loadLaneForDate } = await import("../components/nba/experimental-lane.tsx");
const { buildGamesTableRows } = await import("../components/games-experience-table-rows.ts");
const { nbaLane } = await import("./command-center/nba-lane.ts");
const { nbaTodaySlate } = await import("./sport-hub/nba-hub.ts");
const { eloWinChanceRead, ELO_WIN_CHANCE_WITHHELD } = await import("./sports/nba/elo-win-chance-read.mjs");
const { ELO_WIN_PROBABILITY } = await import("./sports/nba/elo-win-probability.mjs");

const DATES = committedLaneDates().slice(-3);

/** Home's lane as page.tsx builds it, for the slate on `date` (noon ET), with every game listed. */
function homeRows(date, lane, enabled) {
  const now = `${date}T17:00:00Z`;
  const slate = nbaTodaySlate(now, lane, { laneEnabled: true });
  const big = { ...slate, games: slate.games }; // the lane lists the first rows; read every game through the same builder
  const rows = [];
  for (let i = 0; i < big.games.length; i += 3) {
    const part = nbaLane({ ...big, games: big.games.slice(i, i + 3) }, now, {
      winChanceOf: (id) => { const r = eloWinChanceRead(lane.games.find((g) => String(g.providerEventId) === id) ?? null, { enabled }); return r.shown ? { text: r.text, attr: r.attr } : { withheld: r.reason }; },
    });
    rows.push(...part.games);
  }
  return rows;
}

for (const enabled of [ELO_WIN_PROBABILITY.enabled, false]) {
  test(`every NBA game on the newest committed slates: Today and Home agree on the win chance (switch ${enabled ? "ON" : "OFF"})`, () => {
    assert.ok(DATES.length > 0, "committed lanes exist");
    let compared = 0, newestCompared = 0;
    const newest = DATES.at(-1);
    // The NBA schedule file holds rows from its capture day forward. On a no-game ET day (first: 2026-11-26), or when a
    // lane publishes late, the newest lane's date is BEHIND that window and Today lists none of its games. That is a
    // roll-off, not a disagreement: it is recognised only when NOT ONE game of the date is listed (a partly listed
    // slate still fails below), and it is then proven from the schedule's own rows at the end of the test.
    const nbaRowsAtNewest = buildGamesTableRows(newest, { eloEnabled: enabled }).filter((r) => r.sport === "nba");
    const newestRolledOff = !nbaRowsAtNewest.some((r) => r.date === newest);
    for (const date of DATES) {
      const lane = loadLaneForDate(date);
      if (!lane?.games?.length) continue;
      const today = buildGamesTableRows(date, { eloEnabled: enabled }).filter((r) => r.sport === "nba" && r.date === date);
      const home = homeRows(date, lane, enabled);
      for (const g of lane.games.filter((x) => x.elo?.favoured)) {
        const id = String(g.providerEventId);
        const want = eloWinChanceRead(g, { enabled });
        const t = today.find((r) => r.id.endsWith(id));
        const h = home.find((r) => String(r.id) === id);
        if (!t && (date !== newest || newestRolledOff)) continue; // a past date's game can roll off Today's schedule window; every game Today DOES list is compared
        assert.ok(t, `${date} ${id}: Today lists every game of the newest committed slate`);
        // Today prints the accessor's own sentence (WEB-03, live since #1295) or the favoured side + the one reason
        assert.equal(t.read, want.shown ? want.fullText : `${g.elo.favoured} favoured · ${want.reason}`, `${date} ${id}: Today's read`);
        if (want.shown) assert.ok(t.read.endsWith(want.text), `${date} ${id}: Today and Home print the identical numbers`);
        if (h && !/^Final/.test(h.note)) {
          if (want.shown) {
            assert.equal(h.winChance?.text, want.text, `${date} ${id}: Home prints the identical number`);
          } else {
            assert.equal(h.winChance ?? null, null, `${date} ${id}: Home prints no number`);
            assert.ok(h.note.endsWith(ELO_WIN_CHANCE_WITHHELD), `${date} ${id}: Home gives the same withheld reason`);
          }
        }
        if (!enabled) assert.equal(want.shown, false, "switch off → withheld everywhere");
        compared += 1;
        if (date === newest) newestCompared += 1;
      }
    }
    // Positive control (2026-11-12): `compared > 5` assumed yesterday's games were still on Today, which the midday NBA
    // schedule capture drops (ca566d082f), leaving a 4-game slate at 4. The control is now the whole newest slate: every
    // favoured game of it must be listed and compared (above), and there must be at least one.
    const newestLane = loadLaneForDate(newest);
    if (newestRolledOff) {
      // No game of the newest lane is on Today: every NBA row the schedule still holds must be for a LATER date. A row
      // at or before `newest` would mean the window still covers it and its games are missing — that stays a failure.
      assert.ok(nbaRowsAtNewest.every((r) => r.date > newest), `${newest} is not listed on Today, yet the schedule still holds NBA rows at or before it`);
    } else {
      assert.ok(newestCompared > 0 && newestCompared === (newestLane?.games ?? []).filter((x) => x.elo?.favoured).length, `compared ${compared} games (${newestCompared} on ${newest})`);
    }
  });
}

test("no surface prints the old fixed wording or derives its own number", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/components/games-experience-table-rows.ts", "utf8");
  assert.doesNotMatch(src, /no win chance published/);
  assert.doesNotMatch(src, /eloWinProbabilityOf\(|eloWinProbabilityText\(|winProbability\.home/, "Today reads only through the one read");
  assert.match(src, /export function nbaTodayRead\([^)]*\)[^{]*\{\n\s+const r = eloWinChanceRead\(/, "WEB-03's nbaTodayRead IS the one read (no second implementation)");
  assert.match(fs.readFileSync("src/app/page.tsx", "utf8"), /eloWinChanceRead\(/);
  assert.doesNotMatch(fs.readFileSync("src/app/page.tsx", "utf8"), /eloWinProbabilityOf\(/, "Home reads only through the one read");
});

test("Today prints the Elo accuracy disclosure once when an NBA row shows the number (the rule Home follows), and never without one", async () => {
  const React = (await import("react")).default; globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: TodayGames } = await import("../components/today/today-games.tsx");
  const date = DATES.at(-1);
  const rows = buildGamesTableRows(date).filter((r) => r.date === date);
  const shows = rows.some((r) => r.sport === "nba" && /\d%/.test(r.read ?? ""));
  const h = renderToStaticMarkup(React.createElement(TodayGames, { rows, dayLabel: date, asOf: "x", eloDisclosure: "DISCLOSURE." }));
  assert.equal((h.match(/data-nba-elo-wp-disclosure/g) ?? []).length, shows ? 1 : 0);
  const offRows = buildGamesTableRows(date, { eloEnabled: false }).filter((r) => r.date === date);
  assert.ok(offRows.filter((r) => r.sport === "nba").every((r) => !/\d%/.test(r.read ?? "")), "switch off → no NBA percentage on Today");
  assert.match(read("src/app/today/page.tsx"), /eloDisclosure=\{/);
});
import { readFileSync } from "node:fs";
const read = (rel) => readFileSync(rel, "utf8");
