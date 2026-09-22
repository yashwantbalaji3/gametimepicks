/**
 * PARITY — every mounted results consumer in V19 §1a/§1b can be supplied by the projection WITHOUT
 * changing the truth it prints today (v1.8 · C1). Nothing is repointed here (that is C2); this proves
 * the projection carries, for each consumer, a cell whose counts equal what that consumer's CURRENT
 * loader reads from the same owner.
 *
 * Built in memory from the live owners on disk (the same reads the builder uses), so the guard cannot
 * rot when a bot regenerates an owner — it compares owner to owner, never to a committed snapshot.
 *
 * Run: npx tsx --test src/lib/results/projection-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readSources } from "../../../scripts/results/build-results-projection.mjs";
import { buildProjection, cellById, cellsByFamily, recordLabelOrNull, FAMILIES, ERAS } from "./projection-core.mjs";
import { buildResultRows, moonshotLedgerRecord, RECORD_TYPES as READ_MODEL_TYPES } from "./read-model.mjs";
import { loadGradedPicks, PICK_SPORTS } from "../sports/graded-picks-loader.ts";
import { getMlbLifetimeSummary } from "../data-mlb-results.ts";
import { getLifetimeSummary } from "../settlement-data.ts";
import { loadRiskLadderRecord } from "../parlays/risk-ladder.ts";
import { loadLabRecord } from "../parlays/lab-record.ts";
import { crownLadderSummary } from "../bank-builder/crown-summary.ts";
import { deriveMoonshotState, MOONSHOT_HAS_SCHEDULED_GENERATOR, MOONSHOT_HAS_WIRED_SETTLER } from "../products/moonshot-state.mjs";
import { PROTECTED_BASE } from "../mr-dub/protected-fold.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "public", "data");
const INTERNAL = path.join(path.dirname(APP), "data", "internal");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return null; } };

const P = buildProjection(readSources(ROOT, INTERNAL), { now: "2026-09-22T18:00:00Z" });
const byId = (id) => cellById(P, id);

/* ── §1a · the protected record: / · /today · /bank-builder · /results (four inline copies + trust center) ── */
test("§1a · portfolio.record (what page.tsx:83, today/page.tsx:172, bank-builder/page.tsx:158 and results-trust-center.ts read) == the COMPOSITE protected-record cell", () => {
  const p = readJson("mr-dub/portfolio.json");
  assert.ok(p?.record, "owner present");
  const cell = byId("product:-:bank-builder:COMPOSITE:protected-record");
  assert.ok(cell, "the projection carries the protected record");
  // the exact inline derivation on the homepage / today
  const inlineLabel = `${p.record.wins}–${p.record.losses}`;
  const inlineSettled = p.record.wins + p.record.losses + (p.record.voids ?? 0);
  const inlinePending = p.record.pending ?? 0;
  assert.equal(recordLabelOrNull(cell), inlineLabel, "same W–L label");
  assert.equal(cell.counts.won + cell.counts.lost + (cell.counts.void ?? 0), inlineSettled, "same settled count");
  assert.equal(cell.counts.pending, inlinePending);
  // bank-builder/page.tsx:164 appends voids as "–N" only when non-zero; the projection appends "· N voids" — the COUNT is equal
  assert.equal(cell.counts.void, p.record.voids ?? null);
  // the trust center's toRecord (zero-fill) reads the same four fields
  assert.deepEqual({ wins: cell.counts.won, losses: cell.counts.lost, voids: cell.counts.void ?? 0, pending: cell.counts.pending ?? 0 }, { wins: p.record.wins, losses: p.record.losses, voids: p.record.voids ?? 0, pending: p.record.pending ?? 0 });
  // era composition: base = protected-fold.mjs PROTECTED_BASE (what public-beta-safety pins as 19-14) + the fold
  const base = cell.composition.find((c) => c.era === ERAS.PROTECTED_BASE);
  assert.deepEqual([base.counts.won, base.counts.lost], [PROTECTED_BASE.record.wins, PROTECTED_BASE.record.losses]);
  const fold = cell.composition.find((c) => c.era === ERAS.RECEIPT_ERA);
  assert.deepEqual([fold.counts.won, fold.counts.lost], [p.record.wins - PROTECTED_BASE.record.wins, p.record.losses - PROTECTED_BASE.record.losses]);
  assert.equal(fold.window.from, p.protectedFold.days[0].date);
  assert.equal(fold.window.to, p.protectedFold.foldedThrough);
});

