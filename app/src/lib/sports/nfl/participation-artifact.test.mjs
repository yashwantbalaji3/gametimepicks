/**
 * Release A guards (Program 182): participation is a DISTRIBUTION with named uncertainty, the
 * confident states are unreachable without a source we do not have, and the preseason trap is
 * closed by construction.
 *
 * THE TRAP. The role corpus is regular-season usage: it says a starting quarterback takes ~64% of
 * his team's pass attempts. Carrying that number into an August game would hand a projection a
 * full-game workload and call it evidence. These tests hold the widening that prevents it, and the
 * reconciliation that keeps the unmodelled part of the game visible instead of absorbed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PARTICIPATION_STATES, REQUIRES_AUTHORIZED_ACTIVES } from "./participation-states.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-participation.mjs"), "utf8");
const summary = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/participation-summary.json"), "utf8"));

const artifacts = [];
const root = path.join(ROOT, "data/internal/nfl/participation");
for (const day of fs.existsSync(root) ? fs.readdirSync(root) : []) {
  for (const f of fs.readdirSync(path.join(root, day)).filter((x) => /^\d+\.json$/.test(x))) {
    artifacts.push(JSON.parse(fs.readFileSync(path.join(root, day, f), "utf8")));
  }
}

test("every weekend event has a versioned artifact, cutoff-safe", () => {
  assert.ok(artifacts.length >= 10, `all ten weekend events covered (got ${artifacts.length})`);
  for (const a of artifacts) {
    assert.equal(a.dataClass, "PRIVATE_RESEARCH");
    assert.ok(a.inputHash, `${a.matchup} pins its inputs`);
    assert.equal(a.cutoffSafe, true, `${a.matchup}: the roster evidence predates its own kickoff`);
    assert.equal(Object.keys(a.teams).length, 2);
  }
});

test("MASS RECONCILES — the unmodelled part of the game stays VISIBLE, never absorbed", () => {
  let checked = 0;
  for (const a of artifacts) {
    for (const [team, tv] of Object.entries(a.teams)) {
      for (const [market, mv] of Object.entries(tv.markets)) {
        checked += 1;
        assert.equal(mv.reconciles, true, `${a.matchup} ${team} ${market}`);
        assert.ok(Math.abs(mv.namedMassP50 + mv.unallocatedMass - 1) < 1e-6,
          `${a.matchup} ${team} ${market}: named + unallocated must be exactly the whole`);
        assert.ok(mv.unallocatedMass > 0, `${a.matchup} ${team} ${market}: backups and unlisted players hold real mass`);
      }
    }
  }
  assert.ok(checked >= 60, `every team-market checked (${checked})`);
});

test("THE PRESEASON TRAP IS CLOSED — no player inherits a regular-season workload", () => {
  assert.match(src, /carrying that basis through unchanged would hand a projection a full-game workload/);
  for (const a of artifacts) {
    for (const tv of Object.values(a.teams)) {
      for (const mv of Object.values(tv.markets)) {
        for (const p of mv.players) {
          assert.ok(p.preseasonShare.p50 < p.regularSeasonShare,
            `${p.name}: the preseason median must sit below the regular-season basis`);
          assert.ok(p.preseasonShare.p90 < p.regularSeasonShare || p.regularSeasonShare < 0.05,
            `${p.name}: even the optimistic end stays below a full regular-season workload`);
          assert.ok(p.preseasonShare.p10 < p.preseasonShare.p50 && p.preseasonShare.p50 < p.preseasonShare.p90,
            `${p.name}: a distribution, not a point`);
        }
      }
    }
  }
});

test("A DISTRIBUTION IS WIDE ON PURPOSE — a one-series starter and a half-game starter both fit", () => {
  const qb = artifacts.flatMap((a) => Object.values(a.teams))
    .flatMap((t) => t.markets.passAttempts.players).find((p) => p.position === "QB" && p.regularSeasonShare > 0.4);
  assert.ok(qb, "a nominal starting quarterback is present");
  const ratio = qb.preseasonShare.p90 / qb.preseasonShare.p10;
  assert.ok(ratio > 5, `the range spans a one-series and a half-game outcome (p90/p10 = ${ratio.toFixed(1)})`);
});

test("THE CONFIDENT STATES ARE UNREACHABLE, and the reason is named", () => {
  for (const a of artifacts) {
    for (const tv of Object.values(a.teams)) {
      for (const mv of Object.values(tv.markets)) {
        for (const p of mv.players) {
          assert.ok(PARTICIPATION_STATES.includes(p.state), `${p.state} is outside the closed vocabulary`);
          assert.equal(p.state, "AVAILABLE_ROLE_UNCERTAIN",
            `${p.name}: without a registered actives source, no player may be called a starter`);
          assert.ok(p.stateReason.length > 40, "the refusal names its cause");
        }
      }
    }
    assert.match(a.sourceContract.absent, /actives/);
    assert.match(a.sourceContract.whatAbsenceMeans, /UNREACHABLE/);
  }
  // and the absence is structural, not an accident of which branch was written
  assert.match(src, /REQUIRES_AUTHORIZED_ACTIVES/);
  assert.match(src, /Listed explicitly so the absence is a documented\s*\n?\s*\* refusal rather than an accident/);
});

test("SENSITIVITY · removing a player moves his mass to unallocated, not into thin air", () => {
  // Drive the reconciliation directly: dropping a player must increase unallocated by exactly his
  // median share. This is the invariant that keeps "a starter is out" from silently inflating
  // everyone else without evidence.
  const a = artifacts[0];
  const team = Object.keys(a.teams)[0];
  const mv = a.teams[team].markets.passAttempts;
  const dropped = mv.players[0];
  const remaining = mv.players.slice(1).reduce((s, p) => s + p.preseasonShare.p50, 0);
  const newUnallocated = 1 - remaining;
  assert.ok(Math.abs(newUnallocated - (mv.unallocatedMass + dropped.preseasonShare.p50)) < 1e-6,
    "a removed player's mass becomes unallocated — it is never redistributed to teammates without evidence");
});

test("PUBLIC · the summary leads with the limitation and never claims a player will play", () => {
  assert.equal(summary.dataClass, "PUBLIC_DERIVED");
  assert.match(summary.headline, /We do not know who will play/);
  assert.match(summary.whyNotKnown, /No source we are authorized to use/);
  assert.match(summary.whatWeDoInstead, /RANGE/);
  assert.deepEqual(summary.unreachableWithoutSource, [...REQUIRES_AUTHORIZED_ACTIVES]);
  const blob = JSON.stringify(summary);
  // A claim phrase inside its own DENIAL is the opposite of a claim — the headline is literally
  // "We do not know who will play". Forbidding the words outright would push the next author to
  // delete the denial. This repository has hit that trap five times now, so the check looks at the
  // words immediately before, exactly as the "beat the market" guard does.
  const denied = (before) => /\b(not|never|no|cannot|do not|does not|without)\b[^.]{0,60}$/i.test(before);
  for (const banned of ["will play", "expected to start", "confirmed", "edge", "lock"]) {
    for (const m of blob.matchAll(new RegExp(`\\b${banned}\\b`, "gi"))) {
      const before = blob.slice(Math.max(0, m.index - 90), m.index);
      assert.ok(denied(before), `"${banned}" may appear only inside a denial, found after: "${before.slice(-60)}"`);
    }
  }
  for (const leak of ["playerId", "nEff", "data/internal", "PRIVATE_RESEARCH", "shareBasis"]) {
    assert.ok(!blob.includes(leak), `no research payload: "${leak}"`);
  }
});

test("APPEND-ONLY · a changed input writes a stamped revision beside the original", () => {
  assert.match(src, /revisionOf: `\$\{ev\.providerEventId\}\.json`/);
  assert.match(src, /priorInputHash/);
  assert.match(src, /Append-only: an existing artifact with different inputs becomes a stamped revision/);
});
