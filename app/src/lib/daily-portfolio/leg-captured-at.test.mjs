/**
 * Stage 4C groundwork: a Bank Builder / Moonshot team leg carries the instant its price was captured, copied from
 * the team-market game row, never the file's generatedAt. No price-age rule reads it yet (founder Q5).
 * Pinned to a committed slate file, never a live day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMlbTeamLegs } from "./mlb-team-legs.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = path.join(APP, "public", "data");
const DATE = "2026-10-06";

test("every team leg carries its game's own capturedAt", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "mlb", "team-markets", `${DATE}.json`), "utf8"));
  const byGame = new Map(Object.values(doc.games).map((g) => [String(g.gameId), g.capturedAt]));
  const legs = loadMlbTeamLegs(ROOT, `${DATE}T09:30:00Z`, DATE, { bothSides: true });
  assert.ok(legs.length > 0);
  for (const l of legs) assert.equal(l.capturedAt, byGame.get(l.gameId), l.id);
});

test("a game row with no stamp gives null, never the file's generatedAt", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "mlb", "team-markets", `${DATE}.json`), "utf8"));
  for (const g of Object.values(doc.games)) delete g.capturedAt;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cap-"));
  fs.mkdirSync(path.join(tmp, "mlb", "team-markets"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "mlb", "team-markets", `${DATE}.json`), JSON.stringify(doc));
  const legs = loadMlbTeamLegs(tmp, `${DATE}T09:30:00Z`, DATE, { bothSides: true });
  assert.ok(legs.length > 0, "the pregame gate still admits the games (it has its own fallback), so this is not vacuous");
  for (const l of legs) assert.equal(l.capturedAt, null, l.id);
});
