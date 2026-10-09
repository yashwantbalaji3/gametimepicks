/**
 * RUNTIME RESULTS STORE — local validation of the pilot design (founder decision 4, 2026-10-09). Runs the real store
 * rules (core.mjs) and the real read handler (api/_results-core.mjs) against a filesystem adapter with the target
 * store's semantics. Nothing here touches Vercel, Blob or the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { publishResult, rollback, readCurrent, keysFor, canonical } from "./core.mjs";
import { fsAdapter } from "./fs-adapter.mjs";
import { projectWm2Game } from "./wm2-projection.mjs";
import { handleResults, CACHE } from "../../../api/_results-core.mjs";

const FIX = JSON.parse(fs.readFileSync(new URL("./__fixtures__/wm2-grades-tb-dal.json", import.meta.url), "utf8"));
const ID = "401872980";
const base = { sport: "nfl", family: "wm2-grades", eventId: ID };
const fresh = () => fsAdapter(fs.mkdtempSync(path.join(os.tmpdir(), "results-store-")));
const T = (m) => `2026-10-09T15:${String(m).padStart(2, "0")}:00Z`;
const body = (finality = "FINAL_PROVISIONAL") => projectWm2Game(FIX, ID, { finality });

test("1–3 · a final game publishes the right frozen run, graded, with GRADED / NO_LINE kept distinct", async () => {
  const b = body();
  assert.equal(b.model.simulationId, "8ca1b01a873fdcda", "the last pregame run");
  assert.equal(b.model.version, "2.1.0");
  assert.deepEqual(b.counts, { graded: 36, pending: 0, noLine: 6 });
  for (const r of b.rows.filter((x) => x.state === "NO_LINE")) assert.ok(!("actual" in r), `${r.name}: NO_LINE is never a zero`);
  const irving = b.rows.find((r) => r.name === "Bucky Irving" && r.family === "rushingYards");
  assert.deepEqual([irving.actual, irving.median, irving.in80], [165, 52, false]);
});

test("4 · PENDING stays distinct when the game is not final", () => {
  const pending = { ...FIX, rows: FIX.rows.map((r) => ({ ...r, state: "PENDING", actual: undefined })) };
  const b = projectWm2Game(pending, ID, { finality: "PENDING" });
  assert.equal(b.counts.pending, 42); assert.ok(b.rows.every((r) => !("actual" in r)));
});

test("5 · versions are immutable: write-once keys, nothing overwritten or deleted", async () => {
  const s = fresh();
  const r1 = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  await assert.rejects(s.put(r1.versionKey, "{}", {}), { code: "EXISTS" }, "the store itself refuses to overwrite a version");
});

test("8 · re-running the same settlement is idempotent: no second version, no pointer churn", async () => {
  const s = fresh();
  const a = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const b = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(5) });
  assert.equal(a.versionKey, b.versionKey); assert.equal(b.versionCreated, false); assert.equal(b.pointerChanged, false);
  assert.equal((await readCurrent(s, base)).publishedAt, T(0), "the manifest was not rewritten");
});

test("9 · an official correction is a NEW traceable version; the old one stays readable", async () => {
  const s = fresh();
  const v1 = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const corrected = body(); corrected.rows.find((r) => r.name === "George Pickens" && r.family === "receivingYards").actual = 128;
  const v2 = await publishResult(s, { ...base, body: corrected, finality: "FINAL_PROVISIONAL", now: T(10) });
  assert.notEqual(v1.versionKey, v2.versionKey);
  const { manifest } = keysFor(base); const m = JSON.parse((await s.get(manifest)).text).events[ID];
  assert.equal(m.current, v2.versionKey); assert.equal(m.supersedes, v1.versionKey); assert.deepEqual(m.versions, [v1.versionKey, v2.versionKey]);
  assert.ok(await s.get(v1.versionKey), "the superseded version is still there");
  // finality promotion with unchanged content moves only the finality, not the version
  const v3 = await publishResult(s, { ...base, body: corrected, finality: "FINAL_CANONICAL", now: T(20) });
  assert.equal(v3.versionKey, v2.versionKey); assert.equal((await readCurrent(s, base)).finality, "FINAL_CANONICAL");
});

test("atomic publication · a failed pointer write leaves the previous current untouched", async () => {
  const s = fresh();
  const v1 = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const corrected = body(); corrected.rows[0].actual = 999;
  s.failNext(keysFor(base).manifest, new Error("store 503"));
  await assert.rejects(publishResult(s, { ...base, body: corrected, finality: "FINAL_PROVISIONAL", now: T(10) }), /503/);
  assert.equal((await readCurrent(s, base)).versionKey, v1.versionKey, "readers still see the last complete publication");
});

test("concurrent writers · compare-and-swap loses no update", async () => {
  const s = fresh();
  await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const other = { sport: "nfl", family: "wm2-grades", eventId: "401872981" };
  const otherBody = { ...body(), providerEventId: "401872981" };
  // a competing writer moves the manifest between this writer's read and write: its first put hits PRECONDITION
  const { manifest } = keysFor(base); const realPut = s.put.bind(s); let raced = false;
  s.put = async (key, text, opts) => {
    if (key === manifest && opts?.ifMatch && !raced) { raced = true; await publishResult({ ...s, put: realPut }, { ...other, body: otherBody, finality: "FINAL_PROVISIONAL", now: T(1) }); }
    return realPut(key, text, opts);
  };
  const corrected = body(); corrected.rows[0].actual = 1;
  await publishResult(s, { ...base, body: corrected, finality: "FINAL_PROVISIONAL", now: T(2) });
  const m = JSON.parse((await s.get(manifest)).text).events;
  assert.ok(m[ID] && m["401872981"], "both writers' events survive");
});

test("rollback · the pointer moves back to a recorded version; nothing is deleted", async () => {
  const s = fresh();
  const v1 = await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const bad = body(); bad.rows[0].actual = 12345;
  const v2 = await publishResult(s, { ...base, body: bad, finality: "FINAL_PROVISIONAL", now: T(5) });
  await rollback(s, { ...base, toKey: v1.versionKey, now: T(6), reason: "bad provider row" });
  const cur = await readCurrent(s, base); assert.equal(cur.versionKey, v1.versionKey);
  assert.ok(await s.get(v2.versionKey), "the rolled-back version is kept for the audit trail");
  await assert.rejects(rollback(s, { ...base, toKey: "results/v1/nfl/wm2-grades/401872980/nope.json", now: T(7) }), /does not exist/);
});

test("11 · the public body carries nothing private: allow-listed fields only", () => {
  const text = canonical(body());
  for (const leak of ["gradedRun", "data/internal", "atLeast", "availability", "ladderBrier", "PRIVATE_RESEARCH", "token", "BLOB_"]) {
    assert.ok(!text.includes(leak), `${leak} must not reach the public result`);
  }
  const allowed = new Set(["playerId", "name", "team", "family", "state", "median", "p10", "p90", "actual", "errorVsMedian", "in80"]);
  for (const r of body().rows) for (const k of Object.keys(r)) assert.ok(allowed.has(k), `row field ${k} is not on the allow-list`);
});

test("12–13 · the read handler names model + version + run, and carries freshness so a cached answer is never 'fresh'", async () => {
  const s = fresh();
  await publishResult(s, { ...base, body: body(), finality: "FINAL_PROVISIONAL", now: T(0) });
  const r = await handleResults({ method: "GET", query: { sport: "nfl", family: "wm2-grades", event: ID } }, s, { now: () => T(30) });
  assert.equal(r.status, 200); assert.equal(r.headers["Cache-Control"], CACHE);
  assert.equal(r.body.model.simulationId, "8ca1b01a873fdcda"); assert.equal(r.body.publication.finality, "FINAL_PROVISIONAL");
  assert.deepEqual([r.body.publication.publishedAt, r.body.publication.servedAt], [T(0), T(30)]);
  assert.match(CACHE, /s-maxage=60/); assert.doesNotMatch(CACHE, /immutable|max-age=[1-9]/, "browsers never keep a result past the CDN window");
});

test("handler refuses what it should: non-GET, unknown family/event, missing result, store outage (→ use the snapshot)", async () => {
  const s = fresh();
  assert.equal((await handleResults({ method: "POST", query: {} }, s)).status, 405);
  assert.equal((await handleResults({ method: "GET", query: { sport: "nfl", family: "../../secrets", event: ID } }, s)).status, 400);
  assert.equal((await handleResults({ method: "GET", query: { sport: "mlb", family: "wm2-grades", event: ID } }, s)).status, 400);
  assert.equal((await handleResults({ method: "GET", query: { sport: "nfl", family: "wm2-grades", event: ID } }, s)).status, 404);
  const broken = { get: async () => { throw new Error("down"); }, put: async () => { throw new Error("down"); } };
  const r = await handleResults({ method: "GET", query: { sport: "nfl", family: "wm2-grades", event: ID } }, broken);
  assert.equal(r.status, 503); assert.equal(r.headers["Cache-Control"], "no-store"); assert.match(r.body.error, /snapshot/);
});

test("the pilot is NOT deployable yet: no api/results.mjs entry, and no token or Blob import reaches client code", () => {
  const APP = process.cwd();
  assert.ok(!fs.existsSync(path.join(APP, "api/results.mjs")), "the function entry waits for founder approval");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(APP, "src")).filter((x) => /\.tsx?$/.test(x))) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!/results-store\/(blob-adapter|core)|@vercel\/blob|BLOB_READ_WRITE_TOKEN/.test(s), `${path.relative(APP, f)} must not import the store or its token`);
  }
});
