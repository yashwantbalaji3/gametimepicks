/**
 * NFL · inputs must precede kickoff (2026-10-25 PIT @ NO): the stamp rule, the record of record, the append-only
 * exclusions, and the producers that apply them.
 *
 * Run: npx tsx --test src/lib/sports/nfl/record-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { INPUT_AFTER_KICKOFF, inputStamp, inputStampsOf, postKickoffInputs, postKickoffStamps, refusalLine } from "./input-stamps.mjs";
import { INELIGIBLE, recordEligibility } from "./record-eligibility.mjs";
import { RECORD_EXCLUSIONS, exclusionFor } from "./record-exclusions.mjs";
import { selectFrozenReceipts } from "./frozen-carry.mjs";
import { forecastOfRecord } from "../../forecast-ledger/adapters/nfl.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const KICKOFF = "2026-10-25T13:30Z";
const AFTER_12S = "2026-10-25T13:30:12Z";
const DAY = "data/internal/nfl/forecast-receipts/2026-10-25";
const readRel = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

/* ───────────────────────────── the stamp rule ───────────────────────────── */

test("the 12-second fixture: an input whose own sourceAsOf is 12 s after kickoff is late, even when generatedAt is before it", () => {
  const injuries = { generatedAt: "2026-10-25T13:29:54Z", sourceAsOf: AFTER_12S, entries: [] };
  const rosters = { generatedAt: "2026-10-25T13:29:54Z", sourceAsOf: "2026-10-25T13:29:54Z" };
  assert.deepEqual(inputStamp(injuries), { field: "sourceAsOf", stamp: AFTER_12S }, "sourceAsOf decides, not generatedAt");
  const late = postKickoffInputs({ injuries, rosters }, KICKOFF);
  assert.deepEqual(late.map((x) => [x.input, x.field, x.stamp]), [["injuries", "sourceAsOf", AFTER_12S]]);
  assert.match(refusalLine("p", "401873011", KICKOFF, late), new RegExp(`^REFUSED ${INPUT_AFTER_KICKOFF} p 401873011`));
  // exactly at kickoff is late too; a second before is not
  assert.equal(postKickoffInputs({ injuries: { sourceAsOf: "2026-10-25T13:30:00Z" } }, KICKOFF).length, 1);
  assert.equal(postKickoffInputs({ injuries: { sourceAsOf: "2026-10-25T13:29:59Z" } }, KICKOFF).length, 0);
  // no sourceAsOf → generatedAt; an undated present input cannot be shown to precede kickoff; an absent one is not judged
  assert.deepEqual(inputStamp({ generatedAt: "2026-10-25T13:31Z" }), { field: "generatedAt", stamp: "2026-10-25T13:31Z" });
  assert.equal(postKickoffInputs({ injuries: { entries: [] } }, KICKOFF).length, 1);
  assert.equal(postKickoffInputs({ injuries: null, rosters: undefined }, KICKOFF).length, 0);
  assert.equal(postKickoffInputs({ injuries }, "not a time").length, 1, "an unparseable kickoff refuses");
  assert.deepEqual(inputStampsOf({ injuries, rosters, odds: null }), { injuries: AFTER_12S, rosters: "2026-10-25T13:29:54Z", odds: null });
  assert.deepEqual(postKickoffStamps({ injuries: AFTER_12S, rosters: null }, KICKOFF).map((x) => x.input), ["injuries"]);
});

/* ───────────────────────────── the record of record ───────────────────────────── */

const receipt = (o = {}) => ({ providerEventId: "1", kickoffUtc: KICKOFF, generatedAt: "2026-10-25T12:00:00Z", model: { inputHash: "a" }, forecastSummary: {}, ...o });

