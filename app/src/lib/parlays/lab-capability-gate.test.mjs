/**
 * GTP-08 — no lane may read "Publishing today: yes" while its sport's capability refuses its cards.
 *
 * On 2026-10-13 /results/parlay-lab showed UFC (SCAFFOLD_ONLY, ladder CAPABILITY_GATED with zero
 * cards) and the cross-sport stream as publishing. The cause was the producer: lab-eligibility
 * gated on prices, settlement and depth and never asked the registry. Fixed at BOTH ends — the
 * producer reads the ladder's recorded gate, the reader asks the registry — and these tests hold
 * each end on its own so neither can quietly become the only guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { labEligibility, capabilityGateOf } from "../../../scripts/parlays/lab-eligibility.mjs";
import { applyCapabilityGate, loadLabRecord } from "./lab-record.ts";
import { sportLadderCapabilityRefusal } from "./sport-lab-cards.ts";
import { canShowLiveProjections } from "../sport-capability-registry.ts";

const ROOT = path.join(process.cwd(), "public", "data");
const NOW = new Date().toISOString();

test("PRODUCER: a CAPABILITY_GATED ladder closes its sport, with the ladder's own reason", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-lab-gate-"));
  try {
    const dir = path.join(root, "parlays", "risk-ladder-ufc");
    fs.mkdirSync(dir, { recursive: true });
    const write = (state, reason) => fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify({ state, reason, cards: [] }));

    write("CAPABILITY_GATED", "the capability registry lists UFC as SCAFFOLD_ONLY");
    assert.match(capabilityGateOf(root, "ufc"), /SCAFFOLD_ONLY/);
    const ufc = labEligibility(root, NOW.slice(0, 10), NOW).find((s) => s.id === "ufc");
    assert.equal(ufc.live, false);
    assert.match(ufc.blocked, /not cleared to publish model cards — the capability registry lists UFC/);
    assert.equal(ufc.evidence.capabilityGated, true);

    // Any other ladder state is not a capability decision, and must not read as one.
    for (const state of ["PUBLISHED", "NO_CARD", "NOT_PLAYING_TODAY"]) {
      write(state, "x");
      assert.equal(capabilityGateOf(root, "ufc"), null, state);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PRODUCER on today's artifacts: every sport the registry refuses is closed, and multi never counts it", () => {
  const all = labEligibility(ROOT, NOW.slice(0, 10), NOW);
  const multi = all.find((s) => s.id === "multi");
  for (const s of all) {
    if (s.id === "multi" || canShowLiveProjections(s.id)) continue;
    // A ladder rebuilt since the registry last changed records the refusal; the gate follows it.
    if (capabilityGateOf(ROOT, s.id) == null) continue;
    assert.equal(s.live, false, `${s.id} is refused by the registry and still LIVE`);
    assert.ok(!multi.evidence.liveSports.includes(s.id), `multi counts refused ${s.id} as a live sport`);
  }
});

test("READER: a refused sport is closed whatever the ledger says, and multi is recounted", () => {
  if (canShowLiveProjections("ufc") || !canShowLiveProjections("epl")) return; // the fixture's premise
  const rec = (id, label, live) => ({ id, label, live, blocked: null, settledDays: 3, record: { wins: 1, losses: 2, pushes: 0, staked: 3, returned: 2, roi: -0.3 }, byTier: [] });
  const streams = [rec("mlb", "MLB", false), rec("ufc", "UFC", true), rec("epl", "Premier League", true), rec("multi", "Multi-sport", true)];
  const raw = [{ id: "multi", evidence: { liveSports: ["ufc", "epl"] } }];
  const out = applyCapabilityGate(streams, raw);
  const by = Object.fromEntries(out.map((s) => [s.id, s]));
  assert.equal(by.ufc.live, false);
  assert.equal(by.ufc.blocked, sportLadderCapabilityRefusal("ufc"));
  assert.equal(by.epl.live, true);
  assert.equal(by.multi.live, false);
  assert.match(by.multi.blocked, /only Premier League is cleared/);
  // What was graded is never touched — only what is said about today.
  for (const s of out) assert.deepEqual(s.record, streams.find((x) => x.id === s.id).record);
});

test("READER on the real ledger: no stream reads publishing while its sport is refused", () => {
  const rec = loadLabRecord();
  if (!rec) return;
  const open = rec.streams.filter((s) => s.id !== "multi" && s.live).map((s) => s.id);
  for (const s of rec.streams) {
    if (s.id === "multi") {
      if (s.live) assert.ok(open.length >= 2, "multi is publishing on fewer than two cleared sports");
      continue;
    }
    if (s.live) assert.equal(sportLadderCapabilityRefusal(s.id), null, `${s.id} reads publishing while refused`);
  }
});

test("RENDER: the cell reads `live` from the gated record and keeps the full reason", () => {
  const src = fs.readFileSync("src/app/results/parlay-lab/page.tsx", "utf8");
  assert.doesNotMatch(src, /blocked\.slice\(0, 60\)/, "the reason is no longer cut mid-sentence");
  assert.match(fs.readFileSync("src/lib/parlays/lab-record.ts", "utf8"), /streams: applyCapabilityGate\(streams, ledger\.streams\)/);
});
