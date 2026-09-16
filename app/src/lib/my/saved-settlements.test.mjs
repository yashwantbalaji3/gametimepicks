/**
 * SAVED SETTLEMENTS PROJECTION (v1.1.4) — the compact file must give the Saved owner's resolveResult EXACTLY the
 * answers the full ledgers give. Run over the REAL ledgers, for every graded event, every family.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { LEDGER_URLS, parseLedger, resolveResult } from "../saved/results.mjs";
import { compactLedgers, expandLedgers } from "./saved-settlements.mjs";

const APP = process.cwd();
const full = Object.fromEntries(Object.keys(LEDGER_URLS).map((k) => [k, parseLedger(k, fs.readFileSync(path.join(APP, "public", LEDGER_URLS[k]), "utf8"))]));
const expanded = expandLedgers(JSON.parse(JSON.stringify(compactLedgers(full))));
const NOW = "2030-01-01T00:00:00Z"; // every event started: an ungraded one reads PENDING, never UPCOMING
const saved = (settlement) => ({ id: "x", sport: "mlb", startUtc: "2026-01-01T00:00:00Z", settlement });
const same = (item) => {
  const a = resolveResult(item, full, NOW), b = resolveResult(item, expanded, NOW);
  return a.state === b.state && a.outcome === b.outcome ? null : { item: item.settlement, full: [a.state, a.outcome], compact: [b.state, b.outcome] };
};

test("SS1 · every MLB graded game × every saved family resolves identically (state + outcome)", () => {
  const pks = [...new Set(full.mlbGames.map((r) => r.gamePk))];
  assert.ok(pks.length > 100, "real graded MLB games exist — otherwise this proves nothing");
  const families = ["Winner", "Total", "Run line", "Winner call paused", "No winner call"];
  const diffs = [];
  let finals = 0;
  for (const gamePk of pks) for (const family of families) {
    const item = saved({ kind: "mlb-game", gamePk, family });
    const d = same(item);
    if (d) diffs.push(d);
    if (resolveResult(item, full, NOW).state === "FINAL") finals++;
  }
  // an ungraded game too: both must say PENDING
  const d = same(saved({ kind: "mlb-game", gamePk: 1, family: "Winner" }));
  if (d) diffs.push(d);
  assert.deepEqual(diffs.slice(0, 5), []);
  assert.ok(finals > pks.length, "positive control: many (game, family) pairs are FINAL, so equality is not vacuous");
});

test("SS2 · every NFL / EPL / UFC graded winner row resolves identically", () => {
  const diffs = [];
  let finals = 0;
  for (const r of full.nfl) {
    const item = saved({ kind: "nfl-event", providerEventId: String(r.eventId).replace(/^nfl-/, ""), family: "Winner" });
    const d = same(item); if (d) diffs.push(d);
    if (resolveResult(item, full, NOW).state === "FINAL") finals++;
  }
  for (const r of full.epl) {
    const item = saved({ kind: "epl-event", eventId: r.eventId, family: "Match result" });
    const d = same(item); if (d) diffs.push(d);
    if (resolveResult(item, full, NOW).state === "FINAL") finals++;
  }
  for (const r of full.ufc) {
    const [date, pair] = String(r.eventId).split(/:(.*)/s);
    const [red, blue] = pair.split("|");
    const item = saved({ kind: "ufc-bout", date, red, blue });
    const d = same(item); if (d) diffs.push(d);
    if (resolveResult(item, full, NOW).state === "FINAL") finals++;
  }
  assert.deepEqual(diffs.slice(0, 5), []);
  assert.ok(finals >= full.nfl.length + full.epl.length + full.ufc.length - 3, "positive control: the rows really resolve to FINAL");
});

test("SS3 · mutation probe: a projection that drops PUSH or flips a hit is caught by the same comparison", () => {
  const broken = JSON.parse(JSON.stringify(compactLedgers(full)));
  const pk = Object.keys(broken.mlb)[0];
  broken.mlb[pk] = broken.mlb[pk].replace(/[WLP]/, (c) => (c === "W" ? "L" : "W"));
  broken.nfl[0][1] = !broken.nfl[0][1];
  const bad = expandLedgers(broken);
  const flipped = ["Winner", "Total", "Run line"].some((family) => {
    const item = saved({ kind: "mlb-game", gamePk: Number(pk), family });
    return resolveResult(item, full, NOW).outcome !== resolveResult(item, bad, NOW).outcome;
  });
  assert.ok(flipped, "an altered MLB outcome is detected");
  const nflItem = saved({ kind: "nfl-event", providerEventId: broken.nfl[0][0].replace(/^nfl-/, ""), family: "Winner" });
  assert.notEqual(resolveResult(nflItem, full, NOW).outcome, resolveResult(nflItem, bad, NOW).outcome, "an altered NFL hit is detected");
});

test("SS4 · a malformed or foreign document expands to null (unknown), never to empty ledgers (\"not graded\")", () => {
  assert.equal(expandLedgers(null), null);
  assert.equal(expandLedgers({ schemaVersion: 2, artifact: "my-saved-settlements", mlb: {}, nfl: [], epl: [], ufc: [] }), null);
  assert.equal(expandLedgers({ schemaVersion: 1, artifact: "something-else", mlb: {}, nfl: [], epl: [], ufc: [] }), null);
  assert.equal(expandLedgers({ schemaVersion: 1, artifact: "my-saved-settlements", mlb: {}, nfl: {}, epl: [], ufc: [] }), null);
});

test("SS5 · the projection is small: measured, and bounded well under the ledgers it replaces", () => {
  const bytes = JSON.stringify(compactLedgers(full)).length;
  const ledgerBytes = Object.values(LEDGER_URLS).reduce((n, u) => n + fs.statSync(path.join(APP, "public", u)).size, 0);
  assert.ok(bytes < 64_000, `projection ${bytes} B`);
  assert.ok(bytes * 20 < ledgerBytes, `projection ${bytes} B vs ledgers ${ledgerBytes} B`);
});
