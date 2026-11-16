/**
 * The evidence reader is quiet only for an uncovered event; a broken or stale file is LOUD (a build warning).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/player-evidence-file.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORPUS_REL, EVIDENCE_REL, loadEvidenceFile } from "./player-evidence-file.mjs";
import { EVIDENCE_SCHEMA } from "./player-evidence.mjs";

function root(evidence, corpus) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-evidence-"));
  for (const [rel, body] of [[EVIDENCE_REL, evidence], [CORPUS_REL, corpus]]) {
    if (body == null) continue;
    fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
    fs.writeFileSync(path.join(r, rel), typeof body === "string" ? body : JSON.stringify(body));
  }
  return r;
}
const doc = (hash) => ({ schema: EVIDENCE_SCHEMA, source: { artifact: "player-events-v1", contentHash: hash }, events: { e1: { players: { p: [] } } } });

test("missing, unparseable and wrong-schema files are named problems; a usable file has none", () => {
  assert.match(loadEvidenceFile(root(null, null)).problem, /^missing/);
  assert.match(loadEvidenceFile(root("{not json", null)).problem, /^unparseable JSON/);
  assert.match(loadEvidenceFile(root({ schema: "other@1" }, null)).problem, /^schema mismatch/);
  const ok = loadEvidenceFile(root(doc("h1"), { contentHash: "h1" }));
  assert.equal(ok.problem, null);
  assert.equal(ok.stale, null);
});

test("a file built from an older corpus is served but flagged stale; an unreadable corpus is flagged too", () => {
  const s = loadEvidenceFile(root(doc("old"), { contentHash: "new" }));
  assert.equal(s.problem, null, "still usable: every entry is a real game before its kickoff");
  assert.match(s.stale, /built from corpus old, .* is now new/);
  assert.match(loadEvidenceFile(root(doc("old"), null)).stale, /unreadable/);
});

test("readEvidenceFor warns once per root, by name, and stays quiet for an uncovered event", async () => {
  const { readEvidenceFor } = await import("./player-evidence-file.mjs");
  const warn = console.warn, seen = [];
  console.warn = (m) => seen.push(String(m));
  try {
    const bad = root(null, null);
    assert.deepEqual(readEvidenceFor(bad, "e1"), {});
    assert.deepEqual(readEvidenceFor(bad, "e2"), {});
    assert.equal(seen.length, 1);
    assert.ok(seen[0].includes(EVIDENCE_REL) && /missing/.test(seen[0]));
    const good = root(doc("h"), { contentHash: "h" });
    assert.deepEqual(readEvidenceFor(good, "e1"), { p: [] });
    assert.deepEqual(readEvidenceFor(good, "nope"), {});
    assert.equal(seen.length, 1, "a covered file and an uncovered event add no warning");
  } finally { console.warn = warn; }
});
