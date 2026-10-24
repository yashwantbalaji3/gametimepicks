/**
 * NBA SNAPSHOT-ID RULES @1 / @2 (release owner 2026-10-23, finding (a): the Theater loader drift).
 *
 *   identity   with @2 inactive (NBA_SNAPSHOT_ID_V2_FROM = null) every stored 10-20…10-23 Theater game keeps its embedded
 *              panel, replay-gate result, rebuilt snapshot id and internal-loader result BYTE-IDENTICAL to main before the
 *              change (fixture recorded on main 42cef6fbe2 by the digest below) — no frozen snapshot, lane or Theater
 *              artifact is rewritten and no id changes meaning
 *   stability  under @2 a game's id is the same whether its day files hold only what existed at its freeze or everything
 *              written later (more games, later v1 receipts); under @1 it is not (the drift, documented)
 *   cutoff     under @2 a v1 receipt generated after the official freeze is never attached (NONE_AT_OFFICIAL_FREEZE —
 *              the same state as no v1 file / no v1 game at the freeze)
 *   selection  the rule is chosen from the game's own ET slate date; @1 bodies carry no idRule, @2 bodies do
 *
 * Run (from app/): npx tsx --test src/lib/consistency/official-snapshot-id-rule.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { nbaOfficialSnapshot, nbaSnapshotIdRuleFor, NBA_SNAPSHOT_ID_RULE, NBA_SNAPSHOT_ID_V2_FROM } from "./official-snapshot.mjs";
import { readPossessionArtifact, replayGateProblems } from "../simulation-theater/nba/possession/stored-run.mjs";
import { loadNbaPossessionTheater } from "../simulation-theater/nba/possession/possession-loader.mjs";
import { NBA_THEATER_REPLAY_ENGINE } from "./theater-replay-engine.mjs";

const REPO = path.resolve(process.cwd(), "..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fileSrc = (rel) => { const abs = path.join(REPO, rel); if (!fs.existsSync(abs)) return null; const b = fs.readFileSync(abs); return { doc: JSON.parse(b), path: rel, sha256: sha(b) }; };
const OFF = (d) => `data/internal/research/nba/experimental-v0.1/forecasts/${d}.json`;
const SUP = (d) => `data/internal/research/nba/experimental-v1/forecasts/${d}.json`;
const BEFORE = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/consistency/__fixtures__/nba-snapshot-id-v1-digest-2026-10-23.json"), "utf8"));

test("@2 is inactive until the release owner sets an activation slate (≥ 2026-10-25); the rule follows the slate date", () => {
  // Activation is ONE line in official-snapshot.mjs; the ACTIVATION test below refuses a slate whose runs are already built.
  if (NBA_SNAPSHOT_ID_V2_FROM != null) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(NBA_SNAPSHOT_ID_V2_FROM) && NBA_SNAPSHOT_ID_V2_FROM >= "2026-10-25", `activation ${NBA_SNAPSHOT_ID_V2_FROM}`);
  assert.equal(nbaSnapshotIdRuleFor("2030-01-01", { v2From: null }), NBA_SNAPSHOT_ID_RULE.V1, "inactive: every slate @1");
  assert.equal(nbaSnapshotIdRuleFor("2030-01-01"), NBA_SNAPSHOT_ID_V2_FROM == null ? NBA_SNAPSHOT_ID_RULE.V1 : NBA_SNAPSHOT_ID_RULE.V2, "the default follows the activation constant");
  assert.equal(nbaSnapshotIdRuleFor("2026-10-24", { v2From: "2026-10-25" }), NBA_SNAPSHOT_ID_RULE.V1);
  assert.equal(nbaSnapshotIdRuleFor("2026-10-25", { v2From: "2026-10-25" }), NBA_SNAPSHOT_ID_RULE.V2);
  assert.equal(nbaSnapshotIdRuleFor(null, { v2From: "2026-10-25" }), NBA_SNAPSHOT_ID_RULE.V1);
});

test("IDENTITY: every stored 10-20…10-23 Theater game — embedded panel, replay gate, snapshot id, loader result — is byte-identical to main before the change", () => {
  const now = {};
  for (const date of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
    const read = readPossessionArtifact(REPO, date);
    const off = fileSrc(OFF(date)), sup = fileSrc(SUP(date));
    for (const g of read.doc?.games ?? []) {
      const id = String(g.providerEventId);
      let snap; try { snap = nbaOfficialSnapshot(id, { official: off, supporting: sup }); } catch (e) { snap = { refusal: e.code }; }
      const panel = g.official?.panel ?? null;
      now[`${date}/${id}`] = {
        panel: sha(JSON.stringify(panel)),
        gate: replayGateProblems(read, id, { snapshotId: panel?.snapshotId, frozenAt: panel?.frozenAt }, { approvedEngineId: NBA_THEATER_REPLAY_ENGINE.id }).map((p) => p.code),
        snapshotId: snap.snapshotId ?? snap.refusal,
        loader: (() => { const l = loadNbaPossessionTheater(REPO, id, { date }); return l.ok ? "OK" : l.error?.code; })(),
      };
    }
  }
  assert.equal(Object.keys(now).length, 28);
  assert.deepEqual(now, BEFORE);
  for (const [k, v] of Object.entries(now)) assert.deepEqual(v.gate, [], `${k}: the public replay gate (embedded panel) is open`);
});

/** A day file as it stood when `g` froze: that game only for v0.1, and only v1 receipts generated at or before its freeze. */
function atFreeze(date, id) {
  const off = fileSrc(OFF(date)), sup = fileSrc(SUP(date));
  const og = off.doc.games.find((x) => String(x.providerEventId) === id);
  const freeze = Date.parse(og.receipt.generatedAt);
  const offDoc = { ...off.doc, games: [og] };
  const supDoc = { ...sup.doc, games: sup.doc.games.filter((x) => Date.parse(x.receipt.generatedAt) <= freeze) };
  const bytes = (d) => Buffer.from(JSON.stringify(d));
  return { full: { official: off, supporting: sup }, early: { official: { doc: offDoc, path: off.path, sha256: sha(bytes(offDoc)) }, supporting: { doc: supDoc, path: sup.path, sha256: sha(bytes(supDoc)) } } };
}

