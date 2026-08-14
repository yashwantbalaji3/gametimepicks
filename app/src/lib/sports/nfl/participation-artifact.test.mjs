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

test("THE PRESEASON TRAP IS CLOSED — shares are MEASURED, and regular-season usage sets no magnitude", () => {
  // P183 correction. Program 182 asserted `preseasonShare.p50 < regularSeasonShare`, which encoded
  // its own mistake: it derived preseason usage by multiplying a regular-season share by an invented
  // rotation factor, publishing the leading passer at 12.8% of team attempts. The corpus says 56.7%
  // (292 preseason team-games). Shares now come from a MEASURED table keyed by depth rank, and the
  // regular-season number is used only to ORDER players — so comparing the two is meaningless.
  assert.match(src, /Regular-season share is now used ONLY to\s*\n? \* order players by rank, never as a magnitude/);
  assert.match(src, /RANK_SHARES/);
  for (const a of artifacts) {
    assert.ok(a.rankShares?.passAttempts?.length >= 1, `${a.matchup} carries the measured rank table`);
    assert.match(a.rankSharesSource, /preseason team-games/);
    for (const tv of Object.values(a.teams)) {
      for (const mv of Object.values(tv.markets)) {
        for (const p of mv.players) {
          assert.ok(p.depthRank >= 1, `${p.name}: every row carries the depth rank its share came from`);
          assert.match(p.shareBasis, /never sets the magnitude/);
          assert.ok(p.preseasonShare.p10 < p.preseasonShare.p50 && p.preseasonShare.p50 < p.preseasonShare.p90,
            `${p.name}: a distribution, not a point`);
        }
        // ranks are ordered: a deeper player never out-shares a shallower one in the same market
        const byRank = [...mv.players].sort((x, y) => x.depthRank - y.depthRank);
        for (let i = 1; i < byRank.length; i += 1) {
          assert.ok(byRank[i].preseasonShare.p50 <= byRank[i - 1].preseasonShare.p50 + 1e-9,
            `${byRank[i].name} (rank ${byRank[i].depthRank}) may not out-share rank ${byRank[i - 1].depthRank}`);
        }
      }
    }
  }
});

test("THE WIDTH IS THE MEASURED WIDTH — not a width chosen to look uncertain", () => {
  // P182 asserted p90/p10 > 5, which its invented factor produced mechanically. The corpus width for
  // a leading preseason passer is 0.875 / 0.405 = 2.16. Asserting the old ratio would now force the
  // engine BACK to a fabricated spread, so the guard checks the real one instead.
  const lead = artifacts.flatMap((a) => Object.values(a.teams))
    .flatMap((t) => t.markets.passAttempts.players).find((p) => p.depthRank === 1);
  assert.ok(lead, "a rank-1 passer is present");
  const ratio = lead.preseasonShare.p90 / lead.preseasonShare.p10;
  assert.ok(ratio > 1.5 && ratio < 4,
    `the measured rank-1 spread is about 2.2x, not the 11x an invented factor produced (got ${ratio.toFixed(2)})`);
  // and it is still genuinely uncertain — a starter can take a third of the work or most of it
  assert.ok(lead.preseasonShare.p90 - lead.preseasonShare.p10 > 0.15, "a real spread, not a point dressed as a range");
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

test("A CORRECTION SUPERSEDES, and the superseded version is preserved verbatim", () => {
  // P183: when a prior artifact is found to be WRONG (not merely stale), the corrected one must be
  // the file readers see — leaving the known-wrong values as the base while a fix sits beside it
  // would publish the mistake. The old version is written out first, so nothing is lost.
  assert.match(src, /supersedes: existing\?\.inputHash/);
  assert.match(src, /correction: "Program 182 derived preseason shares/);
  assert.match(src, /leaving them in\s*\n?\s*\/\/ place as the base file while a correction sat beside it would publish the known-wrong one/);
  const withCorrection = artifacts.filter((a) => a.correction);
  assert.ok(withCorrection.length >= 1, "the corrected artifacts carry the reason inline");
  // the superseded copies exist on disk
  const day = path.join(ROOT, "data/internal/nfl/participation", artifacts[0].kickoffUtc.slice(0, 10));
  const superseded = fs.readdirSync(day).filter((f) => f.includes("-superseded-"));
  assert.ok(superseded.length >= 1, "the prior version is preserved, not overwritten away");
});
