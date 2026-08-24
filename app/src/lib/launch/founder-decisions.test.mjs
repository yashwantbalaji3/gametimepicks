/**
 * Founder-decision guards (Program 199 · Release D).
 *
 * Run: npx tsx --test src/lib/launch/founder-decisions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FOUNDER_DECISIONS, reconcileDecisionsWithQueue } from "./founder-decisions.mjs";
import { buildClosurePackets, executionQueue } from "./closure-packets.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";
import { readCurrentEvents, readProductReceipt, readRouteInventory, readEplCalibrationAuthority, readLadderReceipts } from "./closure-packet-sources.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NOW = "2026-08-24T14:00:00Z";

test("cards ↔ founder queue, one-to-one against the LIVE generated queue — both directions", () => {
  const packets = buildClosurePackets({
    assessments: SPORT_ASSESSMENTS, tickets: [], watches: [], founderGates: [],
    currentEvents: readCurrentEvents({ appDir: APP, nowIso: NOW }),
    productReceipt: readProductReceipt({ appDir: APP }),
    routeInventory: readRouteInventory({ appDir: APP }),
    calibrationAuthorities: { epl: readEplCalibrationAuthority({ appDir: APP }) },
    ladderReceipts: readLadderReceipts({ appDir: APP }),
    nowIso: NOW,
  });
  const q = executionQueue(packets);
  assert.deepEqual(reconcileDecisionsWithQueue(q.founderQueue), [], "an invented decision or an unanswerable queue item both fail here");
  assert.equal(FOUNDER_DECISIONS.length, 5);
});

test("the reconciliation guard fires in both directions on synthetic drift", () => {
  const missingCard = reconcileDecisionsWithQueue([...FOUNDER_DECISIONS.map((d) => { const [sport, stage] = d.queueItem.split(":"); return { sport, stage }; }), { sport: "mlb", stage: "model" }]);
  assert.ok(missingCard.some((p) => /no card/.test(p)));
  const inventedCard = reconcileDecisionsWithQueue([{ sport: "nfl", stage: "products" }]);
  assert.ok(inventedCard.some((p) => /no founder-queue item/.test(p)));
});

test("answer tokens are a closed set with no secret-shaped entries, and every card is answerable", () => {
  for (const d of FOUNDER_DECISIONS) {
    assert.ok(d.answerTokens.length >= 2, `${d.id}: a decision with one option is not a decision`);
    assert.ok(d.answerTokens.some((t) => /^(DEFER|REJECT|SCHEDULE_ONLY|PRIVATE_RESEARCH_ONLY)/.test(t)), `${d.id}: declining must always be possible`);
    for (const t of d.answerTokens) {
      assert.ok(!/key|token|secret|password|bearer/i.test(t), `${d.id}: an answer token must never be a credential`);
    }
    assert.match(d.validation, /founder-decision-dryrun/, `${d.id}: carries its validation command`);
    assert.ok(d.consequence.length > 60 && d.engineeringComplete.length > 40, `${d.id}: consequence and prior work stated`);
  }
});
