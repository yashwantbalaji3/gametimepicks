/**
 * SAVED DESTINATIONS — built-export guard (v1.1.4.1). Reads out/ (post-build phase).
 *
 * The bug this pins: a saved MLB card's href was a URL that could be CONSTRUCTED but was no longer EXPORTED. So every
 * check here is against files in out/, for REAL graded games — never against URL construction.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildSavedRouteManifest } from "./saved-routes.ts";
import { resolveSavedDestination } from "./saved-destination.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const pageFile = (href) => path.join(OUT, href.split("#")[0].replace(/\/?$/, "/"), "index.html");
const manifest = buildSavedRouteManifest();

test("SDB1 · every route in the manifest is exported, and every board date renders a board (not 'date unavailable')", () => {
  const games = Object.values(manifest.mlbGamePathByPk);
  assert.ok(games.length > 0 && manifest.mlbBoardDates.length > 50, "real routes — otherwise this proves nothing");
  for (const href of games) assert.ok(fs.existsSync(pageFile(href)), `game page exported: ${href}`);
  for (const date of manifest.mlbBoardDates) {
    const f = pageFile(`/mlb/board/${date}/`);
    assert.ok(fs.existsSync(f), `board exported: ${date}`);
    assert.equal(fs.readFileSync(f, "utf8").includes("MLB board · date unavailable"), false, `board ${date} has data`);
  }
  // Positive control: data-less board dates DO exist in the export — the manifest excludes them, it does not avoid them.
  const unavailable = fs.readdirSync(path.join(OUT, "mlb/board")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.readFileSync(pageFile(`/mlb/board/${d}/`), "utf8").includes("MLB board · date unavailable"));
  assert.ok(unavailable.length > 0 && unavailable.every((d) => !manifest.mlbBoardDates.includes(d)), `excluded: ${unavailable.join(",")}`);
});

test("SDB2 · ⚠ every GRADED MLB game in the ledger resolves to an exported page — and a board link lands on that game's anchor", () => {
  const rows = fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const games = new Map();
  for (const r of rows) if (!games.has(r.gamePk) && r.firstPitchUtc) games.set(r.gamePk, r);
  assert.ok(games.size > 100, "real graded games");
  const kinds = { GAME: 0, BOARD: 0, NONE: 0 };
  let staleHrefMissing = 0;
  for (const [gamePk, r] of games) {
    // The href such a card was saved with — the pattern that aged into a 404.
    const stored = `/games/mlb/${String(r.matchup).toLowerCase().replace(" @ ", "-vs-")}-${r.date}/`;
    const saved = { sport: "mlb", href: stored, startUtc: r.firstPitchUtc, settlement: { kind: "mlb-game", gamePk, family: "Winner" } };
    const d = resolveSavedDestination(saved, manifest);
    kinds[d.kind]++;
    if (!fs.existsSync(pageFile(stored))) staleHrefMissing++;
    if (d.kind === "NONE") continue;
    assert.ok(fs.existsSync(pageFile(d.href)), `${gamePk} → ${d.href} is exported`);
    if (d.kind === "BOARD") assert.ok(fs.readFileSync(pageFile(d.href), "utf8").includes(`id="game-${gamePk}"`), `${gamePk} anchor on ${d.href}`);
  }
  assert.equal(kinds.NONE, 0, "every graded game has a durable destination today");
  assert.ok(kinds.BOARD > 100, `past games use the dated board (${JSON.stringify(kinds)})`);
  assert.ok(staleHrefMissing > 100, `positive control: the stored game-page hrefs of past games really are absent from the export (${staleHrefMissing})`);
});

test("SDB3 · current slate: a saved game on today's slate keeps its canonical game page", () => {
  const [pk, href] = Object.entries(manifest.mlbGamePathByPk)[0];
  const d = resolveSavedDestination({ sport: "mlb", href, startUtc: "2026-01-01T00:00:00Z", settlement: { kind: "mlb-game", gamePk: Number(pk), family: "Winner" } }, manifest);
  assert.deepEqual([d.kind, d.href], ["GAME", href]);
  assert.ok(fs.existsSync(pageFile(href)));
});

test("SDB4 · both Saved consumers ship the manifest (no runtime route probing) and stay noindex", () => {
  for (const route of ["saved", "my"]) {
    const html = fs.readFileSync(path.join(OUT, route, "index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/, `/${route} noindex`);
    assert.ok(html.includes("mlbBoardDates"), `/${route} carries the route manifest in its payload`);
  }
});
