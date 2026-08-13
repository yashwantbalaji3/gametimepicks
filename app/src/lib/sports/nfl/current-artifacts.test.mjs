/**
 * Release E guards (Program 171): every committed current-event artifact passes the shared
 * contract; corruption fails it; the model read and the market read live side by side without
 * blending; append-only naming holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateCurrentEventArtifact } from "./current-event-contract.mjs";

const ROOT = path.join(process.cwd(), "..");
const CURRENT_DIR = path.join(ROOT, "data/internal/nfl/current");

function allArtifacts() {
  if (!fs.existsSync(CURRENT_DIR)) return [];
  const out = [];
  for (const date of fs.readdirSync(CURRENT_DIR)) {
    const dir = path.join(CURRENT_DIR, date);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      out.push({ date, file: f, artifact: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) });
    }
  }
  return out;
}
const artifacts = allArtifacts();

test("committed current artifacts exist for the first authorized window and pass the contract", () => {
  assert.ok(artifacts.length >= 6, `expected the first window's artifacts, found ${artifacts.length}`);
  for (const { date, file, artifact } of artifacts) {
    const check = validateCurrentEventArtifact(artifact);
    assert.equal(check.ok, true, `${date}/${file}: ${check.errors?.join("; ")}`);
    assert.match(file, /^\d+-\d{4}Z\.json$/, "append-only naming: eventId-HHMMZ.json, a rerun stamps a NEW file");
    assert.equal(artifact.artifactDate, date, "an artifact lives in its own date directory");
  }
});

test("preseason honesty: model abstains, props ROLE_UNCERTAIN, research sim REDUCED_PRESEASON ≈ coin", () => {
  const pre = artifacts.filter((a) => a.artifact.seasonType === 1);
  assert.ok(pre.length >= 6);
  for (const { artifact } of pre) {
    assert.equal(artifact.families.teamModel.state, "ABSTAIN");
    assert.equal(artifact.families.playerProps.state, "ROLE_UNCERTAIN");
    const sim = artifact.research.gamesim;
    if (sim?.winProbability) {
      assert.equal(sim.evidenceTier, "REDUCED_PRESEASON");
      assert.ok(Math.abs(sim.winProbability.home - 0.5) < 0.12, `shrunk preseason win prob stays near coin (got ${sim.winProbability.home})`);
    }
  }
});

test("the market read and the model read are separate numbers — no blending, ever", () => {
  const captured = artifacts.filter((a) => a.artifact.families.market.state?.startsWith("CAPTURED") && a.artifact.research.gamesim?.winProbability);
  assert.ok(captured.length >= 1);
  for (const { artifact } of captured) {
    const model = artifact.research.gamesim.winProbability.home;
    const market = artifact.families.market.consensus.homeWinProbNoVig;
    assert.notEqual(model, market);
    assert.ok(artifact.settlementTargets.moneylineNoVig.home === market, "settlement targets pin the captured market, not the model");
  }
});

test("corruption fails the shared contract: late stamps, blended reads, broken targets", () => {
  const base = artifacts.find((a) => a.artifact.families.market.state === "CAPTURED_FRESH").artifact;
  const late = JSON.parse(JSON.stringify(base));
  late.evidence.odds.asOf = late.kickoffUtc;
  assert.equal(validateCurrentEventArtifact(late).ok, false, "an odds stamp AT kickoff must refuse");
  const blended = JSON.parse(JSON.stringify(base));
  blended.research.gamesim.winProbability.home = blended.families.market.consensus.homeWinProbNoVig;
  assert.equal(validateCurrentEventArtifact(blended).ok, false, "model == market byte-for-byte must refuse");
  const broken = JSON.parse(JSON.stringify(base));
  broken.settlementTargets.moneylineNoVig.home = 0.9; // away still ~0.3 → sum ≠ 1
  assert.equal(validateCurrentEventArtifact(broken).ok, false, "incoherent no-vig targets must refuse");
  const activated = JSON.parse(JSON.stringify(base));
  activated.publicActivation = "ON";
  assert.equal(validateCurrentEventArtifact(activated).ok, false, "activation is never flipped inside an artifact");
});

test("anytime-TD family carries the NO_MARKET price truth from the authorized probe", () => {
  const withBoards = artifacts.filter((a) => a.artifact.families.anytimeTd.state === "MODELLED_NOT_PUBLISHABLE");
  assert.ok(withBoards.length >= 6);
  for (const { artifact } of withBoards) {
    assert.match(artifact.families.anytimeTd.scorerPriceState, /NO_MARKET/, "the probe proved absence — AUTH_REQUIRED would be stale language");
  }
});
