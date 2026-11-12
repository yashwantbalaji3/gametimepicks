import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { loadRosterIndex, retainRosterCaptures } from "./roster-index.mjs";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const repo = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), "roster-index-")); fs.mkdirSync(path.join(r, "data/internal/research/nba/rosters"), { recursive: true }); return r; };
const dirOf = (r) => path.join(r, "data/internal/research/nba/rosters");
const cap = (at, n) => JSON.stringify({ artifact: "nba-roster-capture", capturedAt: at, teams: [{ n }] }) + "\n";

test("RETAINED: an overwritten capture is kept by hash and still resolves, labelled as the dated file it was published as", () => {
  const r = repo(), d = dirOf(r);
  const first = cap("2026-11-12T07:07:04Z", 1), second = cap("2026-11-12T14:07:16Z", 2);
  for (const f of ["2026-11-12.json", "latest.json"]) fs.writeFileSync(path.join(d, f), first);
  // the re-capture: retain, then overwrite (capture-nba-rosters.mjs and the window's commit steps)
  assert.deepEqual(retainRosterCaptures(d, ["2026-11-12.json", "latest.json"]), [`2026-11-12.retained-${sha(first)}.json`]);
  assert.deepEqual(retainRosterCaptures(d, ["2026-11-12.json", "latest.json"]), [], "idempotent");
  for (const f of ["2026-11-12.json", "latest.json"]) fs.writeFileSync(path.join(d, f), second);
  const idx = loadRosterIndex(r);
  assert.equal(idx.get(sha(first))?.file, "nba/rosters/2026-11-12.json");
  assert.equal(idx.get(sha(first))?.doc.capturedAt, "2026-11-12T07:07:04Z");
  assert.equal(idx.get(sha(second))?.file, "nba/rosters/2026-11-12.json");
});

test("RETAINED: a retained file whose bytes are not its name's hash resolves nothing; a plain dated file wins the label", () => {
  const r = repo(), d = dirOf(r);
  const a = cap("2026-11-12T07:07:04Z", 1), b = cap("2026-11-12T08:00:00Z", 9);
  fs.writeFileSync(path.join(d, `2026-11-12.retained-${sha(a)}.json`), b); // doctored
  assert.equal(loadRosterIndex(r).get(sha(a)), undefined);
  assert.equal(loadRosterIndex(r).get(sha(b)), undefined);
  fs.writeFileSync(path.join(d, "2026-11-11.json"), a);
  fs.writeFileSync(path.join(d, `2026-11-11.retained-${sha(a)}.json`), a);
  assert.equal(loadRosterIndex(r).get(sha(a)).file, "nba/rosters/2026-11-11.json");
});

test("COMMITTED: every committed retained capture's name is its own sha256 and its capturedAt day", () => {
  const d = path.resolve(process.cwd(), "..", "data/internal/research/nba/rosters");
  const kept = fs.readdirSync(d).filter((f) => /\.retained-/.test(f));
  for (const f of kept) {
    const bytes = fs.readFileSync(path.join(d, f));
    const [, day, h] = /^(\d{4}-\d{2}-\d{2})\.retained-([0-9a-f]{64})\.json$/.exec(f) ?? [];
    assert.equal(h, sha(bytes), f);
    assert.equal(JSON.parse(bytes).capturedAt.slice(0, 10), day, f);
  }
});