test("eligibility: generated before kickoff AND every recorded input before kickoff AND not excluded", () => {
  assert.deepEqual(recordEligibility(receipt()), { eligible: true });
  assert.equal(recordEligibility(receipt({ generatedAt: KICKOFF })).code, INELIGIBLE.GENERATED_AT_OR_AFTER_KICKOFF);
  assert.equal(recordEligibility(receipt({ inputs: { injuries: { sourceAsOf: AFTER_12S } } })).code, INELIGIBLE.INPUT_AFTER_KICKOFF);
  assert.equal(recordEligibility(receipt({ inputs: { injuries: { sourceAsOf: "2026-10-25T13:29:00Z" }, rosters: { sourceAsOf: null } } })).eligible, true);
  assert.equal(recordEligibility({}).code, INELIGIBLE.INCOMPLETE);
  // forecastOfRecord: the newest ELIGIBLE receipt, so a late revision falls back to the one before it
  const rec = forecastOfRecord([
    { file: "a.json", receipt: receipt({ generatedAt: "2026-10-25T12:36:05Z" }) },
    { file: "a-rev-1329Z.json", receipt: receipt({ generatedAt: "2026-10-25T13:29:54Z", inputs: { injuries: { sourceAsOf: AFTER_12S } } }) },
  ]);
  assert.equal(rec.get("1").file, "a.json");
});

test("401873011 PIT @ NO on the committed receipts: the record is rev-1236Z, never the post-kickoff rev-1329Z", () => {
  const files = fs.readdirSync(path.join(REPO, DAY)).filter((f) => f.startsWith("401873011") && f.endsWith(".json"));
  assert.ok(files.includes("401873011-rev-1329Z.json") && files.includes("401873011-rev-1236Z.json"), "append-only: both revisions stay on disk");
  const receipts = files.map((f) => ({ file: `${DAY}/${f}`, receipt: readRel(`${DAY}/${f}`) }));
  const late = receipts.find((r) => r.file.endsWith("rev-1329Z.json")).receipt;
  assert.ok(Date.parse(late.generatedAt) < Date.parse(late.kickoffUtc), "the late revision IS labelled pre-kickoff — the old rule would have taken it");
  assert.equal(recordEligibility(late).code, INELIGIBLE.EXCLUDED);
  assert.equal(forecastOfRecord(receipts).get("401873011").file, `${DAY}/401873011-rev-1236Z.json`);
  const before1329 = receipts.filter((r) => !r.file.endsWith("rev-1329Z.json"));
  assert.equal(forecastOfRecord(before1329).get("401873011").file, `${DAY}/401873011-rev-1236Z.json`, "the same record as if 1329Z had never been written");
  // the frozen carry (started games on /nfl) picks the same receipt
  const frozen = selectFrozenReceipts({ receipts: receipts.map((r) => r.receipt), currentPeriod: { seasonType: late.seasonType, week: late.week }, nowIso: "2026-10-25T14:00:00Z", liveIds: new Set(), terminalIds: new Set() });
  assert.equal(frozen.find((r) => String(r.providerEventId) === "401873011").generatedAt, "2026-10-25T12:36:05Z");
  // and no number a reader sees moves: 1329Z and 1236Z publish the same forecast
  assert.deepEqual(late.forecastSummary, readRel(`${DAY}/401873011-rev-1236Z.json`).forecastSummary);
});

/* ───────────────────────────── the exclusions: append-only, sha-pinned ───────────────────────────── */

/** One digest per entry, in order. Adding an entry appends a pin; editing or removing one fails here. */
const PINNED_ENTRY_DIGESTS = ["6b4b9252"];
const digest = (e) => crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex").slice(0, 8);

