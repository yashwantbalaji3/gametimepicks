/**
 * F1 (Session 1B, 2026-09-30) · APPEND-ONLY SAME-DAY RESTATEMENTS of the dated Results projection.
 *
 * The incident: nightly-settle's first slot writes <date>.json; daily-products then legitimately advances
 * the risk-ladder record and the lab-ledger stream state; the next slot's projection differs and the
 * write-once rule refused it, so the late repair pass published nothing. With --restate the original is
 * untouched, the semantic difference is appended as <date>.r2.json, and the effective projection advances.
 *
 * Run: npx tsx --test src/lib/results/projection-restatement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { readSources, writeProjection } from "../../../scripts/results/build-results-projection.mjs";
import { buildProjection } from "./projection-core.mjs";
import { readEffective, historyOf, diffProjections, unsafeRestatementReasons, revisionName } from "./projection-revisions.mjs";

const APP = process.cwd();
const REPO = path.dirname(APP);
const SCRIPT = path.join(APP, "scripts", "results", "build-results-projection.mjs");
const REAL_ROOT = path.join(APP, "public", "data");
const REAL_INTERNAL = path.join(REPO, "data", "internal");
const DATE = "2026-09-30";
const SLOT1 = "2026-09-30T11:12:32Z";
const SLOT2 = "2026-09-30T14:55:49Z";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-restate-"));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const bytes = (p) => fs.readFileSync(p, "utf8");
const build = (root = REAL_ROOT, now = SLOT1) => buildProjection(readSources(root, REAL_INTERNAL), { now });
const revisionsIn = (dir) => fs.readdirSync(dir).filter((f) => /\.r\d+\.json$/.test(f)).sort();

/** A scratch data root holding a COPY of the real owners, so a test can advance one like a producer would. */
function scratchOwners() {
  const root = tmp();
  for (const rel of ["mr-dub", "product-ledger", "parlays/risk-ladder/latest.json", "parlays/lab-ledger.json", "admin/model-health.json",
    "mlb/graded-picks.json", "nfl/graded-picks.json", "ufc/graded-picks.json", "epl/graded-picks.json", "nba/graded-picks.json",
    "mlb/results/lifetime_summary.json", "results/lifetime_summary.json"]) {
    const src = path.join(REAL_ROOT, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, path.join(root, rel), { recursive: true });
    else fs.copyFileSync(src, path.join(root, rel));
  }
  return root;
}
const editOwner = (root, rel, fn) => { const p = path.join(root, rel); const d = readJson(p); fn(d); fs.writeFileSync(p, JSON.stringify(d, null, 2)); };

/** daily-products, reproduced: the risk-ladder record folds one more graded day, and a lab stream's state moves. */
function dailyProducts(root, stamp = "2026-09-30T11:24:04Z") {
  editOwner(root, "parlays/risk-ladder/latest.json", (d) => {
    d.generatedAt = stamp;
    d.record.overall.wins += 1;
    for (const t of Object.values(d.record.byTier)) t.wins += 1;
  });
  editOwner(root, "parlays/lab-ledger.json", (d) => {
    d.generatedAt = stamp;
    const s = d.streams.find((x) => x.live === false) ?? d.streams[0];
    s.blocked = `${s.blocked ?? "blocked"} (restated by daily-products)`;
  });
}

test("1 · first publication: no dated artifact → the original is written, no revision", () => {
  const out = tmp();
  const r = writeProjection(build(), { outDir: out, date: DATE, restate: true });
  assert.equal(r.refused, null);
  assert.ok(fs.existsSync(path.join(out, `${DATE}.json`)));
  assert.deepEqual(revisionsIn(out), []);
  assert.equal(r.revision, null);
});

test("2 · identical re-run → no revision, the original untouched", () => {
  const out = tmp();
  writeProjection(build(), { outDir: out, date: DATE, restate: true });
  const before = bytes(path.join(out, `${DATE}.json`));
  const r = writeProjection(build(), { outDir: out, date: DATE, restate: true });
  assert.equal(r.refused, null); assert.ok(r.untouched); assert.equal(r.revision, null);
  assert.deepEqual(revisionsIn(out), []);
  assert.equal(bytes(path.join(out, `${DATE}.json`)), before);
});