test("§1a · read-model.mjs SIGNATURE_PRODUCT rows (the /results explorer) == the projection's product cells, era for era", () => {
  const rows = buildResultRows({ portfolio: readJson("mr-dub/portfolio.json"), moonshot: readJson("product-ledger/moonshot.json") })
    .filter((r) => r.recordType === READ_MODEL_TYPES.SIGNATURE_PRODUCT);
  const bb = rows.find((r) => r.sport === "bank-builder");
  const cell = byId("product:-:bank-builder:COMPOSITE:protected-record");
  assert.deepEqual([bb.wins, bb.losses], [cell.counts.won, cell.counts.lost]);
  const ms = rows.find((r) => r.sport === "moonshot");
  assert.equal(ms.era, "receipts", "the explorer row is the receipt era (founder decision 2026-09-22)");
  const msCell = byId("product:-:moonshot:RECEIPT_ERA:-");
  assert.deepEqual([ms.wins, ms.losses], [msCell.counts.won, msCell.counts.lost]);
});

/* ── §1a · Moonshot: /moonshot · /mr-dub · /results — displayRecord + legacyRecord ───────────── */
test("§1a · deriveMoonshotState displayRecord / legacyRecord (what /moonshot, /mr-dub and the trust center print) == the two Moonshot era cells", () => {
  const portfolio = readJson("mr-dub/portfolio.json");
  const ledger = readJson("product-ledger/moonshot.json");
  const d = deriveMoonshotState({ lane: null, portfolioMoonshot: portfolio?.moonshot ?? null, productLedger: ledger, hasScheduledGenerator: MOONSHOT_HAS_SCHEDULED_GENERATOR, hasWiredSettler: MOONSHOT_HAS_WIRED_SETTLER, today: "2026-09-22" });
  const receipt = byId("product:-:moonshot:RECEIPT_ERA:-");
  const legacy = byId("product:-:moonshot:LEGACY_PRODUCT_LEDGER:-");
  assert.ok(d.displayRecord && d.displayRecord.era === "receipts", "the mounted display record is the receipt era");
  assert.deepEqual([d.displayRecord.wins, d.displayRecord.losses, d.displayRecord.fromDate], [receipt.counts.won, receipt.counts.lost, receipt.window.from]);
  assert.deepEqual([d.legacyRecord.wins, d.legacyRecord.losses, d.legacyRecord.settled, d.legacyRecord.fromDate, d.legacyRecord.throughDate], [legacy.counts.won, legacy.counts.lost, legacy.n, legacy.window.from, legacy.window.to]);
  // read-model's ledger count is the same rule
  const lr = moonshotLedgerRecord(ledger);
  assert.deepEqual([lr.wins, lr.losses, lr.pending], [legacy.counts.won, legacy.counts.lost, legacy.counts.pending]);
  // the two eras are two cells; the projection has NO cell equal to their sum
  assert.ok(!cellsByFamily(P, FAMILIES.PRODUCT).some((c) => c.product === "moonshot" && c.counts.lost === receipt.counts.lost + legacy.counts.lost && c.counts.won === receipt.counts.won + legacy.counts.won));
});

/* ── §1a · the June "5–0": / (crown), /today (crownRung), /bank-builder proof strip ───────────── */
test("§1a · crownLadderSummary (banked-ladders.json ladders[0]) and bank-builder/page.tsx readCompletedLadders == the LEDGER_ONLY ladder cells", () => {
  const crown = crownLadderSummary(ROOT);
  assert.ok(crown, "owner present");
  const l1 = byId("product:-:bank-builder:LEDGER_ONLY:ladder-1");
  assert.equal(recordLabelOrNull(l1), crown.recordLabel, "the crown ladder's record label");
  assert.deepEqual([l1.counts.won, l1.counts.lost], [crown.wins, crown.losses]);
  // the /bank-builder proof strip: every ladder with a numeric final, W–L from its steps
  const banked = readJson("mr-dub/banked-ladders.json");
  const strip = (banked.ladders ?? []).filter((l) => typeof l.final === "number").map((l) => {
    const steps = l.steps ?? [];
    return { wins: steps.filter((s) => s.result === "won" || s.result === "win").length, losses: steps.filter((s) => s.result === "lost" || s.result === "loss").length, ladder: l.ladder };
  });
  for (const s of strip) {
    const cell = byId(`product:-:bank-builder:LEDGER_ONLY:ladder-${s.ladder}`);
    assert.ok(cell, `ladder ${s.ladder} has its own cell`);
    assert.deepEqual([cell.counts.won, cell.counts.lost], [s.wins, s.losses]);
    assert.equal(cell.era, ERAS.LEDGER_ONLY);
  }
  assert.equal(crown.laddersCompleted, strip.length);
  // the frozen S5 summary's 5–0 (public-summary-latest.json) is the SAME June ladder — parity by value, not a third cell
  const s5 = readJson("bank-builder/public-summary-latest.json");
  if (s5?.record) assert.deepEqual([l1.counts.won, l1.counts.lost], [s5.record.wins, s5.record.losses], "S5's record is ladder 1 (V17 S5); the projection does not emit it as a separate owner");
});