test("record exclusions are append-only, and each pins the committed receipt it excludes", () => {
  assert.ok(RECORD_EXCLUSIONS.length >= PINNED_ENTRY_DIGESTS.length, "an entry was removed");
  assert.deepEqual(RECORD_EXCLUSIONS.slice(0, PINNED_ENTRY_DIGESTS.length).map(digest), PINNED_ENTRY_DIGESTS, "an existing entry was edited");
  assert.equal(RECORD_EXCLUSIONS.length, PINNED_ENTRY_DIGESTS.length, "a new entry needs its digest pinned here");
  for (const e of RECORD_EXCLUSIONS) {
    const bytes = fs.readFileSync(path.join(REPO, e.file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), e.sha256, `${e.file}: the excluded receipt is byte-identical to what was reviewed`);
    const r = JSON.parse(bytes.toString("utf8"));
    assert.equal(exclusionFor(r), e, "identity match: event, generatedAt, inputHash");
    assert.equal(String(r.providerEventId), e.providerEventId);
    assert.ok(Date.parse(e.evidence.stamp) >= Date.parse(r.kickoffUtc), "the evidence really postdates kickoff");
    assert.ok(fs.existsSync(path.join(REPO, e.recordInstead)), "the record it falls back to exists");
    assert.ok(Object.isFrozen(e));
  }
  assert.ok(Object.isFrozen(RECORD_EXCLUSIONS));
  assert.equal(exclusionFor(receipt()), null);
});

/* ───────────────────────────── the producers apply it ───────────────────────────── */

test("each pre-kickoff producer checks its inputs' own stamps per event before it writes", () => {
  /* build-nfl-public-forecasts is exercised end to end (regular-season-forecasts.test.mjs, 12-second fixture). The
     participation and board builders have no store seam; this holds them to the same shared rule, before any write. */
  for (const [file, writes] of [
    ["scripts/nfl/build-nfl-participation.mjs", "fs.writeFileSync(base"],
    ["scripts/nfl/build-nfl-player-board.mjs", "fs.writeFileSync(path.join(outDir, `${doc.providerEventId}.json`)"],
    ["scripts/nfl/build-nfl-public-forecasts.mjs", "fs.writeFileSync(revPath"],
  ]) {
    const src = fs.readFileSync(path.join(APP, file), "utf8");
    assert.match(src, /import \{[^}]*postKickoffInputs[^}]*\} from "\.\.\/\.\.\/src\/lib\/sports\/nfl\/input-stamps\.mjs"/, `${file} imports the shared rule`);
    const guard = src.indexOf("postKickoffInputs(stampInputs,");
    assert.ok(guard > 0, `${file} applies it per event`);
    assert.ok(guard < src.indexOf(writes), `${file}: the check precedes the write`);
    const def = src.slice(src.indexOf("const stampInputs"), src.indexOf("};", src.indexOf("const stampInputs")) + 2);
    assert.ok(/\binjuries\b/.test(def) && /\brosters\b/.test(def), `${file} judges the injuries and rosters captures: ${def}`);
    assert.match(src, /refusalLine\(/, `${file} logs a typed refusal`);
  }
});

/* ───────────────────────────── public pages stand on the record, never on an excluded copy ───────────────────────────── */

