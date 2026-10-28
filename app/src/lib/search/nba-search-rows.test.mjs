/**
 * SEARCH FINDS THE NBA (overnight 2026-10-28 · W3).
 *
 * The live index had 1,332 rows and not one NBA name — "Celtics", "Lakers" and "Tatum" found nothing. NBA has no team
 * or player pages, so a row must open the dated projections page that names the team or player, and say so.
 *
 * Source-level on committed data (no export needed), plus synthetic lane directories for the edge rules.
 * Run: npx tsx --test src/lib/search/nba-search-rows.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { nbaCommittedSlates, nbaSearchRows } from "./nba-search-rows.mjs";
import { AMENDMENT_A, LANE, LANE_SNAPSHOT_SCHEMA } from "../sports/nba/experimental-public-lane.mjs";

const APP = process.cwd();
const LANE_DIR = path.join(APP, "public", "data", "nba", "experimental-public");
const OPTS = { enabled: LANE.enabled && AMENDMENT_A.enabled, schema: LANE_SNAPSHOT_SCHEMA };
const rows = nbaSearchRows(LANE_DIR, OPTS);
const slates = nbaCommittedSlates(LANE_DIR, OPTS);
const slateDates = new Set(slates.map((s) => s.date));
const byDate = new Map(slates.map((s) => [s.date, s.snap]));

test("committed data: NBA teams and players are indexed — Celtics, Lakers and Tatum are findable", { skip: !OPTS.enabled && "NBA lane switched off" }, () => {
  const teams = rows.filter((r) => r.kind === "team");
  const players = rows.filter((r) => r.kind === "player");
  assert.ok(teams.length >= 25, `only ${teams.length} NBA teams indexed`);
  assert.ok(players.length >= 150, `only ${players.length} NBA players indexed`);
  const find = (q) => rows.filter((r) => [r.label, ...r.terms].join(" ").toLowerCase().includes(q));
  assert.ok(find("celtics").some((r) => r.kind === "team"), "searching Celtics finds the Boston Celtics");
  assert.ok(find("lakers").some((r) => r.kind === "team"), "searching Lakers finds the Los Angeles Lakers");
  const laneHasTatum = slates.some(({ snap }) => snap.games.some((g) => [...(g.players?.away ?? []), ...(g.players?.home ?? [])].some((p) => p.name === "Jayson Tatum")));
  if (laneHasTatum) assert.ok(find("tatum").some((r) => r.kind === "player"), "searching Tatum finds Jayson Tatum");
});

test("every NBA row opens a projections page the export generates, and that slate names the row", { skip: !OPTS.enabled && "NBA lane switched off" }, () => {
  assert.ok(rows.length > 0, "anti-vacuity: rows exist");
  for (const r of rows) {
    const m = /^\/nba\/projections\/(\d{4}-\d{2}-\d{2})\/$/.exec(r.href);
    assert.ok(m, `${r.label} → ${r.href} is not a dated projections page`);
    assert.ok(slateDates.has(m[1]), `${r.label} → ${r.href}: no committed schema-valid slate for that date`);
    const snap = byDate.get(m[1]);
    if (r.kind === "player") {
      const named = snap.games.some((g) => [...(g.players?.away ?? []), ...(g.players?.home ?? [])].some((p) => p.name === r.label));
      assert.ok(named, `${r.label} is indexed to ${r.href}, and that slate does not project him`);
    } else if (r.kind === "team") {
      assert.ok(snap.games.some((g) => g.away?.name === r.label || g.home?.name === r.label), `${r.label} is not on the ${m[1]} slate`);
    }
  }
});

test("the subtitle says where the row goes, because there is no NBA team or player page", { skip: !OPTS.enabled && "NBA lane switched off" }, () => {
  for (const r of rows) {
    assert.match(r.sub, /^NBA · /, `${r.label}: subtitle names the sport`);
    if (r.kind === "team") assert.match(r.sub, /no team page · opens [A-Z][a-z]{2} \d{1,2} projections$/, r.sub);
    if (r.kind === "player") assert.match(r.sub, /opens [A-Z][a-z]{2} \d{1,2} projections$/, r.sub);
  }
});

test("a row is a door: no number, no probability", () => {
  const blob = JSON.stringify(rows);
  assert.doesNotMatch(blob, /\d+(\.\d+)?%/, "no percentage");
  for (const r of rows) assert.deepEqual(Object.keys(r).filter((k) => !["kind", "label", "sub", "href", "terms", "abbr"].includes(k)), [], `unexpected field on ${r.label}`);
});

// ── synthetic lanes ───────────────────────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-search-"));
const game = (away, home, awayPlayers, homePlayers, unavailable = []) => ({
  providerEventId: `${away}${home}`,
  away: { abbr: away, name: `${away} Team` }, home: { abbr: home, name: `${home} Team` },
  players: {
    away: awayPlayers.map(([id, name]) => ({ providerAthleteId: id, name, medians: { pts: 20 } })),
    home: homePlayers.map(([id, name]) => ({ providerAthleteId: id, name, medians: { pts: 10 } })),
    unavailable: { away: unavailable.map(([id, name]) => ({ providerAthleteId: id, name, state: "PROJECTION_UNAVAILABLE" })), home: [] },
  },
});
const write = (file, body) => fs.writeFileSync(path.join(tmp, file), JSON.stringify(body));
write("2026-10-20.json", { schema: "S", date: "2026-10-20", games: [game("AAA", "BBB", [["1", "Old Name"], ["2", "Only Old"]], [["3", "Bee One"]])] });
write("2026-10-21.json", { schema: "S", date: "2026-10-21", games: [game("AAA", "CCC", [["1", "New Name"]], [["4", "Cee One"]], [["9", "Hurt Player"]])] });
write("2026-10-22.json", { schema: "OTHER", date: "2026-10-22", games: [game("DDD", "EEE", [["5", "Wrong Schema"]], [])] });
write("2026-10-23.json", { schema: "S", date: "2026-10-24", games: [game("FFF", "GGG", [["6", "Wrong Date"]], [])] });
write("latest.json", { schema: "S", date: "2026-10-21", games: [game("HHH", "III", [["7", "Latest Only"]], [])] });
write("2026-10-25.json", "{not json");
const synth = nbaSearchRows(tmp, { enabled: true, schema: "S" });
const labels = (kind) => synth.filter((r) => r.kind === kind).map((r) => r.label).sort();

test("only committed, schema-valid, self-dated slates count — never latest.json, a wrong schema or a misnamed file", () => {
  assert.deepEqual(nbaCommittedSlates(tmp, { enabled: true, schema: "S" }).map((s) => s.date), ["2026-10-20", "2026-10-21"]);
  for (const bad of ["Wrong Schema", "Wrong Date", "Latest Only"]) assert.ok(!labels("player").includes(bad), `${bad} must not be indexed`);
});

test("the newest slate wins for a player and a team; older-only names keep their own slate", () => {
  const p1 = synth.filter((r) => r.kind === "player" && (r.label === "New Name" || r.label === "Old Name"));
  assert.deepEqual(p1.map((r) => [r.label, r.href]), [["New Name", "/nba/projections/2026-10-21/"]], "one row per athlete id, from the newest slate");
  assert.equal(synth.find((r) => r.label === "Only Old")?.href, "/nba/projections/2026-10-20/");
  assert.equal(synth.find((r) => r.kind === "team" && r.label === "AAA Team")?.href, "/nba/projections/2026-10-21/");
  assert.equal(synth.find((r) => r.kind === "team" && r.label === "BBB Team")?.href, "/nba/projections/2026-10-20/");
});

test("an unavailable (not projected) player is never indexed; games come from the newest slate only", () => {
  assert.ok(!labels("player").includes("Hurt Player"));
  assert.deepEqual(labels("event"), ["AAA Team @ CCC Team"]);
});

test("the lane switch off means no NBA rows at all", () => {
  assert.deepEqual(nbaSearchRows(tmp, { enabled: false, schema: "S" }), []);
});

test("the generator adds these rows and reads the lane switch, not a second copy of the rule", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/build-search-index.mjs"), "utf8");
  assert.match(src, /nbaSearchRows\(path\.join\(DATA, "nba", "experimental-public"\)/);
  assert.match(src, /enabled: LANE\.enabled && AMENDMENT_A\.enabled, schema: LANE_SNAPSHOT_SCHEMA/);
  /* The page owner's rule, restated here only as far as the test needs it: the same schema constant and self-dated files. */
  const owner = fs.readFileSync(path.join(APP, "src/components/nba/experimental-lane.tsx"), "utf8");
  assert.match(owner, /s\?\.schema === LANE_SNAPSHOT_SCHEMA && s\.date === date && Array\.isArray\(s\.games\)/, "the page owner's dated-file rule is the one mirrored");
});