/* ── §1b · graded picks per sport: /results/picks, /results/picks/[sport], sport hubs ─────────── */
test("§1b · loadGradedPicks(sport).counts (graded-picks-loader.ts:39) == the forecast graded-picks cell per sport", () => {
  let checked = 0;
  for (const sport of PICK_SPORTS) {
    const g = loadGradedPicks(sport);
    const cell = byId(`forecast:${sport}:-:LIVE_LEDGER:graded-picks`);
    if (!g) { assert.equal(cell, null, `${sport}: no owner ⇒ no cell`); continue; }
    assert.ok(cell, `${sport}: cell present`);
    assert.deepEqual([cell.counts.won, cell.counts.lost, cell.counts.void], [g.counts.hits, g.counts.misses, g.counts.voided]);
    assert.equal(cell.hitRate, g.hitRate);
    assert.equal(cell.ownerState, g.sampleState);
    assert.equal(cell.owner.generatedAt, g.generatedAt);
    checked += 1;
  }
  assert.ok(checked >= 1, "at least one sport has a graded record on disk");
});

/* ── §1b · MLB receipts on /results and /results/mlb ─────────────────────────────────────────── */
test("§1b · getMlbLifetimeSummary() (data-mlb-results.ts:46) == the MLB lifetime-summary cell (decisive, wins, losses, window)", () => {
  const s = getMlbLifetimeSummary();
  const cell = byId("forecast:mlb:-:LIVE_LEDGER:lifetime-summary");
  if (!s) { assert.equal(cell, null); return; }
  assert.ok(cell);
  assert.deepEqual([cell.counts.won, cell.counts.lost, cell.decisive, cell.counts.push], [s.wins, s.losses, s.decisive, s.pushes]);
  assert.equal(cell.hitRate, s.hitRate);
  assert.deepEqual(cell.window, { from: s.oldestDate, to: s.newestDate });
  assert.equal(cell.owner.generatedAt, s.generatedAt);
});

/* ── §1b · NBA on /results/nba ───────────────────────────────────────────────────────────────── */
test("§1b · getLifetimeSummary() (settlement-data.ts, NBA) == the NBA HISTORICAL_ONLY cell", () => {
  const s = getLifetimeSummary();
  const cell = byId("forecast:nba:-:HISTORICAL_ONLY:lifetime-summary");
  if (!s || s.totalSettled === 0) { assert.equal(cell, null, "nothing settled ⇒ no cell (the page renders its empty state)"); return; }
  assert.ok(cell);
  assert.deepEqual([cell.counts.won, cell.counts.lost, cell.decisive, cell.counts.push], [s.wins, s.losses, s.decisive, s.pushes]);
  assert.equal(cell.hitRate, s.hitRate);
  assert.deepEqual(cell.window, { from: s.oldestDate, to: s.newestDate });
  assert.equal(cell.era, ERAS.HISTORICAL_ONLY);
});

/* ── §1a · Parlay Lab: /build · /results risk-ladder stream · /results/parlay-lab ─────────────── */
test("§1a · loadRiskLadderRecord(root) (risk-ladder.ts:162; /results/page.tsx:326) == the risk-ladder overall + tier cells", () => {
  const r = loadRiskLadderRecord(ROOT);
  const overall = byId("lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-overall");
  if (!r) { assert.equal(overall, null); return; }
  assert.ok(overall);
  assert.deepEqual([overall.counts.won, overall.counts.lost], [r.overall.wins, r.overall.losses]);
  assert.deepEqual(overall.window, { from: r.firstDay, to: r.lastDay });
  for (const [tier, t] of Object.entries(r.byTier)) {
    const cell = byId(`lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-tier-${tier}`);
    assert.ok(cell, `tier ${tier}`);
    assert.deepEqual([cell.counts.won, cell.counts.lost, cell.counts.push, cell.counts.pending], [t.wins, t.losses, t.pushes, t.pending]);
    assert.equal(cell.hitRate, t.hitRate);
  }
});