test("a public copy of an excluded revision stands for its recordInstead (hero and official snapshot), or fails closed", async () => {
  const { publicRecordOf, loadForecastViews } = await import("./forecast-view-load.mjs");
  for (const e of RECORD_EXCLUSIONS) {
    // the public copy exactly as the producer publishes a receipt (lineage and input stamps removed)
    const pub = { ...readRel(e.file) };
    delete pub.revisionOf; delete pub.priorInputHash; delete pub.inputs;
    const rec = readRel(e.recordInstead);
    const mapped = publicRecordOf(pub, REPO);
    assert.equal(mapped.generatedAt, rec.generatedAt, `${e.providerEventId}: the page stands on ${e.recordInstead}`);
    assert.equal(mapped.model.inputHash, rec.model.inputHash);
    assert.deepEqual(mapped.forecastSummary, rec.forecastSummary);
    assert.equal(mapped.revisionOf, undefined, "published like any receipt: no lineage fields");
    assert.equal(publicRecordOf(pub, "/nonexistent-root"), null, "an unreadable record fails closed");
  }
  const other = { providerEventId: "1", generatedAt: "2026-10-25T12:00:00Z", model: { inputHash: "a" } };
  assert.equal(publicRecordOf(other, REPO), other, "a forecast that is not excluded is untouched");
  // the committed public artifacts: wherever an excluded event is still carried, its page shows the record and the
  // official snapshot (with its player table) resolves — the 2026-10-26 regression rendered PIT @ NO with neither
  const views = new Map(loadForecastViews(path.join(APP, "public")).map((v) => [String(v.providerEventId), v]));
  for (const e of RECORD_EXCLUSIONS) {
    const v = views.get(e.providerEventId);
    if (!v) continue; // the event has left the public window; the mapping above still holds
    assert.ok(v.official?.snapshotId, `${e.providerEventId}: the official snapshot resolves (refusal: ${v.official?.refusal ?? "none"})`);
    assert.ok(v.players.length > 0, `${e.providerEventId}: official player table`);
    const rec = readRel(e.recordInstead);
    assert.deepEqual([v.record.generatedAt, v.record.inputHash], [rec.generatedAt, rec.model.inputHash], "the page's forecast is the record, not the excluded copy");
  }
});

test("an excluded record never renders as official anywhere: every public-forecast union passes the record resolver", () => {
  /* Pages read app/public/data/nfl/forecasts (latest ∪ frozen-latest), which are never rewritten for a past game. Each
     reader resolves an excluded copy to its record (public-record.mjs); a reader that bypasses it would show the
     excluded revision. */
  const roots = ["src/app", "src/components", "src/lib"].map((d) => path.join(APP, d));
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
  roots.forEach(walk);
  let calls = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    if (f.endsWith("public-forecast-union.mjs")) continue;
    let i = src.indexOf("unionFrozenForecasts(");
    while (i !== -1) {
      if (!/^\s*import\b/m.test(src.slice(src.lastIndexOf("\n", i) + 1, i)) && src.slice(i - 9, i) !== "function ") {
        calls += 1;
        const window = src.slice(i, i + 600);
        assert.match(window, /resolve:\s*nflPublicRecordResolver\(/, `${path.relative(APP, f)} reads the public forecasts without the record resolver`);
      }
      i = src.indexOf("unionFrozenForecasts(", i + 1);
    }
  }
  assert.ok(calls >= 7, `found ${calls} union readers (game, simulation and week pages, games table, events and my read-models, forecast-view-load)`);
});

test("a FUTURE post-kickoff record needs no exclusion: recorded inputs alone make it ineligible", () => {
  /* Exclusions exist only for receipts written before inputs were recorded. A receipt written from now on that rests on
     a post-kickoff input (if a producer ever wrote one) is ineligible by its own stamps — no list entry needed. */
  const future = receipt({ providerEventId: "999999999", generatedAt: "2026-11-01T17:59:50Z", kickoffUtc: "2026-11-01T18:00Z", inputs: { injuries: { sourceAsOf: "2026-11-01T18:00:12Z" }, rosters: { sourceAsOf: "2026-11-01T17:59:50Z" } } });
  assert.equal(exclusionFor(future), null, "not on the list");
  assert.equal(recordEligibility(future).code, INELIGIBLE.INPUT_AFTER_KICKOFF);
  assert.equal(forecastOfRecord([{ file: "f.json", receipt: future }]).get("999999999"), undefined, "never the record");
  const ok = receipt({ providerEventId: "999999999", generatedAt: "2026-11-01T17:30:00Z", kickoffUtc: "2026-11-01T18:00Z", inputs: { injuries: { sourceAsOf: "2026-11-01T17:29:00Z" } } });
  assert.equal(forecastOfRecord([{ file: "a.json", receipt: ok }, { file: "f.json", receipt: future }]).get("999999999").file, "a.json", "the earlier eligible receipt stays the record");
});