test("3 · timestamp-only re-run (every owner restamped, facts the same) → no revision", () => {
  const out = tmp();
  const p = build();
  writeProjection(p, { outDir: out, date: DATE, restate: true });
  const restamped = { ...p, builtAt: SLOT2, sources: p.sources.map((s) => ({ ...s, generatedAt: SLOT2 })), cells: p.cells.map((c) => ({ ...c, owner: { ...c.owner, generatedAt: SLOT2 } })) };
  assert.notEqual(JSON.stringify(restamped.cells), JSON.stringify(p.cells), "the probe really restamped");
  const r = writeProjection(restamped, { outDir: out, date: DATE, restate: true });
  assert.equal(r.refused, null); assert.equal(r.revision, null);
  assert.deepEqual(revisionsIn(out), []);
});

test("4 · one owner legitimately advances → exactly one append-only revision naming it", () => {
  const out = tmp();
  const root = scratchOwners();
  writeProjection(build(root), { outDir: out, date: DATE, restate: true });
  const base = bytes(path.join(out, `${DATE}.json`));
  editOwner(root, "parlays/risk-ladder/latest.json", (d) => { d.generatedAt = SLOT2; d.record.overall.losses += 1; });
  const r = writeProjection(build(root, SLOT2), { outDir: out, date: DATE, restate: true });
  assert.equal(r.refused, null); assert.equal(r.revision, 2);
  assert.deepEqual(revisionsIn(out), [revisionName(DATE, 2)]);
  const rs = readJson(path.join(out, revisionName(DATE, 2))).restatement;
  assert.deepEqual(rs.changedOwners, ["parlays/risk-ladder/latest.json"]);
  assert.equal(rs.restates, `${DATE}.json`); assert.equal(rs.previousEffective, `${DATE}.json`);
  assert.equal(rs.revision, 2); assert.equal(rs.date, DATE); assert.equal(rs.restatedAt, SLOT2);
  assert.deepEqual(rs.changedCells.map((c) => c.cellId), ["lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-overall"]);
  assert.ok(rs.changedCells[0].fields.includes("counts"), "the record moved");
  assert.ok(!rs.changedCells[0].fields.includes("owner"), "an owner stamp is provenance, never a changed field");
  assert.equal(bytes(path.join(out, `${DATE}.json`)), base, "the original is byte-identical");
});

test("5 · THE INCIDENT: daily-products advances 5 risk-ladder cells + 1 lab stream between slots → restated, not refused", () => {
  const out = tmp();
  const root = scratchOwners();
  writeProjection(build(root, SLOT1), { outDir: out, date: DATE });                  // slot 1, as the workflow ran it
  const base = bytes(path.join(out, `${DATE}.json`));
  dailyProducts(root);
  const slot2 = build(root, SLOT2);
  const old = writeProjection(slot2, { outDir: out, date: DATE });                    // the OLD behaviour
  assert.match(old.refused ?? "", /REFUSED/, "without --restate this is still the write-once refusal");
  const r = writeProjection(slot2, { outDir: out, date: DATE, restate: true });        // the NEW slot
  assert.equal(r.refused, null, r.refused);
  assert.equal(r.revision, 2);
  const rs = readJson(path.join(out, revisionName(DATE, 2))).restatement;
  assert.deepEqual(rs.changedOwners, ["parlays/lab-ledger.json", "parlays/risk-ladder/latest.json"]);
  const risk = rs.changedCells.filter((c) => c.owner === "parlays/risk-ladder/latest.json");
  const lab = rs.changedCells.filter((c) => c.owner === "parlays/lab-ledger.json");
  assert.equal(risk.length, 5, "overall + four tiers");
  assert.equal(lab.length, 1, "one lab stream");
  assert.equal(bytes(path.join(out, `${DATE}.json`)), base, "slot 1's original is untouched");
  assert.equal(historyOf(readEffective(out, DATE).effective), historyOf(slot2), "the effective projection is slot 2's");
  assert.equal(historyOf(readJson(path.join(out, "latest.json"))), historyOf(slot2), "…and so is the pointer");
});

test("6 · duplicate re-run after a revision → no r3", () => {
  const out = tmp();
  const root = scratchOwners();
  writeProjection(build(root, SLOT1), { outDir: out, date: DATE, restate: true });
  dailyProducts(root);
  writeProjection(build(root, SLOT2), { outDir: out, date: DATE, restate: true });
  const r = writeProjection(build(root, "2026-09-30T16:07:40Z"), { outDir: out, date: DATE, restate: true });
  assert.equal(r.refused, null); assert.equal(r.revision, null); assert.ok(r.untouched?.endsWith(revisionName(DATE, 2)));
  assert.deepEqual(revisionsIn(out), [revisionName(DATE, 2)]);
});

