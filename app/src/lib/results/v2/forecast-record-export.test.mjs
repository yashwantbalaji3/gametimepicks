/**
 * Audit 2026-10-23 · A-T07 — the public Forecast Record CSVs, read back exactly as a downloader would.
 *
 *   F02  every settled multiclass row exports the model's full outcome vector, and rescoring that vector with the
 *        documented rule reproduces the exported Brier and log loss within 1e-6 (the stored scores are rounded to
 *        6 decimals, so ≤ 5e-7 rounding plus float noise).
 *   F01  every row carries a provenance state and, per field, the state / value / source it rests on.
 *   Determinism: emitting twice from the same ledger gives byte-identical files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emitForecastRecord, familyCsvs } from "../../../../scripts/results/emit-forecast-record-assets.mjs";
import { CSV_COLUMNS } from "./forecast-record.mjs";
import { PROVENANCE_FIELDS, PROVENANCE_STATE } from "../../forecast-ledger/provenance.mjs";

const LEDGER = path.resolve(process.cwd(), "..", "data/internal/forecast-ledger/v1");
const TOLERANCE = 1e-6;

function ledgerRows() {
  const manifest = JSON.parse(fs.readFileSync(path.join(LEDGER, "manifest.json"), "utf8"));
  const rows = [];
  for (const s of Object.values(manifest.sports)) for (const l of fs.readFileSync(path.join(LEDGER, s.file), "utf8").split("\n")) if (l.trim()) rows.push(JSON.parse(l));
  return rows;
}

/** RFC 4180: quoted cells may hold commas and doubled quotes. */
function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); out.push(row); row = []; cell = ""; } else cell += c;
  }
  const [head, ...body] = out;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

let cached = null;
const csvs = () => (cached ??= familyCsvs(ledgerRows()));

test("F02: every settled multiclass row exports its full vector, and rescoring it reproduces the stored Brier and log loss", () => {
  const multi = Object.entries(csvs()).filter(([f]) => /(1x2|scoreline)\.csv$/.test(f));
  assert.deepEqual(multi.map(([f]) => f).sort(), ["epl-epl-1x2.csv", "epl-epl-scoreline.csv", "ligue-1-ligue1-1x2.csv"]);
  let rescored = 0;
  for (const [file, text] of multi) {
    for (const r of parseCsv(text)) {
      assert.equal(r.forecastKind, "MULTICLASS_PROBABILITY", file);
      assert.ok(r.classProbabilities, `${file} ${r.forecastId}: vector exported`);
      assert.ok(r.vectorRule, `${file} ${r.forecastId}: rule exported`);
      const cp = JSON.parse(r.classProbabilities);
      const keys = Object.keys(cp);
      assert.ok(keys.length >= 3 && keys.every((k) => Number.isFinite(cp[k]) && cp[k] >= 0), `${file} ${r.forecastId}: a probability per class`);
      if (file.includes("scoreline")) {
        assert.ok("OTHER" in cp, "a score table carries its OTHER bin");
        const listed = keys.filter((k) => k !== "OTHER").reduce((a, k) => a + cp[k], 0);
        assert.equal(cp.OTHER, Number(Math.max(0, 1 - listed).toFixed(6)), `${r.forecastId}: OTHER follows the documented rule`);
        assert.match(r.vectorRule, /OTHER = max\(0, 1 - sum of the listed scores\)/);
      } else {
        assert.deepEqual(keys, ["home", "draw", "away"]);
      }
      if (r.settlementState !== "SETTLED") continue;
      assert.ok(r.finalCategory in cp, `${r.forecastId}: the observed category ${r.finalCategory} is one of the classes`);
      let brier = 0;
      for (const k of keys) brier += (cp[k] - (k === r.finalCategory ? 1 : 0)) ** 2;
      const p = Math.min(1 - 1e-6, Math.max(1e-6, cp[r.finalCategory]));
      const logLoss = -Math.log(p);
      assert.ok(Math.abs(brier - Number(r.brier)) <= TOLERANCE, `${file} ${r.forecastId}: Brier ${brier} vs stored ${r.brier}`);
      assert.ok(Math.abs(logLoss - Number(r.logLoss)) <= TOLERANCE, `${file} ${r.forecastId}: log loss ${logLoss} vs stored ${r.logLoss}`);
      rescored += 1;
    }
  }
  assert.ok(rescored >= 168, `rescored ${rescored} settled multiclass rows (the audit counted 168)`);
});

