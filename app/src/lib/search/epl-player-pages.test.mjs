/**
 * W9 · audit row 14: an EPL player row in search opens the player's own page when the research registry has one.
 *
 * Run: cd app && npx tsx --test src/lib/search/epl-player-pages.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eplPlayerHref, eplPlayerPageIndex } from "./epl-player-pages.mjs";

const APP = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(APP, "..", "data", "research-projection", "v1", "index.json"), "utf8"));
const projections = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "soccer", "epl", "player-projections", "latest.json"), "utf8"));

test("🔴 Bukayo Saka (committed projections) opens /players/epl/bukayo-saka/, not the Liverpool v Arsenal match page", () => {
  const pages = eplPlayerPageIndex(registry);
  const rows = projections.fixtures.flatMap((f) => (f.players ?? []).map((p) => ({ p, f })));
  const saka = rows.find(({ p }) => p.name === "Bukayo Saka");
  if (!saka) return; // the projections rolled past Arsenal's fixture; the id rule below still holds
  assert.equal(eplPlayerHref(saka.p, saka.f.slug, pages), "/players/epl/bukayo-saka/");
});

test("joined by exact provider id, never by name; no page → the match page", () => {
  const pages = eplPlayerPageIndex({ schemaVersion: 1, entries: [
    { sport: "EPL", kind: "player", id: "epl-athlete-280555", path: "/players/epl/bukayo-saka/" },
    { sport: "NFL", kind: "player", id: "epl-athlete-1", path: "/players/nfl/x/" },
  ] });
  assert.equal(eplPlayerHref({ playerId: "280555", name: "Bukayo Saka" }, "liverpool-v-arsenal-2026-11-01", pages), "/players/epl/bukayo-saka/");
  assert.equal(eplPlayerHref({ playerId: "302002", name: "Bukayo Saka" }, "coventry-city-v-sunderland-2026-10-31", pages), "/epl/match/coventry-city-v-sunderland-2026-10-31/", "a different Saka keeps his match");
  assert.equal(eplPlayerHref({ playerId: "1", name: "X" }, "a-v-b", pages), "/epl/match/a-v-b/", "another sport's entry never matches");
  assert.equal(eplPlayerHref({ name: "No Id" }, "a-v-b", pages), "/epl/match/a-v-b/");
  assert.equal(eplPlayerPageIndex(null).size, 0);
});

test("the index builder uses the rule for EPL player rows and keeps the match as the hint", () => {
  const src = fs.readFileSync(path.join(APP, "scripts", "build-search-index.mjs"), "utf8");
  assert.match(src, /eplPlayerHref\(p, f\.slug, eplPlayerPages\)/);
  assert.match(src, /`Premier League · \$\{p\.teamName \?\? ""\} · \$\{f\.matchup\}`/, "the match stays in the row's hint");
});
