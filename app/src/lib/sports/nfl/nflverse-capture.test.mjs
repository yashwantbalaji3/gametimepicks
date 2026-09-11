/**
 * The committed nflverse tables (P257): counts reconcile to the manifest, attribution travels with every file
 * (CC BY 4.0), raw files stay out of the public repository, and nothing is dropped without being counted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.join(process.cwd(), "..");
const DIR = path.join(REPO, "data/internal/research/nfl/nflverse");
const manifestPath = path.join(DIR, "manifest-v1.json");

test("every season file's rows match the manifest, and unjoined rows are counted", () => {
  if (!fs.existsSync(manifestPath)) return;
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.match(m.attribution, /nflverse/); assert.match(m.attribution, /CC BY 4\.0/);
  for (const [season, p] of Object.entries(m.tables.participation)) {
    if (!p.published) continue;
    const text = fs.readFileSync(path.join(DIR, p.file), "utf8");
    const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(rows.length, p.rows, `${season}: file rows equal the manifest`);
    assert.equal(rows.filter((r) => !r.espnId).length, p.unjoined, `${season}: every unjoined row is counted, none dropped`);
    assert.ok(rows.every((r) => r.season === Number(season) && r.offenseSnaps > 0), `${season}: offense-only rows of that season`);
  }
});

test("the game-lines table carries its attribution and a sane closing market", () => {
  const f = path.join(DIR, "game-lines-v1.json");
  if (!fs.existsSync(f)) return;
  const g = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.match(g.attribution, /CC BY 4\.0/);
  const final = g.games.filter((x) => x.final && x.close.moneyline && x.final.home !== x.final.away);
  const favWon = final.filter((x) => (x.close.moneyline.home > 0.5) === (x.final.home > x.final.away)).length / final.length;
  assert.ok(favWon > 0.6 && favWon < 0.75, `closing favourites won ${favWon.toFixed(3)} — outside the NFL's long-run range means a sign or join error`);
});

test("raw nflverse files are never committed", () => {
  const tracked = execFileSync("git", ["ls-files", "data/internal/research/nfl/raw/nflverse"], { cwd: REPO, encoding: "utf8" }).trim();
  assert.equal(tracked, "");
});
