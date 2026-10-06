/**
 * ROW LINEAGE · PROVIDER EVENT MISMATCH (2026-10-05) — guards for the fail-closed reading of mis-joined archive rows.
 *
 *  MJ1  oracle: for one file of each class in MLB's 2026-10-05 scan, the loader rejects exactly the foreign
 *       provider events the scan lists, and keeps every own-event row
 *  MJ2  a foreign row is never evidence; an own row always is; an undatable file proves no mismatch
 *  MJ3  the alias receipt admits exactly (foreign id → its one gamePk); ambiguity and a foreign schema admit nothing
 *  MJ4  loadArchiveIndex excludes every foreign row and every row of an own-unverified file, and writes no archive file
 *  MJ6  only the 74 founder-approved aliases can return (Strict 74); the 3 unconfirmed ids never do, whatever a receipt says
 *  MJ5  a file whose OWN event is shared with another game vouches for nothing (MLB's 07-22/822784 ⇄ 07-23/822785)
 *
 * Run: npx tsx --test src/lib/research/row-lineage-misjoin.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { APPROVED_PROVIDER_EVENT_ALIASES, EXCLUDED_UNCONFIRMED_PROVIDER_EVENT_ALIASES } from "./approved-provider-event-aliases.ts";
import { approvedReadmissions, loadArchiveIndex, loadProviderEventReceipt, rowBelongsToFile, sharedOwnProviderEvents } from "./row-lineage-loader.ts";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.join(APP, "..");
const NO_ALIASES = new Map();
const readJoin = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

/* One file per class, copied from MLB's read-only scan (/mnt/project-files/mlb/doubleheader-misjoins.json, originMain
   8df980fdd). The scan's classification is not used by the loader — it is the oracle the loader's rule must agree with. */
