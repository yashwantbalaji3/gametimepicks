/**
 * RECORD-FAMILY SEPARATION guard (Phase 6). The four performance families — official paper record, public
 * simulation accuracy, research observation settlement, market-baseline benchmark — must stay separate: the money
 * record is authored ONLY in portfolio.json, the sim-accuracy family lives ONLY in comparison_report, the research
 * families stay internal, and no single module blends two of them into one figure.
 *
 * Run: npx tsx --test src/lib/record-family-separation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RECORD_FAMILIES, OFFICIAL_PAPER_RECORD } from "./record-families.ts";

const app = process.cwd();
const repo = path.dirname(app);
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const walk = (dir, out = []) => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p); } } catch { /* skip */ } return out; };

test("1 · the four families are registered with distinct sources + public flags", () => {
  const ids = Object.keys(RECORD_FAMILIES);
  assert.equal(ids.length, 4);
  assert.equal(RECORD_FAMILIES["official-paper-record"].public, true);
  assert.equal(RECORD_FAMILIES["public-sim-accuracy"].public, true);
  assert.equal(RECORD_FAMILIES["research-observation-settlement"].public, false);
  assert.equal(RECORD_FAMILIES["market-baseline-benchmark"].public, false);
  // each family carries an explicit "isNot" so nobody re-labels one as another
  for (const f of Object.values(RECORD_FAMILIES)) assert.ok(/NOT /.test(f.isNot), `${f.id} states what it is NOT`);
});

test("2 · the official paper record is authored ONLY in portfolio.json (canonical, pinned)", () => {
  const portfolio = path.join(app, "public/data/mr-dub/portfolio.json");
  const md5 = crypto.createHash("md5").update(fs.readFileSync(portfolio)).digest("hex");
  assert.equal(md5, OFFICIAL_PAPER_RECORD.portfolioMd5, "money md5 pinned");
  const p = JSON.parse(read(portfolio));
  assert.equal(`${p.record.wins}-${p.record.losses}`, OFFICIAL_PAPER_RECORD.recordLabel);
  assert.equal(p.record.pending, 0);
  assert.equal(p.openExposure ?? p.exposure ?? 0, 0, "exposure is $0");
});

test("3 · the MONEY modules do not read the sim-accuracy or research families (no upward contamination)", () => {
  const moneyModules = ["src/lib/money-integrity.ts", "src/lib/mr-dub/flagship.ts", "src/lib/bank-builder/crown-summary.ts", "src/lib/mr-dub/master-ledger.ts"];
  const bad = /comparison_report|research-observ|research-progress|\bhitRate\b|benchmark\.json|pregame-archive/;
  for (const m of moneyModules) {
    const src = read(path.join(app, m));
    if (src == null) continue;
    assert.ok(!bad.test(src), `${m} must not pull sim-accuracy / research data into the money record`);
  }
});

test("4 · the SIM-ACCURACY modules do not read the money record (no downward contamination)", () => {
  const money = /crownBankroll|currentBankroll|mr-dub\/portfolio|"19-14"|19–14/;
  for (const f of walk(path.join(app, "src/lib/mlb"))) {
    if (!/result|grade|comparison|calibration/i.test(f)) continue;
    const src = read(f);
    if (src == null) continue;
    assert.ok(!money.test(src), `${path.relative(app, f)} (sim-results family) must not pull the money record`);
  }
});

test("5 · no PUBLIC source blends the money record AND the sim-accuracy family in the same file", () => {
  const files = [...walk(path.join(app, "src/app")), ...walk(path.join(app, "src/components"))];
  const readsMoney = /mr-dub\/portfolio|crownBankroll|currentBankroll|crownLadderSummary/;
  const readsSimAccuracy = /comparison_report|comparisonReport/;
  const blenders = files.filter((f) => { const s = read(f) || ""; return readsMoney.test(s) && readsSimAccuracy.test(s); });
  assert.deepEqual(blenders.map((f) => path.relative(app, f)), [], "a single public file must not source both the money record and the sim-accuracy family");
});

test("6 · the research families never reach a public source (re-assert the internal boundary)", () => {
  const files = [...walk(path.join(app, "src/app")), ...walk(path.join(app, "src/components"))];
  const research = /pregame-archive|research-observations|research-progress|benchmark\.json/;
  const leaks = files.filter((f) => research.test(read(f) || ""));
  assert.deepEqual(leaks.map((f) => path.relative(app, f)), [], "no public source reads the internal research families");
});

test("7 · the public SIM-RESULTS artifact carries its own settlement provenance and is MONEY-FREE (data-level separation)", () => {
  const dir = path.join(app, "public/data/mlb/results");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^comparison_report_\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { /* none */ }
  if (files.length === 0) return; // no settled sim-results yet ⇒ nothing to assert
  const money = /\bcrownBankroll\b|\bcurrentBankroll\b|"19-14"|19–14|mr-dub\/portfolio/;
  for (const f of files.slice(-5)) {
    const raw = read(path.join(dir, f)) || "";
    // The sim-accuracy family reports its OWN settlement (generatedAt + wins/losses/pushes) and must NOT embed the
    // money record — the two families are reported separately and never blended into one figure.
    assert.ok(!money.test(raw), `${f} (sim-accuracy family) must not embed the money record`);
    const j = JSON.parse(raw);
    assert.ok("generatedAt" in j, `${f} carries its own generation provenance`);
    assert.ok("wins" in j && "losses" in j, `${f} carries its own settlement counts (separate from the paper W–L)`);
  }
});
