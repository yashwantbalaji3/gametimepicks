/**
 * Track B on real committed data: KC @ SEA (401873022, 2026-10-25 ET). The Forecast Ledger is append-only, so
 * this settled game's rows do not change when new slates land (a deliberate choice: no "latest slate" assertion,
 * which would turn red on a data commit).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REASON } from "../contracts/index.mjs";
import { candidateFor, buildRecapDraft } from "../recap/pipeline.mjs";
import { runIntegrityGate } from "../recap/integrity-gate.mjs";
import { buildFactBundle, claimOf } from "../recap/fact-bundle-nfl.mjs";
import { validateCaption } from "../recap/caption-validator.mjs";
import { templateCaptions } from "../recap/captions.mjs";
import { pngSize, templateSlots } from "../render/render-png.mjs";
import { sha256 } from "../lib/util.mjs";
import { tempDir } from "./helpers.mjs";

const EVENT = "401873022";
const fresh = () => structuredClone(candidateFor(EVENT).candidate);

test("the real game passes the gate, with the offline and experimental warnings attached", () => {
  const v = runIntegrityGate(fresh());
  assert.equal(v.pass, true, JSON.stringify(v.refusals));
  assert.deepEqual(v.warnings.map((w) => w.code).sort(), ["MODEL_EXPERIMENTAL", "SERVED_REVISION_NOT_CHECKED"]);
});

const VARIANTS = {
  "post-kickoff revision": [(c) => { c.receipt.generatedAt = "2026-10-26T01:00:00Z"; c.receipt.sideDecision.frozenAt = "2026-10-26T01:00:00Z"; }, REASON.POST_START_REVISION],
  "withdrawn forecast": [(c) => { c.winner.withdrawal = { at: "2026-10-25T23:00:00Z", reason: "QUESTIONABLE" }; }, REASON.WITHDRAWN],
  "uncleared player_pass_yds claim": [(c) => { c.extraClaims.push({ family: "player_pass_yds", key: "qb.passYds", value: 122 }); }, REASON.FAMILY_NOT_CLEARED],
  "unsettled game": [(c) => { c.winner.settlement = { ...c.winner.settlement, state: "PENDING" }; }, REASON.NOT_SETTLED],
  "provisional finality": [(c) => { c.total.settlement = { ...c.total.settlement, finality: "PROVISIONAL" }; }, REASON.NOT_CANONICAL],
  "private research source": [(c) => { c.receiptPath = "data/internal/research/nfl/sim-v2/shadow/2026-10-25/x.json"; }, REASON.PRIVATE_SOURCE],
};

for (const [name, [mutate, code]] of Object.entries(VARIANTS)) {
  test(`gate refuses: ${name} → ${code}`, () => {
    const c = fresh();
    mutate(c);
    const v = runIntegrityGate(c);
    assert.equal(v.pass, false);
    assert.ok(v.refusals.some((r) => r.code === code), JSON.stringify(v.refusals));
  });
}

test("gate also refuses a receipt whose number disagrees with the ledger", () => {
  const c = fresh();
  c.receipt.forecastSummary.winProbability.home = 0.7;
  assert.ok(runIntegrityGate(c).refusals.some((r) => r.code === REASON.RECEIPT_MISMATCH));
});

test("fact bundle: every claim traces to a file hash, and the numbers match the ledger", () => {
  const { bundle } = buildFactBundle(fresh());
  for (const claim of bundle.claims) assert.match(claim.evidenceRef.sha256, /^[0-9a-f]{64}$/, claim.key);
  assert.equal(claimOf(bundle, "favoured.winProbability").display, "62.6%");
  assert.equal(claimOf(bundle, "final.home").value, 20);
  assert.equal(claimOf(bundle, "final.away").value, 3);
  assert.equal(claimOf(bundle, "projected.total").value, 42);
  assert.equal(claimOf(bundle, "result.side").value, "WIN");
  assert.equal(claimOf(bundle, "result.totalInsideRange").value, false);
  assert.equal(claimOf(bundle, "frozenAt").display, "Oct 25, 6:36 PM ET");
});

test("captions: both template variants pass; invented numbers, banned words, links and hidden misses fail", () => {
  const { bundle, digest } = buildFactBundle(fresh());
  const { captionSet } = templateCaptions(bundle, digest);
  assert.equal(captionSet.variants.length, 2);
  for (const v of captionSet.variants) assert.deepEqual(validateCaption(v.text, bundle).problems, [], v.text);

  const codes = (t) => validateCaption(t, bundle).problems.map((p) => p.code);
  assert.ok(codes("Our forecast had Seattle at 71% to win.").includes(REASON.UNTRACEABLE_NUMBER));
  assert.ok(codes("Seattle was a lock, per our forecast.").includes(REASON.FORBIDDEN_TERM));
  assert.ok(codes("Our pick: Seattle. Forecast frozen.").includes(REASON.FORBIDDEN_TERM));
  assert.ok(codes("Forecast recap at gametimepicks.com").includes(REASON.URL_IN_CAPTION));
  assert.ok(codes("Seahawks 20, Chiefs 3.").includes(REASON.MISSING_FORECAST_WORD));
  assert.ok(codes(`${"Forecast ".repeat(40)}`).includes(REASON.TOO_LONG));

  // A miss must be called a miss.
  const loss = structuredClone(bundle);
  claimOf(loss, "result.side").value = "LOSS";
  assert.ok(validateCaption("Our forecast had the Seahawks at 62.6%. Chiefs 3.", loss).problems.some((p) => p.code === REASON.MISS_NOT_DISCLOSED));
  const lossCaptions = templateCaptions(loss, "x").captionSet.variants;
  for (const v of lossCaptions) assert.ok(/miss/i.test(v.text), v.text);
});

test("template slots carry the experimental label and never a logo or odds", () => {
  const { bundle } = buildFactBundle(fresh());
  const slots = templateSlots(bundle);
  assert.equal(slots.modelLine, "Experimental model");
  assert.match(slots.disclaimer, /not betting advice/);
  const tpl = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../render/templates/nfl-recap.html"), "utf8");
  assert.doesNotMatch(tpl, /odds|\+\d{3}|-1\d\d\b/i);
});

test("render: PNG is exactly 1080×1350 and re-renders to identical bytes", async () => {
  const dir = tempDir();
  const a = await buildRecapDraft(fresh(), { outDir: path.join(dir, "a") });
  const b = await buildRecapDraft(fresh(), { outDir: path.join(dir, "b") });
  const pngA = fs.readFileSync(path.join(dir, "a", a.media.file));
  assert.deepEqual(pngSize(pngA), { width: 1080, height: 1350 });
  assert.equal(a.media.sha256, sha256(pngA));
  assert.equal(a.media.sha256, b.media.sha256, "same bundle, same machine → same PNG bytes");
  assert.equal(a.factBundleDigest, b.factBundleDigest);
  assert.ok(a.captionChecks.every((c) => c.ok));
  assert.equal(a.publishBundles.length, 2);
});