const SCAN_EXCERPT = [
  { cls: "UNKNOWN_EVENT_START", file: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-22/822784.json", own: "36ba7a8a8c46e8cc308c1dd037995889", foreign: ["267dae014ac02839048da8da0bf226c3", "b6df72e0280eb235fcca22cc3d3fc1ab"] },
  { cls: "DIFFERENT_DAY", file: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-24/824248.json", own: "6b06a4bf25ee92a7ac908981664ca759", foreign: ["74d637de5babda95c445e8cf11c32a15"] },
  { cls: "SAME_DAY_OTHER_START", file: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-28/822703.json", own: "00cfd9daf945b43d83d13223ae65d32d", foreign: ["652c3471321a108cc9222b8e5b773ad2"] },
  { cls: "SAME_START_LIKELY_SAME_GAME", file: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-28/822949.json", own: "f7a4edfc8ce302460d9f8c40851ca78b", foreign: ["1c02a0524bf42a304b0b1cf019ea12c8"] },
];

test("MJ1 the loader's rule rejects exactly the scan's foreign events, one file per class", () => {
  for (const e of SCAN_EXCERPT) {
    const join = readJoin(e.file);
    assert.equal(join.providerEventId, e.own, `${e.cls}: own provider event`);
    const rejected = new Set();
    let kept = 0;
    for (const r of join.marketRows ?? []) {
      if (rowBelongsToFile(r.providerEventId, { ...join, ownEventUnverified: false }, NO_ALIASES)) { kept += 1; assert.ok(!r.providerEventId || r.providerEventId === e.own); }
      else rejected.add(r.providerEventId);
    }
    assert.deepEqual([...rejected].sort(), [...e.foreign].sort(), `${e.cls}: rejected ids`);
    assert.ok(kept + [...rejected].length > 0, `${e.cls}: non-vacuous`);
  }
});

test("MJ2 foreign rows are never evidence; own rows always are; a file with no own id proves no mismatch", () => {
  const file = { providerEventId: "own", gamePk: 1 };
  assert.equal(rowBelongsToFile("own", file, NO_ALIASES), true);
  assert.equal(rowBelongsToFile("other", file, NO_ALIASES), false);
  assert.equal(rowBelongsToFile(null, file, NO_ALIASES), true);
  assert.equal(rowBelongsToFile("other", { providerEventId: null, gamePk: 1 }, NO_ALIASES), true);
  const unverified = { ...file, ownEventUnverified: true };
  assert.equal(rowBelongsToFile("own", unverified, NO_ALIASES), false, "an unverified file's own-id row is not evidence");
  assert.equal(rowBelongsToFile(null, unverified, NO_ALIASES), false, "nor is its id-less row");
  assert.equal(rowBelongsToFile("other", unverified, new Map([["other", "1"]])), true, "only a proven alias gets in");
});

test("MJ3 receipt: exact (foreign id → gamePk) only; ambiguous or foreign-schema receipts admit nothing; absent = none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-alias-"));
  const write = (doc) => { const p = path.join(dir, `${crypto.randomUUID()}.json`); fs.writeFileSync(p, JSON.stringify(doc)); return p; };
  const SCHEMA = "mlb-provider-event-aliases-1";
  const file = { providerEventId: "own", gamePk: 822949 };

  const ok = loadProviderEventReceipt(write({ schemaVersion: SCHEMA, aliases: [{ foreignProviderEventId: "reissued", gamePk: 822949 }],
    ownEventUnverified: [{ joinFile: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-22/822873.json" }] }));
  assert.equal(rowBelongsToFile("reissued", file, ok.aliases), true, "a proven alias is admitted for its gamePk");
  assert.equal(rowBelongsToFile("reissued", { ...file, gamePk: 822950 }, ok.aliases), false, "…and for no other gamePk");
  assert.equal(rowBelongsToFile("unlisted", file, ok.aliases), false);
  assert.ok(ok.ownEventUnverified.has("data/internal/mlb/pregame-archive/settlement-joins/2026-07-22/822873.json"));

  const ambiguous = loadProviderEventReceipt(write({ schemaVersion: SCHEMA, aliases: [{ foreignProviderEventId: "x", gamePk: 1 }, { foreignProviderEventId: "x", gamePk: 2 }] }));
  assert.equal(ambiguous.aliases.size, 0, "an id aliased to two games resolves to nothing");

  const other = loadProviderEventReceipt(write({ schemaVersion: "mlb-provider-event-aliases-2", aliases: [{ foreignProviderEventId: "reissued", gamePk: 822949 }] }));
  assert.equal(other.aliases.size, 0);
  assert.equal(loadProviderEventReceipt(path.join(dir, "missing.json")).aliases.size, 0);
});

test("MJ4 loadArchiveIndex excludes every foreign row on a mis-joined date except approved aliases, and never changes an archive file", () => {
  for (const date of ["2026-07-28", "2026-08-03"]) {
    const dir = path.join(REPO, "data/internal/mlb/pregame-archive/settlement-joins", date);
    const hash = () => fs.readdirSync(dir).sort().map((f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("");
    const shared = sharedOwnProviderEvents();
    // With no receipt in the repo nothing is re-admitted; with MLB's receipt, only the approved pairs it also names.
    const readmit = approvedReadmissions(loadProviderEventReceipt().aliases);
    let expected = 0;
    let unverified = 0;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const bad = !!j.providerEventId && shared.has(j.providerEventId);
      for (const r of j.marketRows ?? []) {
        if (r.providerEventId && j.providerEventId && r.providerEventId !== j.providerEventId) {
          if (readmit.get(r.providerEventId) !== String(j.gamePk)) expected += 1;
        } else if (bad) unverified += 1;
      }
    }
    const before = hash();
    const idx = loadArchiveIndex(date);
    assert.ok(expected > 0, `${date}: the fixture date carries excluded mis-joined rows (non-vacuous)`);
    assert.equal(idx.foreignRowsExcluded, expected, `${date}: foreign rows excluded`);
    assert.ok(idx.unverifiedOwnRowsExcluded >= unverified, `${date}: every own row of a shared-id file is excluded`);
    assert.equal(hash(), before, `${date}: no archive file was modified`);
  }
});

test("MJ5 a file whose own event is another game's own event vouches for nothing", () => {
  const shared = sharedOwnProviderEvents();
  assert.ok(shared.has("36ba7a8a8c46e8cc308c1dd037995889"), "MLB's example: 07-22/822784 and 07-23/822785 both claim it");
  const a = readJoin("data/internal/mlb/pregame-archive/settlement-joins/2026-07-22/822784.json");
  const b = readJoin("data/internal/mlb/pregame-archive/settlement-joins/2026-07-23/822785.json");
  assert.equal(a.providerEventId, b.providerEventId);
  assert.notEqual(String(a.gamePk), String(b.gamePk));
  for (const j of [a, b]) {
    const subject = { providerEventId: j.providerEventId, gamePk: j.gamePk, ownEventUnverified: shared.has(j.providerEventId) };
    const kept = (j.marketRows ?? []).filter((r) => rowBelongsToFile(r.providerEventId, subject, NO_ALIASES));
    assert.equal(kept.length, 0, `${j.gamePk}: no row of a shared-id file is evidence without an alias`);
  }
  assert.ok(shared.size >= 100, `shared own ids found by the archive itself: ${shared.size}`);
});

const UNCONFIRMED = EXCLUDED_UNCONFIRMED_PROVIDER_EVENT_ALIASES;

test("MJ6 Strict 74: only founder-approved pairs return; the 3 unconfirmed ids stay out whatever a receipt says", () => {
  // The approved list itself: 74 distinct ids, one gamePk each, none of them the 3 unconfirmed.
  assert.equal(APPROVED_PROVIDER_EVENT_ALIASES.length, 74, "Yash 2026-10-06 00:31Z approved exactly 74");
  assert.equal(new Set(APPROVED_PROVIDER_EVENT_ALIASES.map(([id]) => id)).size, 74, "no id listed twice");
  assert.equal(UNCONFIRMED.length, 3);
  for (const [id] of UNCONFIRMED) assert.ok(!APPROVED_PROVIDER_EVENT_ALIASES.some(([a]) => a === id), `${id} is not approved`);

  // A receipt that names everything: all 74, the 3 unconfirmed, one unapproved id, and one approved id moved to another game.
  const [movedId, movedPk] = APPROVED_PROVIDER_EVENT_ALIASES[0];
  const receipt = new Map([
    ...APPROVED_PROVIDER_EVENT_ALIASES.slice(1).map(([id, pk]) => [id, String(pk)]),
    ...UNCONFIRMED.map(([id, pk]) => [id, String(pk)]),
    ["not-approved", "822949"],
    [movedId, String(movedPk + 1)],
  ]);
  const readmit = approvedReadmissions(receipt);
  assert.equal(readmit.size, 73, "the 73 matching approved pairs, and nothing else");
  for (const [id, pk] of UNCONFIRMED) {
    assert.equal(readmit.has(id), false, `${id} (gamePk ${pk}) stays out`);
    assert.equal(rowBelongsToFile(id, { providerEventId: "own", gamePk: pk }, readmit), false, `a ${id} row in ${pk}'s file is not evidence`);
  }
  assert.equal(readmit.has("not-approved"), false, "a receipt alias outside the approved list admits nothing");
  assert.equal(readmit.has(movedId), false, "a receipt naming a different gamePk than the approval admits nothing");

  // Even an approved list that wrongly included an unconfirmed id would not admit it.
  assert.equal(approvedReadmissions(new Map(UNCONFIRMED.map(([id, pk]) => [id, String(pk)])), UNCONFIRMED).size, 0);

  // MLB's receipt, once committed, must agree: it names every approved pair and none of the unconfirmed ids.
  const committed = loadProviderEventReceipt().aliases;
  if (committed.size > 0) {
    assert.equal(approvedReadmissions(committed).size, 74, "every approved pair is in MLB's receipt for the same gamePk");
    for (const [id] of UNCONFIRMED) assert.equal(committed.has(id), false, `MLB's receipt does not alias ${id}`);
  }

  const src = fs.readFileSync(path.join(APP, "src/lib/research/row-lineage-loader.ts"), "utf8");
  assert.match(src, /const readmit = approvedReadmissions\(receipt\.aliases\);/, "loadArchiveIndex reads aliases only through the approved list");
});