test("§1a · loadLabRecord().streams (lab-record.ts:70; /results/parlay-lab) == the POLICY_V2 stream cells; lab-ledger.priorPolicy == the POLICY_V1 cell", () => {
  const lab = loadLabRecord();
  const ledger = readJson("parlays/lab-ledger.json");
  if (!lab) { assert.equal(cellsByFamily(P, FAMILIES.LAB).filter((c) => c.era === ERAS.POLICY_V2).length, 0); return; }
  for (const s of lab.streams) {
    const cell = byId(`lab:${s.id === "multi" ? "-" : s.id}:parlay-lab:POLICY_V2:${s.id === "multi" ? "stream-multi" : "stream"}`);
    assert.ok(cell, `stream ${s.id}`);
    const raw = ledger.streams.find((x) => x.id === s.id).record;
    assert.deepEqual([cell.counts.won, cell.counts.lost, cell.counts.push], [raw.wins, raw.losses, raw.pushes]);
    if (s.record === null) {
      assert.equal(recordLabelOrNull(cell), null, `${s.id}: the loader says "nothing settled" and so does the projection`);
    } else {
      assert.deepEqual([cell.counts.won, cell.counts.lost, cell.counts.push], [s.record.wins, s.record.losses, s.record.pushes]);
      assert.equal(recordLabelOrNull(cell), `${s.record.wins}–${s.record.losses}${s.record.pushes > 0 ? ` · ${s.record.pushes} push${s.record.pushes === 1 ? "" : "es"}` : ""}`);
    }
    assert.equal(cell.modelOrPolicyVersion, String(ledger.policy.version));
  }
  const pp = ledger.priorPolicy;
  const v1 = byId("lab:-:parlay-lab:POLICY_V1:prior-policy");
  if (pp) {
    assert.ok(v1);
    assert.deepEqual([v1.counts.won, v1.counts.lost, v1.window.from, v1.window.to, v1.modelOrPolicyVersion], [pp.wins, pp.losses, pp.firstDay, pp.lastDay, String(pp.version)]);
    // parlay-lab-entry.tsx:256 renders priorPolicy as "Before the 2026-08-17 selection change" — the projection carries the same counts and DISCLOSES the window
    if (pp.lastDay >= ledger.policy.since) assert.equal(v1.status, "WINDOW_CONTRADICTS_LABEL");
  }
});

/* ── §1b · model-health on /ops ──────────────────────────────────────────────────────────────── */
test("§1b · admin/model-health.json families (ops/page.tsx:94) == the CALIBRATION_STATE cells: state + n only", () => {
  const mh = readJson("admin/model-health.json");
  if (!mh?.families) { assert.equal(cellsByFamily(P, FAMILIES.MODEL_FAMILY).length, 0); return; }
  const cells = cellsByFamily(P, FAMILIES.MODEL_FAMILY);
  assert.equal(cells.length, mh.families.length);
  for (const f of mh.families) {
    const cell = cells.find((c) => c.segment === f.id);
    assert.ok(cell, f.id);
    assert.equal(cell.ownerState, f.state);
    assert.equal(cell.n, f.n);
    assert.equal(cell.sport, f.sport ?? null);
    for (const k of ["judgement", "context", "baseline"]) assert.ok(!(k in cell), `${f.id}: ${k} does not cross`);
  }
  assert.doesNotMatch(JSON.stringify(cells), /meanDiff|lo95|hi95|modelMinusMarket|"rate"|"z"/);
});

/* ── every consumer-facing figure in the projection traces to an owner file on disk ──────────── */
test("every cell's owner path exists on disk (a cell without an owner is not emitted)", () => {
  for (const c of P.cells) {
    const rel = c.owner.path;
    const abs = rel.startsWith("data/internal/") ? path.join(path.dirname(APP), rel) : path.join(ROOT, rel);
    // a per-date owner ("mr-dub/settled/<date>.json") is cited by its directory
    const probe = rel.includes("<date>") ? path.dirname(abs) : abs;
    assert.ok(fs.existsSync(probe), `${c.cellId}: owner ${c.owner.path} is on disk`);
  }
});

test("the parity table's consumers are all covered: no mounted V19 §1a/§1b owner is missing from the projection's sources", () => {
  const keys = new Set(P.sources.map((s) => s.key));
  for (const k of ["portfolio", "receipts", "bankedLadders", "moonshotLedger", "mlbLifetime", "nbaLifetime", "riskLadder", "labLedger", "modelHealth", "cycleTable"]) assert.ok(keys.has(k), k);
  assert.ok([...keys].some((k) => k.startsWith("gradedPicks.")));
});
