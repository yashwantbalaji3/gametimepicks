import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { loadRosterIndex, retainRosterCaptures, retainedFilesFor } from "./roster-index.mjs";

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
  // the forecast window's commit step runs AFTER the capture step already retained the file: it must still be told
  // which file to stage (2026-11-13: staging only "newly written" files left the retained copy out of every commit)
  assert.deepEqual(retainedFilesFor(d, ["latest.json", "2026-11-12.json"]), [`2026-11-12.retained-${sha(first)}.json`], "an already-retained capture is still reported for staging, once");
  assert.deepEqual(retainedFilesFor(d, ["2026-11-30.json"]), [], "a capture that does not exist reports nothing");
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

test("FROZEN RECEIPTS: every official v0.1 receipt of a published lane date resolves its roster sha256 to committed bytes (fails on 2026-11-12 without retention)", () => {
  const repo = path.resolve(process.cwd(), "..");
  const idx = loadRosterIndex(repo);
  const laneDates = new Set(fs.readdirSync(path.join(process.cwd(), "public/data/nba/experimental-public")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)));
  const dir = path.join(repo, "data/internal/research/nba/experimental-v0.1/forecasts");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x) && laneDates.has(x.slice(0, 10)))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).games ?? []) {
      const want = g.receipt?.inputs?.rosters?.sha256;
      if (!want) continue;
      n += 1;
      assert.ok(idx.has(want), `${f} ${g.providerEventId}: roster ${want.slice(0, 12)} resolves`);
    }
  }
  assert.ok(n >= 60, `checked ${n} receipts`);
  // both 11-12 captures stay addressable: the 07:07Z one the receipts pin, and the 14:07Z re-capture
  assert.equal(idx.get("3e4437a7c24c418449d5913f97c303986e67000140119ba5e5cb9cf1d0f55d50")?.doc.capturedAt, "2026-11-12T07:07:04Z");
});
