import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { poolAvailability, emptyPoolReason, POOL_STATUS } from "./input-availability.mjs";

const root = (files) => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-avail-"));
  for (const [rel, doc] of Object.entries(files)) {
    const p = path.join(r, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(doc));
  }
  return r;
};

test("a missing artifact is INPUTS_MISSING, never a no-card slate", () => {
  const a = poolAvailability(root({}), "2026-09-06");
  assert.equal(a.status, POOL_STATUS.INPUTS_MISSING);
  assert.ok(a.sources.every((s) => !s.present));
  assert.match(emptyPoolReason(a.status, "2026-09-06"), /missing input, not a slate that came up short/);
});

test("a priced slate is PRICED, and its reason defers to the lane's own qualification", () => {
  const r = root({ "mlb/team-markets/2026-09-06.json": { games: [{ gameId: "g1" }, { gameId: "g2" }] } });
  const a = poolAvailability(r, "2026-09-06");
  assert.equal(a.status, POOL_STATUS.PRICED);
  assert.equal(emptyPoolReason(a.status, "2026-09-06"), null, "a priced slate must not override the lane's reason");
});

test("an artifact holding zero games is NO_EVENTS — distinct from both", () => {
  const a = poolAvailability(root({ "mlb/team-markets/2026-09-06.json": { games: [] } }), "2026-09-06");
  assert.equal(a.status, POOL_STATUS.NO_EVENTS);
  assert.match(emptyPoolReason(a.status, "2026-09-06"), /holds no games/);
  // and the three statuses produce three different answers
  const reasons = new Set([POOL_STATUS.INPUTS_MISSING, POOL_STATUS.NO_EVENTS, POOL_STATUS.PRICED]
    .map((s) => String(emptyPoolReason(s, "2026-09-06"))));
  assert.equal(reasons.size, 3, "two statuses share a sentence — that is the conflation this exists to end");
});

test("the object form of `games` counts too, as the real artifact uses it", () => {
  const a = poolAvailability(root({ "mlb/team-markets/2026-09-06.json": { games: { a: {}, b: {} } } }), "2026-09-06");
  assert.equal(a.status, POOL_STATUS.PRICED);
});

test("a corrupt artifact is present-but-uncountable, and is not called PRICED", () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-avail-"));
  const p = path.join(r, "mlb", "team-markets", "2026-09-06.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "{ not json");
  const a = poolAvailability(r, "2026-09-06");
  assert.equal(a.status, POOL_STATUS.NO_EVENTS, "unreadable must not be reported as a priced slate");
});

test("LIVE · today's real availability is reported, whatever it is", () => {
  const a = poolAvailability(path.join(process.cwd(), "public", "data"), "2026-09-05");
  assert.ok(Object.values(POOL_STATUS).includes(a.status));
  assert.ok(a.sources.length >= 2, "both candidate sources are inspected");
});