test("7 · another advancement after r2 → r3 restates r2 (not the original)", () => {
  const out = tmp();
  const root = scratchOwners();
  writeProjection(build(root, SLOT1), { outDir: out, date: DATE, restate: true });
  dailyProducts(root);
  writeProjection(build(root, SLOT2), { outDir: out, date: DATE, restate: true });
  const r2 = bytes(path.join(out, revisionName(DATE, 2)));
  editOwner(root, "parlays/risk-ladder/latest.json", (d) => { d.generatedAt = "2026-09-30T17:00:00Z"; d.record.overall.losses += 2; });
  const r = writeProjection(build(root, "2026-09-30T17:05:00Z"), { outDir: out, date: DATE, restate: true });
  assert.equal(r.revision, 3);
  const rs = readJson(path.join(out, revisionName(DATE, 3))).restatement;
  assert.equal(rs.restates, revisionName(DATE, 2));
  assert.deepEqual(rs.changedCells.map((c) => c.cellId), ["lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-overall"], "diffed against r2, not the original");
  assert.equal(bytes(path.join(out, revisionName(DATE, 2))), r2, "r2 is untouched");
  const eff = readEffective(out, DATE);
  assert.equal(eff.effectiveName, revisionName(DATE, 3)); assert.equal(eff.links.length, 3); assert.equal(eff.error, null);
});

test("8 · order determinism: the same facts in a different source order give the same effective output", () => {
  const src = readSources(REAL_ROOT, REAL_INTERNAL);
  const reversed = {
    ...src,
    receipts: [...src.receipts].reverse(),
    gradedPicks: Object.fromEntries(Object.entries(src.gradedPicks).reverse()),
  };
  assert.notDeepEqual(Object.keys(reversed.gradedPicks), Object.keys(src.gradedPicks), "the probe really reordered");
  const a = buildProjection(src, { now: SLOT1 }), b = buildProjection(reversed, { now: SLOT1 });
  assert.equal(historyOf(a), historyOf(b));
  const out = tmp();
  writeProjection(a, { outDir: out, date: DATE, restate: true });
  const r = writeProjection(b, { outDir: out, date: DATE, restate: true });
  assert.equal(r.revision, null, "a reorder is not a restatement");
});

