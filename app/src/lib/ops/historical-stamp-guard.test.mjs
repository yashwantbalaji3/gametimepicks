/**
 * The historical stamp guard keeps settled history byte-stable when a re-run only restamps it, and never
 * holds back a real change. Pure decisions, the CLI on a throwaway repository, the workflow wiring, and a
 * replay of the real 2026-10-15 05:24 ET settle commit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { decide, pathDate, etDate, stripStamps, STAMP_KEYS } from "./historical-stamp-guard.mjs";

const APP = process.cwd();
const ROOT = path.dirname(APP);
const J = (o) => `${JSON.stringify(o, null, 1)}\n`;
const TODAY = "2026-10-15";

test("pathDate reads the date a path is about; etDate is the New York calendar day", () => {
  assert.equal(pathDate("app/public/data/parlays/optimizer-graded/2026-05-25.json"), "2026-05-25");
  assert.equal(pathDate("app/public/data/mlb/results/comparison_report_2026-10-14.json"), "2026-10-14");
  assert.equal(pathDate("app/public/data/results/projection/latest.json"), null);
  assert.equal(etDate(new Date("2026-10-15T03:30:00Z")), "2026-10-14", "23:30 ET is still the 14th");
  assert.equal(etDate(new Date("2026-10-15T05:24:00Z")), "2026-10-15");
});

test("stamps only, or a pure re-serialisation, on a past-dated file → restore", () => {
  const head = J({ date: "2026-05-25", generatedAt: "2026-10-14T09:00:00Z", rows: [{ id: 1, outcome: "WIN", gradedAt: "2026-10-14T09:00:01Z" }] });
  const staged = J({ date: "2026-05-25", generatedAt: "2026-10-15T09:28:00Z", rows: [{ id: 1, outcome: "WIN", gradedAt: "2026-10-15T09:28:01Z" }] });
  assert.deepEqual(decide("x/optimizer-graded/2026-05-25.json", "M", head, staged, TODAY), { restore: true, reason: "stamps only" });
  const compact = JSON.stringify(JSON.parse(head));
  assert.equal(decide("x/model-rows/2026-05-25.json", "M", head, compact, TODAY).restore, true, "whitespace/key order only");
  const jl = (g) => ['{"id":1,"gradedAt":"' + g + '","hit":true}', '{"id":2,"gradedAt":"' + g + '","hit":false}'].join("\n") + "\n";
  assert.equal(decide("x/lineage/2026-05-25.jsonl", "M", jl("A"), jl("B"), TODAY).restore, true, "JSONL line by line");
});

test("NEGATIVE CONTROLS: any real change, or anything outside the rule, is published untouched", () => {
  const base = { date: "2026-05-25", generatedAt: "a", rows: [{ id: 1, outcome: "WIN", gradedAt: "a" }] };
  const f = "x/optimizer-graded/2026-05-25.json";
  const keep = (file, status, h, s, today = TODAY) => decide(file, status, h, s, today).restore === false;
  assert.ok(keep(f, "M", J(base), J({ ...base, generatedAt: "b", rows: [{ id: 1, outcome: "LOSS", gradedAt: "b" }] })), "a corrected outcome");
  assert.ok(keep(f, "M", J(base), J({ ...base, rows: [...base.rows, { id: 2, outcome: "WIN", gradedAt: "b" }] })), "a new row");
  assert.ok(keep(f, "M", J(base), J({ ...base, gradedBy: "v2" })), "a new non-stamp key");
  assert.ok(keep(f, "A", null, J(base)), "an added file");
  assert.ok(keep(f, "D", J(base), null), "a deleted file");
  assert.ok(keep("x/results/projection/latest.json", "M", J(base), J({ ...base, generatedAt: "b" })), "undated (a 'latest' file keeps its freshness)");
  assert.ok(keep("x/model-rows/2026-10-15.json", "M", J(base), J({ ...base, generatedAt: "b" })), "today's date");
  assert.ok(keep("x/model-rows/2026-10-16.json", "M", J(base), J({ ...base, generatedAt: "b" })), "a future date");
  assert.ok(keep("x/report_2026-05-25.md", "M", "a", "b"), "not JSON");
  assert.ok(keep(f, "M", "{not json", J(base)), "unparseable → publish");
  // A stamp appearing, disappearing or going null ↔ value is content (readers branch on it): publish.
  assert.ok(keep(f, "M", J({ ...base, rows: [{ id: 1, outcome: "WIN", settledAt: null }] }), J({ ...base, rows: [{ id: 1, outcome: "WIN", settledAt: "2026-10-15T09:00:00Z" }] })), "a backfilled settledAt");
  assert.ok(keep(f, "M", J({ ...base, rows: [{ id: 1, outcome: "WIN" }] }), J({ ...base, rows: [{ id: 1, outcome: "WIN", gradedAt: "x" }] })), "an added gradedAt");
  assert.ok(keep(f, "M", J({ ...base, rows: [{ id: 1, outcome: "WIN", gradedAt: "x" }] }), J({ ...base, rows: [{ id: 1, outcome: "WIN" }] })), "a removed gradedAt");
  // Stamp names are matched exactly, never by suffix: a field merely ending in "At" is content.
  assert.ok(keep(f, "M", J({ ...base, kickoffAt: "x" }), J({ ...base, kickoffAt: "y" })), "kickoffAt is content");
  assert.deepEqual(STAMP_KEYS, ["gradedAt", "generatedAt", "settledAt", "checkedAt", "builtAt", "lastRunAt", "updatedAt"]);
  assert.deepEqual(stripStamps({ a: 1, gradedAt: 2, nested: [{ settledAt: 3, b: 4 }] }), { a: 1, nested: [{ b: 4 }] });
});

test("CLI on a real git repository: restores exactly the stamp-only historical files and leaves the rest staged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-guard-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  const script = path.join(APP, "scripts", "ops", "historical-stamp-guard.mjs");
  try {
    g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
    const old = { date: "2026-05-25", generatedAt: "2026-10-14T09:00:00Z", rows: [{ id: 1, outcome: "WIN", gradedAt: "2026-10-14T09:00:01Z" }] };
    w("hist/2026-05-25.json", J(old)); w("hist/2026-05-26.json", J(old)); w("latest.json", J(old)); w("hist/2026-10-15.json", J(old));
    g("add", "-A"); g("commit", "-q", "-m", "base");
    const restamp = { ...old, generatedAt: "2026-10-15T09:28:00Z", rows: [{ ...old.rows[0], gradedAt: "2026-10-15T09:28:01Z" }] };
    w("hist/2026-05-25.json", J(restamp));                                                   // stamps only → restore
    w("hist/2026-05-26.json", J({ ...restamp, rows: [{ ...restamp.rows[0], outcome: "LOSS" }] })); // real → keep
    w("latest.json", J(restamp));                                                            // undated → keep
    w("hist/2026-10-15.json", J(restamp));                                                   // today → keep
    w("hist/2026-05-27.json", J(restamp));                                                   // added → keep
    g("add", "-A");
    const dry = spawnSync(process.execPath, [script, "--dry-run", "--today", TODAY], { cwd: dir, encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /would restore 1 dated file/);
    assert.equal(g("diff", "--cached", "--name-only").split("\n").filter(Boolean).length, 5, "--dry-run touches nothing");
    const r = spawnSync(process.execPath, [script, "--today", TODAY], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /restored 1 dated file/);
    const staged = g("diff", "--cached", "--name-only").split("\n").filter(Boolean).sort();
    assert.deepEqual(staged, ["hist/2026-05-26.json", "hist/2026-05-27.json", "hist/2026-10-15.json", "latest.json"]);
    assert.equal(fs.readFileSync(path.join(dir, "hist/2026-05-25.json"), "utf8"), J(old), "the committed bytes are back in the working tree too");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("wiring: nightly-settle runs the guard after staging and before the nothing-to-commit check, and a failure never blocks the publish", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "nightly-settle.yml"), "utf8");
  const guard = wf.indexOf("node app/scripts/ops/historical-stamp-guard.mjs");
  const lastAdd = wf.lastIndexOf("git add app/public/data/research/");
  const check = wf.indexOf('if git diff --staged --quiet; then\n            echo "No settled-data changes');
  assert.ok(guard > 0 && lastAdd > 0 && check > 0, "guard, last allowlist line and the staged check are all present");
  assert.ok(lastAdd < guard && guard < check, "staged → guard → nothing-to-commit check");
  assert.match(wf.slice(guard, check), /\|\| echo "::warning::historical-stamp-guard/, "a guard failure warns and publishes as before");
});

test("REPLAY: the real 2026-10-15 05:24 ET settle commit — history restamps restored, every real change kept", (t) => {
  const C = "25c05f10d5";
  const has = spawnSync("git", ["cat-file", "-e", `${C}^{commit}`], { cwd: ROOT }).status === 0;
  if (!has) { t.skip(`commit ${C} not in this clone`); return; }
  const g = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 30 });
  const show = (s) => { try { return g("show", s); } catch { return null; } };
  const rows = g("show", "--format=", "--name-status", "--no-renames", C).split("\n").filter(Boolean).map((l) => { const [s, ...p] = l.split("\t"); return { s: s[0], f: p[p.length - 1] }; });
  let restored = 0; const kept = [];
  for (const { s, f } of rows) {
    if (!/\.jsonl?$/.test(f)) continue;
    const d = decide(f, s, show(`${C}^:${f}`), show(`${C}:${f}`), "2026-10-15");
    if (d.restore) restored++; else if (d.reason === "content changed") kept.push(f);
  }
  assert.ok(restored >= 380, `expected ~386 restamped historical files, got ${restored}`);
  for (const f of ["app/public/data/results/projection/latest.json", "app/public/data/parlays/lab-ledger.json", "app/public/data/mlb/statsapi-schedule/2026-10-15.json"]) {
    const r = rows.find((x) => x.f === f);
    assert.ok(r, `${f} is in the commit`);
    assert.equal(decide(f, r.s, show(`${C}^:${f}`), show(`${C}:${f}`), "2026-10-15").restore, false, `${f} must still publish`);
  }
});
