/**
 * THE BUILDER'S IO — write-once (rule 7), the dry run, the missing-owner cases — against real git-free
 * scratch roots (v1.8 · C1).
 *
 * Run: npx tsx --test src/lib/results/projection-builder.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { readSources, writeProjection, historyOf, etSlateDate } from "../../../scripts/results/build-results-projection.mjs";
import { buildProjection, assertProjectionShape } from "./projection-core.mjs";

const APP = process.cwd();
const REPO = path.dirname(APP);
const SCRIPT = path.join(APP, "scripts", "results", "build-results-projection.mjs");
const REAL_ROOT = path.join(APP, "public", "data");
const REAL_INTERNAL = path.join(REPO, "data", "internal");
const NOW = "2026-09-22T18:00:00Z";

const run = (args, opts = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", cwd: APP, ...opts });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-projection-"));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** A scratch data root holding only the named owners, copied from the real tree. */
function scratchRoot(rels) {
  const root = tmp();
  for (const rel of rels) {
    const src = path.join(REAL_ROOT, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, path.join(root, rel), { recursive: true });
    else fs.copyFileSync(src, path.join(root, rel));
  }
  return root;
}

test("dry run: prints the cells and writes nothing", () => {
  const out = tmp();
  const r = run(["--now", NOW, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cells · builtAt 2026-09-22T18:00:00Z/);
  assert.match(r.stdout, /dry run — nothing written/);
  assert.equal(fs.readdirSync(out).length, 0);
});

test("--write needs --now (the artifact must be replayable)", () => {
  const r = run(["--write", "--out", tmp()]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--now <ISO> is required with --write/);
});

test("rule 7 · write-once, dated: first write lands; identical re-run leaves the dated file untouched; a differing re-run is REFUSED and writes nothing", () => {
  const out = tmp();
  const first = run(["--now", NOW, "--date", "2026-09-22", "--out", out, "--write"]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /wrote .*2026-09-22\.json/);
  assert.match(first.stdout, /wrote .*latest\.json/);
  const dated = path.join(out, "2026-09-22.json"), latest = path.join(out, "latest.json");
  assertProjectionShape(readJson(dated));
  assert.equal(historyOf(readJson(dated)), historyOf(readJson(latest)));
  const datedBytes = fs.readFileSync(dated, "utf8");

  // identical history, different builtAt → dated untouched, latest refreshed
  const again = run(["--now", "2026-09-22T19:00:00Z", "--date", "2026-09-22", "--out", out, "--write"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already recorded and identical — left untouched/);
  assert.equal(fs.readFileSync(dated, "utf8"), datedBytes, "the dated file is byte-identical");
  assert.equal(readJson(latest).builtAt, "2026-09-22T19:00:00Z", "latest.json is a pointer and refreshes");

  // mutation probe: restate one count in the dated file → the next run differs → REFUSED, nothing written
  const doc = readJson(dated);
  const cell = doc.cells.find((c) => c.cellId === "product:-:bank-builder:PROTECTED_BASE:-");
  cell.counts.won += 1;
  fs.writeFileSync(dated, JSON.stringify(doc, null, 2) + "\n");
  const latestBefore = fs.readFileSync(latest, "utf8");
  const refused = run(["--now", "2026-09-22T20:00:00Z", "--date", "2026-09-22", "--out", out, "--write"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /REFUSED: 2026-09-22\.json exists and DIFFERS from this run/);
  assert.equal(fs.readFileSync(latest, "utf8"), latestBefore, "latest.json is not touched on a refusal");
  assert.equal(readJson(dated).cells.find((c) => c.cellId === cell.cellId).counts.won, cell.counts.won, "the dated file is not touched on a refusal");

  // a different date is a different file: it lands
  const other = run(["--now", "2026-09-23T18:00:00Z", "--out", out, "--write"]);
  assert.equal(other.status, 0, other.stderr);
  assert.ok(fs.existsSync(path.join(out, "2026-09-23.json")), "the date defaults to the ET slate day of --now (18:00Z = 14:00 ET, same day)");
});

test("rule 7 · writeProjection in-process: the refusal compares cells + headline, not builtAt or source stamps", () => {
  const out = tmp();
  const p = buildProjection(readSources(REAL_ROOT, REAL_INTERNAL), { now: NOW });
  assert.deepEqual(writeProjection(p, { outDir: out, date: "2026-09-22" }).refused, null);
  const p2 = { ...p, builtAt: "2026-09-22T23:00:00Z", sources: p.sources.map((s) => ({ ...s, generatedAt: "2026-09-22T23:00:00Z" })) };
  const r2 = writeProjection(p2, { outDir: out, date: "2026-09-22" });
  assert.equal(r2.refused, null); assert.ok(r2.untouched);
  const p3 = { ...p, headline: { ...p.headline, byFamily: { ...p.headline.byFamily, product: null } } };
  assert.match(writeProjection(p3, { outDir: out, date: "2026-09-22" }).refused, /REFUSED/);
  // an unparseable dated file is also a refusal (never overwrite what cannot be compared)
  fs.writeFileSync(path.join(out, "2026-09-22.json"), "{ not json");
  assert.match(writeProjection(p, { outDir: out, date: "2026-09-22" }).refused, /REFUSED/);
});

test("missing OPTIONAL owners: the build succeeds with those cells absent — not zero — and the sources list says so", () => {
  const root = scratchRoot(["mr-dub/portfolio.json", "mr-dub/settled", "mlb/results/lifetime_summary.json"]);
  const r = run(["--now", NOW, "--root", root, "--internal-root", tmp(), "--out", path.join(root, "results", "projection"), "--write"]);
  assert.equal(r.status, 0, r.stderr);
  const p = readJson(path.join(root, "results", "projection", "latest.json"));
  assertProjectionShape(p);
  assert.ok(p.cells.some((c) => c.cellId === "product:-:bank-builder:COMPOSITE:protected-record"));
  assert.ok(p.cells.some((c) => c.sport === "mlb" && c.segment === "lifetime-summary"));
  assert.ok(!p.cells.some((c) => c.family === "lab"), "no lab owner ⇒ no lab cells");
  assert.ok(!p.cells.some((c) => c.family === "model-family"));
  assert.ok(!p.cells.some((c) => c.family === "cycle"));
  assert.ok(!p.cells.some((c) => c.era === "LEDGER_ONLY"), "no banked ladders ⇒ no 5–0 cells (not 0–0 cells)");
  assert.ok(!p.cells.some((c) => c.era === "LEGACY_PRODUCT_LEDGER"));
  assert.ok(!p.cells.some((c) => c.sport === "nba"));
  assert.equal(p.headline.byFamily.lab, null);
  const absent = p.sources.filter((s) => !s.present).map((s) => s.key);
  assert.ok(absent.includes("labLedger") && absent.includes("bankedLadders") && absent.includes("modelHealth"), `absent owners are listed (${absent})`);
  assert.ok(p.sources.find((s) => s.key === "receipts").count > 0);
});

test("the REQUIRED owner missing: the build refuses with exit 3 and writes nothing", () => {
  const root = scratchRoot(["mlb/results/lifetime_summary.json", "mlb/graded-picks.json"]);
  const out = path.join(root, "results", "projection");
  const r = run(["--now", NOW, "--root", root, "--internal-root", tmp(), "--out", out, "--write"]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /required owner "portfolio" is missing/);
  assert.ok(!fs.existsSync(path.join(out, "latest.json")));
});

test("an empty data root is refused, not projected as zeros", () => {
  const r = run(["--now", NOW, "--root", tmp(), "--internal-root", tmp(), "--out", tmp()]);
  assert.equal(r.status, 3);
});

test("readSources cites owner paths relative to the data root (what a cell's owner.path prints)", () => {
  const s = readSources(REAL_ROOT, REAL_INTERNAL);
  assert.equal(s.portfolio.path, "mr-dub/portfolio.json");
  assert.equal(s.riskLadder.path, "parlays/risk-ladder/latest.json");
  assert.equal(s.cycleTable.path, "data/internal/products/cycle-table/latest.json");
  assert.ok(s.receipts.length > 0 && s.receipts.every((r) => /^mr-dub\/settled\/\d{4}-\d{2}-\d{2}\.json$/.test(r.path)));
  assert.ok(Object.keys(s.gradedPicks).length >= 1);
});

/* ── THE DATE THE ARTIFACT IS FILED UNDER (2026-09-24 settlement outage) ─────────────────────────── */

test("rule 7 · a dated projection is filed under the ET SLATE DAY, so an evening run cannot claim tomorrow", () => {
  /*
   * THE INCIDENT THIS PINS. The default was `--now`.slice(0,10) — the UTC date. Between 20:00 ET and
   * ET midnight the UTC date is already tomorrow, so a producer run at 2026-09-23T20:45 ET wrote
   * `2026-09-24.json` for a day whose settlement had not happened. The next morning the real
   * nightly-settle computed different cells, rule 7 correctly refused to restate, and the job failed
   * three times — taking morning-projections, mlb-daily-production and daily-products down with it,
   * because all three chain off its success.
   *
   * The boundary is asserted on BOTH sides of ET midnight and BOTH sides of the UTC rollover, because
   * a fix that only moved the bug four hours would pass a one-sided test.
   */
  assert.equal(etSlateDate("2026-09-23T23:59:59Z"), "2026-09-23", "19:59 ET is still that ET day");
  assert.equal(etSlateDate("2026-09-24T00:45:51Z"), "2026-09-23", "THE INCIDENT: 20:45 ET, UTC already tomorrow");
  assert.equal(etSlateDate("2026-09-24T03:59:59Z"), "2026-09-23", "23:59 ET is still that ET day");
  assert.equal(etSlateDate("2026-09-24T04:00:00Z"), "2026-09-24", "ET midnight starts the new slate day");
  assert.equal(etSlateDate("2026-09-24T14:07:00Z"), "2026-09-24", "and a daytime run is unremarkable");

  // EST as well as EDT — the offset is 5 hours in January, and a hardcoded -4 would pass the cases above.
  assert.equal(etSlateDate("2026-01-15T04:59:00Z"), "2026-01-14", "23:59 EST");
  assert.equal(etSlateDate("2026-01-15T05:00:00Z"), "2026-01-15", "00:00 EST");

  // END TO END: the CLI must file it under that day, not under the UTC one.
  const root = scratchRoot(["mr-dub/portfolio.json"]);
  const out = path.join(tmp(), "projection");
  const r = run(["--now", "2026-09-24T00:45:51Z", "--write", "--root", root, "--internal-root", REAL_INTERNAL, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(out, "2026-09-23.json")), "filed under the ET slate day");
  assert.ok(!fs.existsSync(path.join(out, "2026-09-24.json")), "and NOT under the UTC day it was not");
});

test("rule 7 · the write-once refusal itself is UNCHANGED — a genuine same-day restatement is still refused", () => {
  /* The date basis moved; the protection did not. A second run on the SAME slate day whose cells
     differ must still refuse and write nothing, or the fix would have bought recovery by removing
     the guard that surfaced the problem. */
  const out = path.join(tmp(), "projection");
  const p = buildProjection(readSources(REAL_ROOT, REAL_INTERNAL), { now: NOW });
  assertProjectionShape(p);
  const date = etSlateDate("2026-09-24T14:07:00Z");
  assert.equal(writeProjection(p, { outDir: out, date }).refused, null, "first write lands");
  const changed = { ...p, cells: [{ ...p.cells[0], key: `${p.cells[0].key}-restated` }, ...p.cells.slice(1)] };
  const r = writeProjection(changed, { outDir: out, date });
  assert.match(r.refused ?? "", /REFUSED/, "a differing same-day re-run is still refused");
  assert.deepEqual(r.wrote, [], "…and writes nothing");
  assert.equal(historyOf(readJson(path.join(out, `${date}.json`))), historyOf(p), "the dated file is untouched");
});
