/**
 * A DIAGNOSTIC THAT MATTERS MUST BE A BAR (P294).
 *
 * The incumbent totals head was adopted ELIGIBLE by an honest, preregistered, forward-only review. It
 * still shipped explaining roughly 2% of the variance in game totals and running +1.79 points high on
 * the held-out season, because of one sentence in its preregistration:
 *
 *     "reportedDiagnostics": "sd of predicted means across 2025 (does the head actually
 *      differentiate games) ... Diagnostics are REPORTED, never bars."
 *
 * The author measured the right thing, wrote down why it mattered, and then declared it categorically
 * incapable of failing the candidate. The three bars that COULD fail it — mean NLL, 80% coverage, MAE
 * against a constant — are all easy to pass with a near-constant predictor when sigma is 13.3, and the
 * thing it had to beat WAS a constant. Nothing tested whether the head was centred at all.
 *
 * This does not re-litigate that decision. It binds the next one: any preregistration for an NFL
 * totals head must carry a bar on centring and a bar on differentiation, and may not declare
 * diagnostics categorically non-binding. If a future author wants to adopt a head that cannot
 * differentiate games, they must say so in a bar and let it fail, not in prose that cannot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPORTS = path.join(APP, "..", "data", "internal", "research", "nfl", "reports");

/** Every committed NFL totals preregistration, newest contract last. */
function preregistrations() {
  if (!fs.existsSync(REPORTS)) return [];
  return fs.readdirSync(REPORTS)
    .filter((f) => /totals.*preregistration\.json$/.test(f))
    .map((f) => ({ file: f, doc: JSON.parse(fs.readFileSync(path.join(REPORTS, f), "utf8")) }));
}

/** The contract in force: the highest-versioned totals preregistration on disk. */
function current() {
  const all = preregistrations();
  return all.find((p) => /v2|v3|v4/.test(p.file)) ?? all[all.length - 1] ?? null;
}

test("an NFL totals preregistration exists and is readable", () => {
  const all = preregistrations();
  assert.ok(all.length >= 1, "no totals preregistration on disk — the head would be unreviewed");
  for (const p of all) {
    assert.ok(p.doc.frozenBars, `${p.file}: a preregistration without frozen bars is not one`);
    assert.ok(p.doc.decisionRule, `${p.file}: no decision rule`);
  }
});

test("the contract in force bars CENTRING — the bar the incumbent lacked", () => {
  const c = current();
  assert.ok(c, "no current totals contract");
  const barNames = Object.keys(c.doc.frozenBars).join(" ").toLowerCase();
  assert.match(
    barNames, /centring|centering|bias/,
    `${c.file}: no centring bar. The incumbent ran +1.79 points high on held-out 2025 and passed every bar it had, because MAE at sigma 13.3 barely notices a two-point offset.`,
  );
  const centring = Object.entries(c.doc.frozenBars).find(([k]) => /centring|centering|bias/i.test(k));
  assert.match(
    String(centring[1]), /\d/,
    `${c.file}: the centring bar states no threshold — a bar without a number cannot fail a candidate`,
  );
});

test("the contract in force bars DIFFERENTIATION, not merely reports it", () => {
  const c = current();
  const barText = JSON.stringify(c.doc.frozenBars).toLowerCase();
  assert.match(
    barText, /sd\(predicted\)|discrimination|differentiate/,
    `${c.file}: differentiation appears in no bar. The incumbent's own preregistration reported it — "does the head actually differentiate games" — and then made it unable to fail anything.`,
  );
});

test("no contract may declare diagnostics categorically non-binding again", () => {
  /*
   * The exact sentence that let a 2%-of-variance head through. A future contract may say a PARTICULAR
   * diagnostic is not a bar; it may not say that diagnostics as a class never are.
   */
  const c = current();
  const diag = String(c.doc.reportedDiagnostics ?? "");
  const categorical = /diagnostics are (?:reported,? )?never bars\.?\s*$/i.test(diag.trim());
  assert.equal(
    categorical, false,
    `${c.file}: reportedDiagnostics ends by declaring diagnostics categorically never bars — that sentence is how the incumbent shipped`,
  );
});

test("the held-out set is not one the author has already examined", () => {
  /*
   * The correction was DIAGNOSED on 2025. Scoring it there would measure hindsight. A contract that
   * reuses an examined season has to say why it is still held out, and there is no good answer.
   */
  const c = current();
  const held = JSON.stringify(c.doc.heldOutSet ?? c.doc.candidate?.fitProtocol ?? {});
  assert.ok(held.length > 20, `${c.file}: no held-out set is described`);
  if (/2025/.test(held) && /2026/.test(held)) return;      // describes both: the why-not text is present
  if (/2025/.test(held)) {
    assert.match(
      held, /whyNot2025|already looked|not held out|examined/i,
      `${c.file}: scores on 2025 without addressing that 2025 was examined to find the defect`,
    );
  }
});
