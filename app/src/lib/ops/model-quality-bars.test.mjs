/**
 * Phase D · D-1 — every bar in the registry is CITED from the file that froze it, and still matches that file;
 * every family the model-health scorecard judges has a bar or an explicit reason it has none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MODEL_QUALITY_BARS, JUDGED_BY_OWN_RECEIPT, barFor, coverageOf, ece10, barVerdict } from "./model-quality-bars.mjs";

const REPO = path.resolve(process.cwd(), "..");
const at = (doc, pointer) => pointer.split("/").slice(1).reduce((x, k) => (x == null ? undefined : x[k]), doc);

function citations(entry) {
  const out = [];
  const push = (c) => c && out.push(c);
  push(entry.source); (entry.also ?? []).forEach(push);
  for (const m of Object.values(entry.byModel ?? {})) { push(m.source); (m.also ?? []).forEach(push); }
  return out;
}

test("🔴 every citation resolves in its source file, and its quote / value still matches verbatim", () => {
  let checked = 0;
  for (const [id, entry] of Object.entries(MODEL_QUALITY_BARS)) {
    for (const c of citations(entry)) {
      const p = path.join(REPO, c.file);
      assert.ok(fs.existsSync(p), `${id}: ${c.file} exists`);
      const v = at(JSON.parse(fs.readFileSync(p, "utf8")), c.pointer);
      assert.notEqual(v, undefined, `${id}: ${c.file}#${c.pointer} resolves`);
      if ("quote" in c) assert.ok(String(v).includes(c.quote), `${id}: "${c.quote}" is in ${c.file}#${c.pointer} — got "${String(v).slice(0, 160)}"`);
      if ("value" in c) assert.deepEqual(v, c.value, `${id}: ${c.file}#${c.pointer}`);
      checked++;
    }
  }
  assert.ok(checked >= 15, `citations checked: ${checked}`);
});

test("🔴 the machine-readable bar says what its cited passage says (numbers appear in the quote or equal the value)", () => {
  const nums = (s) => (String(s).match(/\d+\.\d+|\d+/g) ?? []).map(Number);
  for (const [id, entry] of Object.entries(MODEL_QUALITY_BARS)) {
    const variants = entry.byModel ? Object.values(entry.byModel) : [entry];
    for (const v of variants) {
      if (!v.bar) continue;
      const cited = citations(v).flatMap((c) => ("quote" in c ? nums(c.quote) : [].concat(c.value).flat()));
      for (const [k, val] of Object.entries(v.bar)) {
        for (const n of [].concat(val).filter((x) => typeof x === "number")) assert.ok(cited.includes(n), `${id}.${k}=${n} is not in its cited passage (${cited.join(",")})`);
      }
    }
  }
});

test("every family the scorecard judges has a bar, an explicit no-bar reason, or its own forward receipt", () => {
  const health = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/admin/model-health.json"), "utf8"));
  for (const f of health.families) {
    if (JUDGED_BY_OWN_RECEIPT.test(f.id)) continue;
    const e = MODEL_QUALITY_BARS[f.id];
    assert.ok(e, `${f.id}: no registry entry`);
    assert.ok(e.bar || e.byModel || e.noBarReason, `${f.id}: a bar or the reason there is none`);
  }
});

test("barFor picks the bar of the model that publishes; a null model means the props-v1 gate", () => {
  assert.equal(barFor("nfl_player_receptions").model, "player-props-v1");
  assert.deepEqual(barFor("nfl_player_rush_yds", "nfl-player-share-level-v1").bar.level, [0.92, 1.08]);
  assert.equal(barFor("nfl_player_rush_yds", "some-unregistered-model"), null, "an unregistered model has no bar — never borrowed");
  assert.equal(barFor("mlb_total").bar, null);
});

// ── D-2 · the advisory verdict ─────────────────────────────────────────────────────────────────────────

test("🔴 coverage: inclusive counts an endpoint inside; mid-p counts it one half; unscored rows never count", () => {
  const rows = [{ low: 2, high: 6, actual: 6 }, { low: 2, high: 6, actual: 4 }, { low: 2, high: 6, actual: 9 }, { low: 2, high: 6, actual: 2 }, { low: 2, high: null, actual: 3 }];
  assert.deepEqual(coverageOf(rows), { n: 4, inclusive: 0.75, midP: 0.5, onEndpoint: 2 });
  assert.deepEqual(coverageOf([]), { n: 0, inclusive: null, midP: null, onEndpoint: 0 });
});

test("ece10: equal-width bins weighted by count", () => {
  // bin 1 (two rows): |0.15 − 0.5| = 0.35; bin 8 (two rows): |0.85 − 1| = 0.15; weighted 0.35·½ + 0.15·½ = 0.25
  assert.equal(ece10([0.15, 0.15, 0.85, 0.85], [0, 1, 1, 1]), 0.25);
  assert.equal(ece10([], []), null);
});

test("🔴 verdicts: a band fails on BOTH sides; below minimum n shows checks without a verdict; missing inputs are named", () => {
  const cov = barFor("nfl_player_reception_yds");
  assert.equal(barVerdict(cov, { coverage80: 0.80 }, 500).verdict, "ON_TRACK");
  assert.equal(barVerdict(cov, { coverage80: 0.91 }, 500).verdict, "BELOW_BAR", "too wide is outside the band — widening cannot pass it");
  assert.equal(barVerdict(cov, { coverage80: 0.65 }, 500).verdict, "BELOW_BAR");
  const small = barVerdict(cov, { coverage80: 0.95 }, 100);
  assert.equal(small.verdict, "TOO_SMALL"); assert.equal(small.checks[0].pass, false, "the check is still shown");
  assert.deepEqual(barVerdict(cov, { coverage80: 0.8 }, 500).notComputable, ["ece"], "the ledger cannot compute threshold ECE — said, not guessed");
  assert.equal(barVerdict(barFor("nfl_winner"), {}, 100).verdict, "NOT_COMPUTABLE");
  assert.equal(barVerdict(barFor("mlb_total"), {}, 900).verdict, "NO_BAR");
});

test("🔴 the scorecard attaches the bar beside the floor and never lets it change a state; receptions are judged mid-p", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ops/build-model-health.mjs"), "utf8");
  assert.match(src, /f\.bar = \{ \.\.\.v,/);
  assert.doesNotMatch(src, /f\.state\s*=\s*[^=]/, "an advisory verdict never rewrites a family's state");
  assert.match(src, /countFamily \? cov\.midP : cov\.inclusive/);
  assert.equal(MODEL_QUALITY_BARS.nfl_player_receptions.countFamily, true);
  assert.ok(!MODEL_QUALITY_BARS.nfl_player_reception_yds.countFamily, "a continuous family keeps inclusive coverage");
});