test("STABILITY: under @2 a game's id ignores everything written to its day files after its freeze; under @1 it does not (the drift)", () => {
  const date = "2026-10-23";
  let drifted = 0;
  for (const og of fileSrc(OFF(date)).doc.games) {
    const id = String(og.providerEventId);
    const s = atFreeze(date, id);
    const v1Full = nbaOfficialSnapshot(id, s.full).snapshotId, v1Early = nbaOfficialSnapshot(id, s.early).snapshotId;
    const v2Full = nbaOfficialSnapshot(id, { ...s.full, v2From: date }), v2Early = nbaOfficialSnapshot(id, { ...s.early, v2From: date });
    assert.equal(v2Full.snapshotId, v2Early.snapshotId, `${id}: @2 id is fixed at the freeze`);
    assert.equal(v2Full.idRule, NBA_SNAPSHOT_ID_RULE.V2);
    if (v1Full !== v1Early) drifted += 1;
    // same official values under both rules: only the provenance hashing differs
    const strip = (x) => { const { snapshotId, sources, supporting, idRule, ...rest } = x; return rest; };
    assert.deepEqual(strip(v2Full), strip(nbaOfficialSnapshot(id, s.full)), `${id}: official values unchanged by the rule`);
  }
  assert.ok(drifted >= 1, "the @1 drift this fixes is real on the 10-23 files");
});

