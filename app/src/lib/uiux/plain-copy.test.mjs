/**
 * Plain copy on public pages (UX audit H3, H4, H6, H7, L4; DS-001 §1.4 / §1.7, 2026-10-15).
 * Every code a surface can receive has reader words; the internal phrases removed here do not come back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EVENT_STATUS, UFC_BOUT_STATUS_EXT, EVENT_STATUS_LABEL, eventStatusLabel } from "../sports/schedule-contract.mjs";

const APP = process.cwd();
const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");

test("every schedule status, shared and UFC bout extension, has reader words; no underscore reaches a reader", () => {
  for (const s of [...EVENT_STATUS, ...UFC_BOUT_STATUS_EXT]) {
    assert.ok(EVENT_STATUS_LABEL[s], `${s} has no label`);
    assert.doesNotMatch(eventStatusLabel(s), /_/, `${s} → ${eventStatusLabel(s)}`);
  }
  assert.equal(eventStatusLabel("SOMETHING_NEW"), "Status unknown", "an unmapped code is never printed raw");
  assert.match(src("src/components/sports/upcoming-sports.tsx"), /eventStatusLabel\(e\.status\)/);
  assert.doesNotMatch(src("src/components/sports/upcoming-sports.tsx"), /e\.status\.toLowerCase\(\)/);
});

test("MLB board: every pendingReason in the committed boards has a sentence, and the code itself is never printed", () => {
  const body = src("src/components/mlb/mlb-board-body.tsx");
  const PNC = (body.match(/const PRICES_NOT_CAPTURED = "([^"]+)"/) ?? [])[1];
  const map = Object.fromEntries([...body.matchAll(/^\s+([a-z_]+): (?:"([^"]+)"|PRICES_NOT_CAPTURED),$/gm)].map((m) => [m[1], m[2] ?? PNC]));
  const dir = path.join(APP, "public/data/mlb/boards");
  const reasons = new Set(fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < "2090")
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).pendingReason; } catch { return null; } }).filter(Boolean));
  assert.ok(reasons.size >= 1, "POSITIVE CONTROL: committed boards carry at least one pendingReason");
  // …and every reason the generator CAN write, not only those in today's data.
  const gen = fs.readFileSync(path.join(APP, "..", "pipeline/mlb/generate_mlb_board.py"), "utf8");
  const produced = [...gen.matchAll(/_write_pending_board\([^)]*reason="([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(produced.length >= 6, `found only ${produced.length} generator reasons`);
  for (const r of produced) reasons.add(r);
  assert.match(map.no_events, /odds provider/, "no_events is about the odds feed, not the schedule");
  assert.doesNotMatch(map.no_events, /no .*games are scheduled/i);
  for (const r of reasons) assert.ok(map[r], `pendingReason "${r}" would be hidden or raw — add reader words`);
  assert.doesNotMatch(body, /Reason: \{board\.pendingReason\}/);
});

test("NFL products: the receipts' closed lane-state set has reader words; no run hash in the eyebrow; no 'today' claim", () => {
  const producer = src("scripts/nfl/build-nfl-product-receipts.mjs");
  const states = new Set([...producer.matchAll(/state: [^"\n]*"([A-Z_]+)"[^\n]*"([A-Z_]+)"/g)].flatMap((m) => [m[1], m[2]]));
  states.add("ACTIVE");
  const page = src("src/app/nfl/page.tsx");
  for (const s of states) assert.match(page, new RegExp(`\\b${s}: "[^"]+"`), `lane state ${s} has no label`);
  assert.doesNotMatch(page, /run \$\{productReceipts\.runId\}/, "the run hash is not reader information");
  assert.doesNotMatch(page, /lanes ran today/, "the title does not assert a date the artifact may not be from");
});

test("removed internal phrases stay removed", () => {
  const banned = [
    ["src/app/mlb/page.tsx", /on disk|MLB Stats API will return|cleared the optimizer|Lines arriving soon/],
    ["src/app/ufc/page.tsx", /Nothing renders here|fills in from the/],
    ["src/app/nfl/page.tsx", /committed schedule capture|Nothing is invented to fill/],
    ["src/components/game/game-detail-page.tsx", /appear here automatically/],
    ["src/app/epl/page.tsx", /honest state rather than a stale card/],
    ["src/components/mlb/mlb-board-body.tsx", /Schedule is live but no posted prop lines/],
  ];
  for (const [p, re] of banned) assert.doesNotMatch(src(p), re, p);
});
