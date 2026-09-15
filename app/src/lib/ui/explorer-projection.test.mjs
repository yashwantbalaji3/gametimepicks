/**
 * EXPLORER PROJECTION (Phase 5F/5O). The explorer and its cards receive a compact projection of the lean rows:
 * recentGames packed as tuples and official MLB headshots carried as a StatsAPI person id. Both must be lossless —
 * the card decodes exactly what the full row carried — and every page that feeds the explorer must go through the
 * one projection (a full row is structurally assignable, but its `recentGames` would silently render "no log").
 *
 * Run: npx tsx --test src/lib/ui/explorer-projection.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { toExplorerProjection, decodeRecentGames, explorerPhoto, EXPLORER_FIELDS } from "./explorer-projection.ts";
import { mlbHeadshotUrl } from "../player-headshots.ts";

const row = (over = {}) => ({
  id: "mlb_lean_1", sport: "mlb", sportLabel: "MLB", date: "2026-09-15", matchId: 1, gameLabel: "ATH @ TB", market: "batter_hits",
  marketLabel: "Hits", participantType: "player", player: { name: "Nick Kurtz", team: "ATH", position: "1B", photo: mlbHeadshotUrl(701762) },
  recentGames: [
    { date: "2026-09-10", opponent: "SEA", isHome: true, value: 2 },
    { date: "2026-09-11", opponent: "SEA", isHome: false, value: 0 },
    { date: "2026-09-12", opponent: "HOU", value: 1 },
  ],
  projectionValue: 1.2, pickLabel: "Over 0.5", line: 0.5, americanOdds: -180, bookmaker: "DraftKings", modelProbability: 0.66,
  marketProbability: 0.64, edgePct: 2, parlayEligible: false, lineupStatus: "pre_lineup", caveats: [], confidence: "Medium",
  ...over,
});

test("recent games survive the tuple round-trip exactly — order, dates, home/away (including unknown)", () => {
  const src = row();
  const p = toExplorerProjection(src);
  assert.equal(p.recentGames, undefined, "the object array is not serialised");
  assert.deepEqual(p.recent[0], ["2026-09-10", "SEA", true, 2]);
  assert.deepEqual(decodeRecentGames(p.recent), src.recentGames);
  assert.deepEqual(decodeRecentGames(undefined), []);
});

test("an official StatsAPI headshot travels as its person id and rebuilds to the identical URL", () => {
  const src = row();
  const p = toExplorerProjection(src);
  assert.equal(p.player.photo, undefined);
  assert.equal(p.player.mlbPersonId, "701762");
  assert.equal(explorerPhoto(p.player), src.player.photo);
});

test("any other portrait is kept verbatim; a missing portrait stays missing (never a guessed headshot)", () => {
  const other = toExplorerProjection(row({ player: { name: "Bukayo Saka", team: "Arsenal", photo: "https://a.espncdn.com/i/headshots/soccer/players/full/1.png" } }));
  assert.equal(other.player.mlbPersonId, undefined);
  assert.equal(explorerPhoto(other.player), "https://a.espncdn.com/i/headshots/soccer/players/full/1.png");
  const lookalike = "https://img.mlbstatic.com/some/other/people/123/headshot/67/current";
  assert.equal(explorerPhoto(toExplorerProjection(row({ player: { name: "X", photo: lookalike } })).player), lookalike, "non-canonical URL is not rewritten");
  assert.equal(explorerPhoto(toExplorerProjection(row({ player: { name: "No Photo", team: "TB", photo: null } })).player), null);
  assert.equal(explorerPhoto(toExplorerProjection(row({ player: { name: "No Photo", team: "TB" } })).player), null);
});

test("every rendered scalar field is carried unchanged; unread fields are dropped", () => {
  const src = row();
  const p = toExplorerProjection(src);
  for (const k of EXPLORER_FIELDS) assert.deepEqual(p[k], src[k], k);
  for (const k of ["sport", "sportLabel", "date", "matchId", "gameLabel"]) assert.equal(p[k], undefined, k);
  assert.deepEqual(Object.keys(p.player).sort(), ["mlbPersonId", "name", "team"]);
});

test("every explorer call site maps its rows through toExplorerProjection (one owner)", () => {
  const root = path.join(process.cwd(), "src");
  const sites = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.tsx$/.test(e.name)) { const s = fs.readFileSync(f, "utf8"); for (const m of s.matchAll(/<PlayerPropsExplorer\s+props=\{([^}]*)\}/g)) sites.push([path.relative(root, f), m[1]]); } } };
  walk(root);
  assert.ok(sites.length >= 2, `found ${sites.length} explorer call sites`);
  for (const [f, expr] of sites) assert.match(expr, /\.map\(toExplorerProjection\)$/, `${f} hands the explorer "${expr}" without the projection`);
});
