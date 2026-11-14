/**
 * Forecast versioning (P0D) · the append-only version chain, exercised on tonight's committed BOS @ TOR replay
 * (2026-11-11: Paul George Out 17:55Z, game-flagged by the 18:18Z capture) — v1 is the frozen lane game by back-reference.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendStaleFlags, detectClearEvents, detectStaleEvents, nbaCandidates, postAllowed, activeFlags } from "./stale-flags.mjs";
import { appendVersion, coalesceReady, currentVersion, currentVersionsMap, FORECAST_VERSIONS_SCHEMA, initialChain, versionOfRecord } from "./forecast-versions.mjs";

const FX = path.join(process.cwd(), "src/lib/availability/__fixtures__/stale-flags-2026-11-11");
const read = (f) => JSON.parse(fs.readFileSync(path.join(FX, f), "utf8"));
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const BOS_TOR = "401909968", GEORGE = "4251";
const VALIDATED = { id: "nba-official-v0.1", status: "VALIDATED" };

function setup() {
  const lane = read("lane-2026-11-11.json");
  const game = lane.games.find((g) => String(g.providerEventId) === BOS_TOR);
  const candidates = nbaCandidates(lane, sha);
  let flags = null;
  for (const f of fs.readdirSync(FX).filter((x) => /^nba-injuries-.*\.json$/.test(x)).sort()) { const cap = read(f); flags = appendStaleFlags(flags, detectStaleEvents(candidates, cap), { sport: "nba", date: "2026-11-11", capturedAt: cap.sourceAsOf }); }
  const chain = initialChain({ sport: "nba", date: "2026-11-11", eventId: BOS_TOR, startUtc: game.tipUtc, forecastSha256: sha(game), frozenAt: game.frozenAt, method: VALIDATED, payloadRef: `app/public/data/nba/experimental-public/2026-11-11.json#${BOS_TOR}` });
  const george = flags.events.find((e) => e.playerId === GEORGE);
  return { game, candidates, flags, chain, george };
}

test("v1 by back-reference: its versionId IS the sha the stale flag judged; nothing frozen moves", () => {
  const { chain, george, game } = setup();
  assert.equal(chain.schema, FORECAST_VERSIONS_SCHEMA);
  assert.equal(chain.versions[0].versionId, george.forecastSha256);
  assert.equal(currentVersion(chain, game.tipUtc).version.version, 1);
  assert.equal(currentVersion(chain, "2026-11-11T00:00:00Z").version, null, "nothing is current before v1 was approved");
});

test("a material event → WITHHELD (no current number, never the older one shown as current) → a validated re-run is current and clears the flag", () => {
  const { chain, george, flags, candidates } = setup();
  const w = appendVersion(chain, { state: "WITHHELD", reason: "Paul George ruled out after this forecast; forecast being re-run", createdAt: george.detectedAt, approvedAt: george.detectedAt, answers: [george.key] });
  assert.equal(w.appended, true);
  const cur = currentVersion(w.chain, "2026-11-11T18:30:00Z");
  assert.equal(cur.version, null);
  assert.match(cur.withheld.reason, /Paul George/);
  assert.equal(postAllowed(flags, { sport: "nba", eventId: BOS_TOR, playerIds: [], gameLevel: true }).allowed, false, "game-level posts stay refused while withheld");

  const v2sha = "a".repeat(64);
  const p = appendVersion(w.chain, { state: "PUBLISHED", versionId: v2sha, createdAt: "2026-11-11T18:34:00Z", approvedAt: "2026-11-11T18:35:00Z", method: VALIDATED, answers: [george.key] });
  assert.equal(p.appended, true, "the re-run answers the keys its WITHHELD predecessor named");
  assert.deepEqual(p.chain.versions.map((v) => [v.version, v.state, v.supersedes?.slice(0, 8) ?? null]), [[1, "PUBLISHED", null], [2, "WITHHELD", george.forecastSha256.slice(0, 8)], [3, "PUBLISHED", george.forecastSha256.slice(0, 8)]]);
  assert.equal(currentVersion(p.chain, "2026-11-11T18:40:00Z").version.versionId, v2sha);
  assert.deepEqual(p.chain.versions.slice(0, 2), w.chain.versions, "append-only: earlier records are untouched");

  const map = currentVersionsMap([p.chain], "2026-11-11T18:40:00Z");
  const clears = detectClearEvents(flags, { sourceAsOf: "2026-11-11T18:53:00Z", entries: [] }, candidates, map);
  assert.deepEqual(clears.filter((c) => c.eventId === BOS_TOR).map((c) => [c.reason, c.playerId]), [["NEWER_VERSION", GEORGE]]);
  const after = appendStaleFlags(flags, clears, { sport: "nba", date: "2026-11-11", capturedAt: "2026-11-11T18:53:00Z" });
  assert.equal(activeFlags(after).some((e) => e.key === george.key), false);
});

test("refusals: experimental method, identical payload, already answered, at/after the cutoff, out of order", () => {
  const { chain, george, game } = setup();
  const base = { state: "PUBLISHED", versionId: "b".repeat(64), createdAt: "2026-11-11T18:30:00Z", approvedAt: "2026-11-11T18:31:00Z", method: VALIDATED, answers: [george.key] };
  assert.equal(appendVersion(chain, { ...base, method: { id: "nba-sim-v1-availability-margin", status: "EXPERIMENTAL" } }).reason, "NOT_VALIDATED");
  assert.equal(appendVersion(chain, { ...base, versionId: george.forecastSha256 }).reason, "IDENTICAL");
  const ok = appendVersion(chain, base);
  assert.equal(ok.appended, true);
  assert.equal(appendVersion(ok.chain, { ...base, versionId: "c".repeat(64), createdAt: "2026-11-11T18:40:00Z", approvedAt: "2026-11-11T18:41:00Z" }).reason, "ALREADY_ANSWERED");
  const cutoff = new Date(Date.parse(game.tipUtc) - 15 * 60000).toISOString();
  assert.equal(appendVersion(chain, { ...base, createdAt: cutoff, approvedAt: cutoff }).reason, "CUTOFF");
  assert.equal(appendVersion(chain, { ...base, createdAt: "2026-11-11T18:32:00Z" }).reason, "ORDER");
  assert.equal(appendVersion(chain, { ...base, createdAt: "2026-11-11T05:00:00Z", approvedAt: "2026-11-11T05:00:00Z" }).reason, "ORDER", "before v1's approval");
});

test("version of record = current at start − 15 min, fixed once the cutoff passes; a chain ending WITHHELD has none (excluded with the reason)", () => {
  const { chain, george } = setup();
  assert.equal(versionOfRecord(chain).version.version, 1, "no new version ⇒ the frozen forecast is the version of record (today's rule)");
  const w = appendVersion(chain, { state: "WITHHELD", reason: "re-run pending", createdAt: george.detectedAt, approvedAt: george.detectedAt, answers: [george.key] }).chain;
  const r = versionOfRecord(w);
  assert.equal(r.version, null);
  assert.equal(r.withheld.reason, "re-run pending");
});

test("ceiling backstop: more PUBLISHED versions than 1 + answered events is refused", () => {
  const { chain, george } = setup();
  const loop = { ...chain, versions: [...chain.versions, { ...chain.versions[0], version: 2, versionId: "d".repeat(64), approvedAt: "2026-11-11T18:20:00Z", trigger: { type: "MATERIAL_STALE_EVENT", answers: [george.key] } }] };
  const r = appendVersion(loop, { state: "PUBLISHED", versionId: "e".repeat(64), createdAt: "2026-11-11T18:30:00Z", approvedAt: "2026-11-11T18:31:00Z", method: VALIDATED, answers: ["nba:x:1:out:2026-11-11T18:25Z"] });
  assert.equal(r.appended, true, "a new event allows one more");
  const r2 = appendVersion({ ...r.chain, versions: [...r.chain.versions, { ...r.chain.versions.at(-1), version: 4, versionId: "f".repeat(64), approvedAt: "2026-11-11T18:32:00Z", trigger: { type: "MATERIAL_STALE_EVENT", answers: [] } }] }, { state: "PUBLISHED", versionId: "9".repeat(64), createdAt: "2026-11-11T18:33:00Z", approvedAt: "2026-11-11T18:34:00Z", method: VALIDATED, answers: ["nba:x:2:out:2026-11-11T18:30Z"] });
  assert.equal(r2.reason, "CEILING");
});

test("coalescing: wait 15 min after the last material event, or until a later capture shows none (Turner 19:03Z + Grimes 19:06Z → one candidate)", () => {
  const pending = [{ detectedAt: "2026-11-11T19:47:23Z" }, { detectedAt: "2026-11-11T19:47:23Z" }];
  assert.equal(coalesceReady({ pending, latestCaptureAt: "2026-11-11T19:47:23Z", nowIso: "2026-11-11T19:50:00Z" }), false);
  assert.equal(coalesceReady({ pending, latestCaptureAt: "2026-11-11T19:52:23Z", nowIso: "2026-11-11T19:52:30Z" }), true, "a quiet later capture closes the window");
  assert.equal(coalesceReady({ pending, latestCaptureAt: "2026-11-11T19:47:23Z", nowIso: "2026-11-11T20:02:23Z" }), true);
  assert.equal(coalesceReady({ pending: [], latestCaptureAt: "x", nowIso: "2026-11-11T20:02:23Z" }), false);
});

test("deterministic: the same inputs give byte-identical chains (no wall-clock field)", () => {
  const a = setup(), b = setup();
  const step = (s) => appendVersion(s.chain, { state: "WITHHELD", reason: "r", createdAt: s.george.detectedAt, approvedAt: s.george.detectedAt, answers: [s.george.key] }).chain;
  assert.equal(JSON.stringify(step(a)), JSON.stringify(step(b)));
});

test("the writer reads chains from --versions-dir: a newer approved version clears its flag by an appended NEWER_VERSION event", async () => {
  const os = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const { chain, george } = setup();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forecast-versions-"));
  try {
    fs.mkdirSync(path.join(tmp, "app/public/data/nba/experimental-public"), { recursive: true });
    fs.copyFileSync(path.join(FX, "lane-2026-11-11.json"), path.join(tmp, "app/public/data/nba/experimental-public/2026-11-11.json"));
    const script = path.join(process.cwd(), "scripts/availability/build-stale-flags.mjs");
    const run = (cap, extra = []) => execFileSync("node", [script, "--sport", "nba", "--date", "2026-11-11", "--root", tmp, "--capture", path.join(FX, cap), "--now", read(cap).sourceAsOf, "--no-alert", ...extra], { encoding: "utf8", stdio: "pipe" });
    run("nba-injuries-20261111T1818Z.json");
    const dir = path.join(tmp, "versions");
    fs.mkdirSync(dir);
    const v2 = appendVersion(chain, { state: "PUBLISHED", versionId: "a".repeat(64), createdAt: "2026-11-11T18:29:00Z", approvedAt: "2026-11-11T18:30:00Z", method: VALIDATED, answers: [george.key] }).chain;
    fs.writeFileSync(path.join(dir, `${BOS_TOR}.json`), JSON.stringify(v2));
    run("nba-injuries-20261111T1853Z.json", ["--versions-dir", dir]);
    const out = JSON.parse(fs.readFileSync(path.join(tmp, "app/public/data/nba/stale-flags/2026-11-11.json"), "utf8"));
    assert.deepEqual(out.events.filter((e) => e.type === "clear").map((e) => [e.reason, e.clears]), [["NEWER_VERSION", george.key]]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