test("9 · the original and every revision are opened `wx` — an overwrite attempt throws, and nothing path-writes them", () => {
  const out = tmp();
  writeProjection(build(), { outDir: out, date: DATE, restate: true });
  assert.throws(() => fs.writeFileSync(path.join(out, `${DATE}.json`), "x", { flag: "wx" }), /EEXIST/);
  const src = fs.readFileSync(SCRIPT, "utf8");
  const writes = [...src.matchAll(/fs\.writeFileSync\([^;]*;/g)].map((m) => m[0]);
  for (const w of writes) {
    if (/\blatest\b/.test(w.split(",")[0])) continue;
    assert.match(w, /flag: "wx"/, `every dated write is exclusive: ${w}`);
  }
  assert.equal(writes.filter((w) => !/\blatest\b/.test(w.split(",")[0])).length, 2, "exactly two dated writes: the original and a revision");
});

test("10 · the resolver: a consumer sees the effective revision, and a broken chain has no effective state", () => {
  const out = tmp();
  const root = scratchOwners();
  writeProjection(build(root, SLOT1), { outDir: out, date: DATE, restate: true });
  dailyProducts(root);
  writeProjection(build(root, SLOT2), { outDir: out, date: DATE, restate: true });
  const eff = readEffective(out, DATE);
  assert.equal(eff.effectiveName, revisionName(DATE, 2));
  assert.notEqual(historyOf(eff.effective), historyOf(eff.base), "not pinned to the original");
  // A gap (r4 with no r3) and a link naming the wrong predecessor are both refused, never guessed around.
  const r2 = readJson(path.join(out, revisionName(DATE, 2)));
  fs.writeFileSync(path.join(out, revisionName(DATE, 4)), JSON.stringify({ ...r2, restatement: { ...r2.restatement, revision: 4, restates: revisionName(DATE, 3) } }));
  assert.match(readEffective(out, DATE).error ?? "", /gap/);
  assert.equal(readEffective(out, DATE).effective, null);
  assert.match(writeProjection(build(root, SLOT2), { outDir: out, date: DATE, restate: true }).refused ?? "", /REFUSED/);
  fs.rmSync(path.join(out, revisionName(DATE, 4)));
  fs.writeFileSync(path.join(out, revisionName(DATE, 3)), JSON.stringify({ ...r2, restatement: { ...r2.restatement, revision: 3, restates: `${DATE}.json` } }));
  assert.match(readEffective(out, DATE).error ?? "", /does not continue the chain/);
});

test("UNSAFE · a vanished cell or a moved closed-history record is refused even with --restate", () => {
  const p = build();
  const legacyIdx = p.cells.findIndex((c) => c.era === "PROTECTED_BASE" && Number.isInteger(c.counts?.won));
  assert.ok(legacyIdx >= 0, "a protected-base cell exists to probe");
  const moved = { ...p, cells: p.cells.map((c, i) => (i === legacyIdx ? { ...c, counts: { ...c.counts, won: c.counts.won + 1 } } : c)) };
  assert.match(unsafeRestatementReasons(p, moved).join(" "), /closed history does not advance/);
  const vanished = { ...p, cells: p.cells.slice(1) };
  assert.match(unsafeRestatementReasons(p, vanished).join(" "), /disappeared/);
  const out = tmp();
  writeProjection(p, { outDir: out, date: DATE });
  const r = writeProjection(moved, { outDir: out, date: DATE, restate: true });
  assert.match(r.refused ?? "", /unsafe restatement/); assert.deepEqual(r.wrote, []); assert.deepEqual(revisionsIn(out), []);
  // A not-live-today lab stream ("FROZEN" status, POLICY_V2 era) is NOT closed history: its counts may advance.
  const stream = p.cells.findIndex((c) => c.era === "POLICY_V2" && c.status === "FROZEN" && Number.isInteger(c.counts?.won));
  if (stream >= 0) {
    const settled = { ...p, cells: p.cells.map((c, i) => (i === stream ? { ...c, counts: { ...c.counts, lost: c.counts.lost + 1 } } : c)) };
    assert.deepEqual(unsafeRestatementReasons(p, settled), []);
  }
});

test("CLI · --restate appends; without it the refusal and exit 1 are unchanged", () => {
  const out = tmp();
  const root = scratchOwners();
  const run = (now, extra = []) => spawnSync(process.execPath, [SCRIPT, "--now", now, "--write", "--root", root, "--internal-root", REAL_INTERNAL, "--out", out, ...extra], { encoding: "utf8", cwd: APP });
  assert.equal(run(SLOT1).status, 0);
  dailyProducts(root);
  const refused = run(SLOT2);
  assert.equal(refused.status, 1); assert.match(refused.stderr, /REFUSED/);
  const restated = run(SLOT2, ["--restate"]);
  assert.equal(restated.status, 0, restated.stderr); assert.match(restated.stdout, /appended revision r2/);
  assert.deepEqual(revisionsIn(out), [revisionName(DATE, 2)]);
});

test("WORKFLOW · nightly-settle builds the projection with --restate, and an unsafe restatement is still exit 1 (red)", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github", "workflows", "nightly-settle.yml"), "utf8");
  assert.match(wf, /build-results-projection\.mjs --now "\$NOW" --write --restate/);
  const step = wf.split("- name: Rebuild the canonical Results projection")[1].split("\n      - name:")[0];
  assert.doesNotMatch(step, /^\s*continue-on-error:/m, "a refusal must stay red");
  assert.doesNotMatch(step, /build-results-projection\.mjs[^\n]*(\|\| true|\|\| echo)/, "…and is never swallowed");
  assert.match(step, /exit "\$rc"/, "the builder's exit code is the step's");
});

test("COMMITTED · every committed dated projection resolves to an unbroken chain, and latest.json is its date's effective state", () => {
  const dir = path.join(REAL_ROOT, "results", "projection");
  const dates = fs.readdirSync(dir).map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(Boolean).sort();
  assert.ok(dates.length > 0, "committed dated projections exist");
  for (const d of dates) assert.equal(readEffective(dir, d).error, null, d);
  const latest = readJson(path.join(dir, "latest.json"));
  const newest = dates.at(-1);
  assert.equal(historyOf(latest), historyOf(readEffective(dir, newest).effective), `latest.json is ${newest}'s effective projection`);
});
