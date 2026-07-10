/**
 * PAPER TRACK RECORD — internal paper performance, kept strictly out of the official 19-14 record.
 *
 * Pins: the committed summary is internal + money-walled + honest (paper units only, "not meaningful yet"
 * on a tiny sample); the builder writes no money artifact; and no public code imports the track record.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const repo = path.join(app, "..");
const summaryPath = path.join(repo, "data/internal/product-cards/track-record/summary.json");
const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
}));

test("1 · the paper track record is internal, money-walled, and paper-units-only", () => {
  if (!fs.existsSync(summaryPath)) return;
  const j = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.equal(j.public, false);
  assert.equal(j.officialMoneyRecordAffected, false);
  assert.equal(j.activationStatus, "internal_only");
  assert.equal(typeof j.paperPnlUnits, "number");
  // Tallies are internally consistent.
  assert.equal(j.paperCardsSettled + j.paperCardsPending, j.paperCardsTotal);
  // A tiny sample must NOT claim to be a meaningful record.
  if (j.paperCardsSettled < 10) assert.equal(j.meaningful, false, "small sample ⇒ not meaningful yet");
});

test("2 · the builder writes no money artifact + never under public/", () => {
  const src = fs.readFileSync(path.join(app, "scripts", "build-paper-track-record.mjs"), "utf8");
  assert.doesNotMatch(src, /(readFileSync|writeFileSync|path\.join)\([^)]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, "no money fs op");
  assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, "never writes under public/");
});

test("3 · no public page/component imports or reads the INTERNAL paper track record", () => {
  // NB: the public site legitimately references the OFFICIAL 'track record' (the 19-14 canonical ledger).
  // What's forbidden is reading the INTERNAL paper track-record artifact / its builder.
  for (const dir of ["src/app", "src/components"]) {
    for (const f of walk(path.join(app, dir))) {
      const s = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(s, /product-cards\/track-record|build-paper-track-record|from\s+["'][^"']*product-workflow/, `${path.relative(app, f)} must not read the internal paper track record`);
    }
  }
});

test("4 · the track record is NOT web-served", () => {
  assert.ok(!fs.existsSync(path.join(app, "public/data/product-cards")), "no public product-cards tree");
  assert.ok(!fs.existsSync(path.join(app, "public/data/track-record")), "no public track-record");
});