test("F02 probe: a perturbed exported vector no longer reproduces its stored score (control above)", () => {
  const text = csvs()["epl-epl-1x2.csv"];
  const r = parseCsv(text).find((x) => x.settlementState === "SETTLED");
  const cp = JSON.parse(r.classProbabilities);
  cp[r.finalCategory] += 0.01;
  let brier = 0;
  for (const k of Object.keys(cp)) brier += (cp[k] - (k === r.finalCategory ? 1 : 0)) ** 2;
  assert.ok(Math.abs(brier - Number(r.brier)) > TOLERANCE, "the check can fail");
});

test("F01: every exported row states its provenance and, per field, the state, value and source it rests on", () => {
  for (const c of ["provenance", ...PROVENANCE_FIELDS.flatMap((f) => [`${f}State`, `${f}Evidence`, `${f}Source`])]) assert.ok(CSV_COLUMNS.includes(c), c);
  assert.ok(!CSV_COLUMNS.some((c) => /price|odds|american|decimal/i.test(c)), "no sportsbook price column");
  const states = Object.values(PROVENANCE_STATE);
  let n = 0;
  const unknownByFile = {};
  for (const [file, text] of Object.entries(csvs())) {
    for (const r of parseCsv(text)) {
      n += 1;
      assert.ok(states.includes(r.provenance), `${file} ${r.forecastId}: ${r.provenance}`);
      let weakest = "RECEIPT";
      for (const f of PROVENANCE_FIELDS) {
        const s = r[`${f}State`];
        assert.ok(states.includes(s), `${file} ${r.forecastId} ${f}`);
        if (s === "LEGACY_UNKNOWN") {
          assert.equal(r[`${f}Evidence`], "", "unknown is empty, never a guess");
          assert.equal(r[`${f}Source`], "");
          weakest = "LEGACY_UNKNOWN";
        } else {
          assert.ok(r[`${f}Evidence`] && r[`${f}Source`], `${file} ${r.forecastId} ${f}: a value and its source`);
          if (s === "GIT_HISTORY") assert.match(r[`${f}Source`], /^git:[0-9a-f]{12}\b/, "git evidence names its commit");
          if (s === "GIT_HISTORY" && weakest === "RECEIPT") weakest = "GIT_HISTORY";
        }
        // the original column is the row as recorded: a recovered value never appears there
        if (r[f] !== "") assert.equal(r[`${f}Evidence`], r[f], `${file} ${r.forecastId} ${f}`);
      }
      assert.equal(r.provenance, weakest, `${file} ${r.forecastId}: the row is as known as its weakest field`);
      if (r.publishedAtEvidence && r.eventStartEvidence) assert.ok(Date.parse(r.publishedAtEvidence) < Date.parse(r.eventStartEvidence), `${file} ${r.forecastId}: publication before start`);
      if (r.provenance === "LEGACY_UNKNOWN") unknownByFile[file] = (unknownByFile[file] ?? 0) + 1;
    }
  }
  assert.equal(n, ledgerRows().length, "every ledger row exported once");
});

test("determinism: emitting twice from the same ledger gives byte-identical files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forecast-record-"));
  try {
    const a = emitForecastRecord({ ledgerDir: LEDGER, outDir: path.join(tmp, "a") });
    const b = emitForecastRecord({ ledgerDir: LEDGER, outDir: path.join(tmp, "b") });
    assert.deepEqual(a, b);
    assert.equal(a.files.length, Object.keys(csvs()).length);
    const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    for (const f of a.files) {
      assert.equal(sha(path.join(tmp, "a", f)), sha(path.join(tmp, "b", f)), f);
      assert.equal(fs.readFileSync(path.join(tmp, "a", f), "utf8"), csvs()[f], `${f}: the emitted file is familyCsvs' text`);
    }
    assert.ok(!/generatedAt|exportedAt/.test(fs.readFileSync(path.join(tmp, "a", a.files[0]), "utf8").split("\n")[0]), "no clock column");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
