/**
 * Fight-day freeze (UFC-001, 2026-10-10): once the first bout has started, no pregame card is rebuilt and no odds are bought.
 *
 * Run: npx tsx --test src/lib/sports/ufc/fight-day-freeze.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { FREEZE_HOURS, cardHasStarted, pregameCardFreeze } from "./fight-day-freeze.mjs";

const card = { state: "SCHEDULED_CARD", generatedAt: "2026-10-09T18:44:18Z", event: { providerEventId: "600061541", name: "UFC Fight Night: Allen vs. Duncan", startUtc: "2026-10-10T21:00Z" } };

test("started means at or after the first scheduled bout; unparseable never counts", () => {
  assert.equal(cardHasStarted("2026-10-10T21:00Z", "2026-10-10T20:59:59Z"), false);
  assert.equal(cardHasStarted("2026-10-10T21:00Z", "2026-10-10T21:00:00Z"), true);
  assert.equal(cardHasStarted(null, "2026-10-10T21:00:00Z"), false);
  assert.equal(cardHasStarted("2026-10-10T21:00Z", "garbage"), false);
});

test("the card freezes for the same started event, inside the window only", () => {
  assert.equal(pregameCardFreeze({ existing: card, eventId: "600061541", nowIso: "2026-10-10T15:00:00Z" }).frozen, false, "pregame: rebuild as usual");
  const f = pregameCardFreeze({ existing: card, eventId: 600061541, nowIso: "2026-10-10T21:30:00Z" });
  assert.equal(f.frozen, true);
  assert.match(f.reason, /kept unchanged/);
  assert.equal(pregameCardFreeze({ existing: card, eventId: "600061541", nowIso: `2026-10-11T0${FREEZE_HOURS - 4}:59:00Z` }).frozen, true, "still inside the window");
  assert.equal(pregameCardFreeze({ existing: card, eventId: "600061541", nowIso: "2026-10-11T13:00:00Z" }).frozen, false, "Sunday rollover is untouched");
  assert.equal(pregameCardFreeze({ existing: card, eventId: "600060773", nowIso: "2026-10-10T21:30:00Z" }).frozen, false, "a different event is built");
  assert.equal(pregameCardFreeze({ existing: { ...card, state: "NO_UPCOMING_CARD" }, eventId: "600061541", nowIso: "2026-10-10T21:30:00Z" }).frozen, false);
  assert.equal(pregameCardFreeze({ existing: null, eventId: "600061541", nowIso: "2026-10-10T21:30:00Z" }).frozen, false);
});

test("the card builder consults the freeze before writing", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/build-ufc-card.mjs"), "utf8");
  const freezeAt = src.indexOf("pregameCardFreeze({");
  const writeAt = src.lastIndexOf('fs.writeFileSync(path.join(OUT, "card-latest.json")');
  assert.ok(freezeAt > 0 && writeAt > freezeAt, "the freeze check runs before the card is written");
});

test("the odds capture refuses (exit 3) after the start — and before any call (dry run, no spend)", () => {
  const script = path.join(process.cwd(), "scripts/ufc/capture-ufc-odds.mjs");
  const run = (now) => spawnSync(process.execPath, [script, "--now", now], { encoding: "utf8", env: { ...process.env, ODDS_API_KEY: "" } });
  const cardFile = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/ufc/card-latest.json"), "utf8"));
  if (cardFile.state !== "SCHEDULED_CARD") return; // between cards the script already exits 3 on state
  const start = Date.parse(cardFile.event.startUtc);
  const after = run(new Date(start + 30 * 60_000).toISOString());
  assert.equal(after.status, 3, `after the start: exit 3 (${after.stderr})`);
  assert.match(after.stderr, /pregame prices only/);
  const before = run(new Date(start - 60 * 60_000).toISOString());
  assert.notEqual(before.status, 3, `before the start the gate does not refuse (${before.stdout}${before.stderr})`);
});