test("CUTOFF: under @2 a v1 receipt generated after the official freeze is never attached; one at the freeze is", () => {
  const date = "2026-10-23";
  const off = fileSrc(OFF(date)), sup = fileSrc(SUP(date));
  let after = 0, at = 0;
  for (const og of off.doc.games) {
    const id = String(og.providerEventId);
    const vg = sup.doc.games.find((x) => String(x.providerEventId) === id);
    const s = nbaOfficialSnapshot(id, { official: off, supporting: sup, v2From: date });
    const attached = s.sources.some((x) => x.role === "SUPPORTING_SIMULATION");
    if (vg && Date.parse(vg.receipt.generatedAt) > Date.parse(og.receipt.generatedAt)) { after += 1; assert.equal(attached, false, id); assert.equal(s.supporting.state, "NONE_AT_OFFICIAL_FREEZE", id); }
    if (vg && Date.parse(vg.receipt.generatedAt) <= Date.parse(og.receipt.generatedAt) && s.supporting.state === "ATTACHED") { at += 1; assert.equal(attached, true, id); }
  }
  assert.ok(after >= 1 && at >= 1, `both cases occur on 10-23 (after ${after}, at ${at})`);
});

test("@1 bodies carry no idRule (ids reproduce exactly); @2 hashes each source as that game's receipt", () => {
  const date = "2026-10-23";
  const off = fileSrc(OFF(date)), sup = fileSrc(SUP(date));
  const id = String(off.doc.games[0].providerEventId);
  const v1 = nbaOfficialSnapshot(id, { official: off, supporting: sup });
  assert.equal("idRule" in v1, false);
  assert.equal(v1.sources[0].hashBasis, "file-bytes");
  const v2 = nbaOfficialSnapshot(id, { official: off, supporting: sup, v2From: date });
  assert.ok(v2.sources.every((x) => x.hashBasis === "canonical-json"));
});

// ── ACTIVATION SAFETY (release owner 2026-10-23: "an activation slate ≥ 10-25 with a byte-identity check for every
//    published slate"). Data-driven over EVERY committed Theater slate, so it holds for slates published after this test.
const THEATER_DIR = path.join(REPO, "data/internal/research/nba/theater-possession");
const THEATER_SLATES = fs.existsSync(THEATER_DIR) ? fs.readdirSync(THEATER_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];

test("ACTIVATION: the @2 slate is strictly after every slate whose Theater runs are already committed (a past slate never changes rule)", () => {
  assert.ok(THEATER_SLATES.length >= 4);
  if (NBA_SNAPSHOT_ID_V2_FROM == null) return; // inactive: nothing to check
  for (const d of THEATER_SLATES) {
    if (d < NBA_SNAPSHOT_ID_V2_FROM) continue;
    // a slate at/after activation that already has runs must have been BUILT under @2 (its embedded ids equal @2 rebuilds)
    const read = readPossessionArtifact(REPO, d);
    const off = fileSrc(OFF(d)), sup = fileSrc(SUP(d));
    for (const g of read.doc?.games ?? []) {
      const s = nbaOfficialSnapshot(String(g.providerEventId), { official: off, supporting: sup });
      assert.equal(s.idRule, NBA_SNAPSHOT_ID_RULE.V2, `${d}: an @2 slate`);
      assert.equal(g.official?.snapshotId, s.snapshotId, `${d}/${g.providerEventId}: its committed runs embed the @2 id — activation was set after it was built`);
    }
  }
});

test("BYTE-IDENTITY of every published slate before the activation slate: each game's snapshot is exactly the @1 snapshot", () => {
  for (const d of THEATER_SLATES) {
    if (NBA_SNAPSHOT_ID_V2_FROM != null && d >= NBA_SNAPSHOT_ID_V2_FROM) continue;
    const off = fileSrc(OFF(d)), sup = fileSrc(SUP(d));
    for (const g of off?.doc.games ?? []) {
      const id = String(g.providerEventId);
      const now = nbaOfficialSnapshot(id, { official: off, supporting: sup });
      const v1 = nbaOfficialSnapshot(id, { official: off, supporting: sup, v2From: null });
      assert.equal(JSON.stringify(now), JSON.stringify(v1), `${d}/${id}: unchanged by the rule's existence`);
      assert.equal("idRule" in now, false, `${d}/${id}: an @1 body`);
    }
  }
});
