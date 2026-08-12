/**
 * Input-completeness refusal proofs (Program 163 · Release F).
 *
 * Representative events come from the REAL committed schedules — DET@CIN, MIA@TOR, the EPL
 * opener, the next UFC bout — and every one must REFUSE generation with precise reasons. NFL's
 * earned state is READY_EXCEPT_ODDS (injuries went AVAILABLE in P162-H); nobody else may claim
 * it. The separations are proven as refusals, not prose.
 *
 * Run: npx tsx --test src/lib/sports/research/input-completeness.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { classifyEventInputs, REQUIRED_INPUTS, INPUT_COMPLETENESS_VERSION } from "./input-completeness.mjs";

const APP = process.cwd();
const readRows = (rel, key = "rows") => JSON.parse(fs.readFileSync(path.join(APP, "public", "data", rel), "utf8"))[key] ?? [];

/** Real representative events, discovered from committed artifacts — never typed from memory. */
function representatives() {
  const nfl = readRows("nfl/schedule/latest.json").find((r) => /DET/.test(r.shortName ?? "")) ?? readRows("nfl/schedule/latest.json")[0];
  const nba = readRows("nba/schedule/latest.json")[0];
  const ufcBout = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "ufc", "schedule", "latest.json"), "utf8")).bouts[0];
  return {
    nfl: { providerEventId: nfl.providerEventId, scheduledStartUtc: nfl.dateUtc },
    nba: { providerEventId: nba.providerEventId, scheduledStartUtc: nba.dateUtc },
    epl: { providerEventId: "epl-opener", scheduledStartUtc: "2026-08-21T19:00:00Z" },
    ufc: { providerEventId: ufcBout.providerBoutId, scheduledStartUtc: ufcBout.dateUtc },
  };
}
const BEFORE_ALL = "2026-08-12T06:00:00Z"; // pre-start for every representative above

test("every representative event REFUSES generation; NFL alone earns READY_EXCEPT_ODDS", () => {
  const reps = representatives();
  for (const sport of Object.keys(REQUIRED_INPUTS)) {
    const out = classifyEventInputs({ sport, event: reps[sport], nowIso: BEFORE_ALL });
    assert.equal(out.decision, "REFUSED", `${sport} must refuse — no sport has a complete current input set`);
    assert.ok(out.reasons.length >= 1, `${sport} names its reasons`);
    assert.ok(out.reasons.some((r) => /odds is BLOCKED_EXTERNAL/.test(r)), `${sport}: the one founder-owned odds blocker appears`);
    if (sport === "nfl") {
      assert.equal(out.summary, "READY_EXCEPT_ODDS", "injuries went AVAILABLE with a real capture receipt — odds is the only gap");
      assert.equal(out.reasons.length, 1, "exactly one reason: odds");
    } else {
      assert.equal(out.summary, "MISSING_INPUTS", `${sport} has non-odds gaps and may not claim ready-except-odds`);
    }
  }
});

test("separations are refusals: injuries never satisfy lineups; UFC weigh-ins missing; unsupported inputs are explicit", () => {
  const reps = representatives();
  const nba = classifyEventInputs({ sport: "nba", event: reps.nba, nowIso: BEFORE_ALL });
  assert.ok(nba.reasons.some((r) => /injuriesLineups is MISSING/.test(r)), "the combined input stays missing despite the injuries half — nothing substitutes");
  const ufc = classifyEventInputs({ sport: "ufc", event: reps.ufc, nowIso: BEFORE_ALL });
  assert.ok(ufc.reasons.some((r) => /weighInsReplacements is MISSING/.test(r)));
  assert.ok(ufc.notRequired.some((n) => n.input === "methodRoundFields"), "UNSUPPORTED inputs are excluded explicitly, never silently");
  const epl = classifyEventInputs({ sport: "epl", event: reps.epl, nowIso: BEFORE_ALL });
  assert.ok(epl.reasons.some((r) => /lineups is MISSING/.test(r)));
});

test("temporal and activation gates refuse before inputs even matter", () => {
  const reps = representatives();
  const started = classifyEventInputs({ sport: "nfl", event: reps.nfl, nowIso: "2026-08-20T00:00:00Z" });
  assert.ok(started.reasons.some((r) => /post-start evidence never feeds a pre-event artifact/.test(r)));
  assert.equal(started.summary, "MISSING_INPUTS", "a started event can never be ready-except-odds");
  const activated = classifyEventInputs({ sport: "nfl", event: reps.nfl, nowIso: BEFORE_ALL, activation: "SHADOW" });
  assert.ok(activated.reasons.some((r) => /literal OFF/.test(r)));
  const noId = classifyEventInputs({ sport: "nfl", event: { scheduledStartUtc: "2026-08-13T23:00:00Z" }, nowIso: BEFORE_ALL });
  assert.ok(noId.reasons.some((r) => /no provider identity/.test(r)));
});

test("the classifier is deterministic and cannot generate anything", async () => {
  const reps = representatives();
  const a = JSON.stringify(classifyEventInputs({ sport: "epl", event: reps.epl, nowIso: BEFORE_ALL }));
  const b = JSON.stringify(classifyEventInputs({ sport: "epl", event: reps.epl, nowIso: BEFORE_ALL }));
  assert.equal(a, b);
  const src = fs.readFileSync(path.join(APP, "src", "lib", "sports", "research", "input-completeness.mjs"), "utf8");
  assert.ok(!/writeFileSync|fetch\(|CURRENT_PRE_EVENT/.test(src), "no writes, no network, no artifact-mode minting — a gate, not a generator");
  assert.equal(INPUT_COMPLETENESS_VERSION, 1);
});
