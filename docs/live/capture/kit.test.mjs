// Offline self-test for the capture kit. No request leaves the machine: both bases point at a closed local port,
// git fetch and GitHub lookups are off. Run from the repo root:  node --test docs/live/capture/kit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-kit-"));
const run = (args, env = {}) => spawnSync("sh", [path.join(HERE, "capture.sh"), ...args], {
  encoding: "utf8", timeout: 120_000,
  env: { ...process.env, GTP_BASE: "http://127.0.0.1:9", ESPN_BASE: "http://127.0.0.1:9", NO_FETCH: "1", GH_DEPLOYMENTS: "0", GTP_REPO: REPO, ...env },
});

test("refuses to run without events and a settle date (no hard-coded event)", () => {
  assert.equal(run(["--once"]).status, 2);
  assert.equal(run(["--once", "--events", "401872995"]).status, 2);
  assert.equal(run(["--once", "--events", "40187x", "--settle-date", "2026-10-15"]).status, 2);
  assert.equal(run(["--events", "401872995", "--settle-date", "2026-10-15"]).status, 2, "--until/--settle-until required without --once");
});

test("--once: a failed request is a VALID JSON line with http 0 and an error; one pass; report written", () => {
  const out = tmp();
  const r = run(["--once", "--no-shots", "--events", "401872995,401872996", "--settle-date", "2026-10-15", "--out", out, "--mirror", "none"]);
  assert.equal(r.status, 0, r.stderr);
  const raw = fs.readFileSync(path.join(out, "captures.jsonl"), "utf8").split("\n").filter(Boolean);
  const lines = raw.map((l) => JSON.parse(l)); // throws on any malformed line
  const reqs = lines.filter((l) => typeof l.http !== "undefined");
  assert.equal(reqs.length, 3 + 2 * 3, "3 shared + 3 per event");
  for (const q of reqs) {
    assert.equal(q.http, 0);
    assert.equal(typeof q.http, "number");
    assert.match(q.error, /^curl exit \d+/);
  }
  assert.deepEqual(reqs.filter((q) => q.name === "event").map((q) => q.event), ["401872995", "401872996"]);
  assert.ok(reqs.every((q) => !/000/.test(JSON.stringify(q.http))));
  assert.equal(lines.filter((l) => l.name === "pass").length, 1);
  const sett = lines.filter((l) => l.name === "settlement");
  assert.deepEqual(sett.map((s) => s.event), ["401872995", "401872996"]);
  assert.ok(lines.some((l) => l.name === "finished"));
  assert.deepEqual(lines.find((l) => l.name === "start").events, ["401872995", "401872996"]);
  const report = fs.readFileSync(path.join(out, "REPORT.md"), "utf8");
  assert.match(report, /NO response from any host, ESPN included/);
  assert.ok(fs.existsSync(path.join(out, `${lines[1].t}-frozen-401872995.txt`)));
});

test("report tolerates the 2026-10-15 kit's malformed lines and never crashes on garbage", () => {
  const dir = tmp();
  const t = "20261016T101245Z";
  fs.writeFileSync(path.join(dir, "captures.jsonl"), [
    '{"t":"2026-10-15T23:15:16Z","name":"start","interval":300,"until":"2026-10-16T05:00:00Z","settleUntil":"2026-10-17T02:00:00Z"}',
    `{"t":"${t}","name":"slate","http":000,"bytes":0,"file":"${t}-slate.json","mitigated":""}`,
    `{"t":"${t}","name":"event","http":000,"bytes":0,"file":"${t}-event.json","mitigated":""}`,
    `{"t":"${t}","name":"espn-summary","http":000,"bytes":0,"file":"${t}-espn.json","mitigated":""}`,
    `{"t":"${t}","name":"settlement","state":"pending","settlementCommit":"","deployed":"","served":"no"}`,
    "this is not json {",
  ].join("\n") + "\n");
  const r = spawnSync("node", [path.join(HERE, "report.mjs"), dir, "401872995"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 malformed captures\.jsonl line\(s\)/);
  assert.match(r.stdout, /line 6 unparseable/);
  assert.match(r.stdout, /local connectivity loss/);
  assert.match(r.stdout, /did not record a finish or a signal/);
});

test("settle-and-served stop: two consecutive passes with the canonical commit served end Phase B (SEA@DEN, offline)", (t) => {
  const has = spawnSync("git", ["-C", REPO, "cat-file", "-e", "3122bf3f3c6d01d0023d1e98f0c0f3a009e960dc"]).status === 0;
  if (!has) { t.skip("the SEA@DEN canonical commit is not in this clone"); return; }
  const base = tmp();
  fs.mkdirSync(path.join(base, "data"));
  const main = spawnSync("git", ["-C", REPO, "rev-parse", "origin/main"], { encoding: "utf8" }).stdout.trim();
  fs.writeFileSync(path.join(base, "data/build-info.json"), JSON.stringify({ commit: { sha: main } }));
  const out = tmp();
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const r = run(["--events", "401872995", "--settle-date", "2026-10-15", "--until", iso(Date.now() - 3600e3), "--settle-until", iso(Date.now() + 600e3),
    "--no-shots", "--out", out, "--mirror", "none"], { GTP_BASE: `file://${base}`, PHASE_B_INTERVAL: "1" });
  assert.equal(r.status, 0, r.stderr);
  const lines = fs.readFileSync(path.join(out, "captures.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sett = lines.filter((l) => l.name === "settlement");
  assert.equal(sett.length, 2);
  for (const s of sett) {
    assert.equal(s.canonicalCommit, "3122bf3f3c6d01d0023d1e98f0c0f3a009e960dc");
    assert.equal(s.provisionalCommit, "af35921ef8d86d7e5601bee1384db07ed9aa0df9");
    assert.equal(s.servedCanonical, true);
    assert.equal(s.market, "pending:NO_TARGETS");
    assert.equal(s.ledger.noMeasurementWithValue, 0);
  }
  assert.ok(lines.some((l) => l.name === "settled-and-served"));
  assert.ok(lines.some((l) => l.name === "finished"));
});
