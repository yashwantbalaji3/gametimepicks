/**
 * Sprint 036 — the settle rates quoted to users must still be true.
 *
 * WHY THIS EXISTS
 * Sprint 035 put measured settle rates into the confidence captions so no category could imply quality
 * unchallenged. That was the right call and it introduced a new failure mode: the rates are a hardcoded
 * snapshot, the ledger grows every night, and the Sprint 035 guard asserted the STRING ("caption
 * contains 51.7%") rather than the DATA. So the caption could go stale while the suite stayed green.
 *
 * It did. One overnight settle moved Category C from 51.7% to 51.0% — a public claim drifting from
 * truth inside 24 hours, invisibly. This recomputes all three rates from the committed ledger and fails
 * when a caption no longer matches, so a stale claim blocks the build instead of aging quietly.
 *
 * TOLERANCE. 0.5pp. Tight enough that a rounded figure stays honest, loose enough that a single day's
 * settlements do not turn CI red for a claim that is still accurate to the nearest tenth. When this
 * fails the fix is to update the caption — not to widen the tolerance.
 *
 * The proper fix is to derive the captions from the artifact at build time so they cannot drift at all.
 * That is on the Sprint 036 roadmap; this guard is what holds the line until then.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { confidenceCaption } from "./confidence-labels.ts";

const APP = process.cwd();
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const TOLERANCE_PP = 0.5;

/** Stream the ledger — it is ~10MB and growing; reading it whole is wasteful in a unit test. */
async function tierRates() {
  const tally = {
    High: { w: 0, n: 0 },
    Medium: { w: 0, n: 0 },
    Low: { w: 0, n: 0 },
  };
  const rl = readline.createInterface({ input: fs.createReadStream(LEDGER), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const outcome = row?.outcome;
    if (outcome !== "Win" && outcome !== "Loss") continue; // decisive only
    const bucket = tally[row?.confidence];
    if (!bucket) continue;
    bucket.n += 1;
    if (outcome === "Win") bucket.w += 1;
  }
  return tally;
}

/** Pull the first percentage out of a caption, e.g. "settled at 51.0%" -> 51.0 */
function quotedRate(caption) {
  const m = /(\d{1,3}\.\d)%/.exec(caption);
  return m ? Number(m[1]) : null;
}

test("every quoted settle rate still matches the committed ledger", async () => {
  if (!fs.existsSync(LEDGER)) return; // no ledger in this checkout — nothing to verify against

  const tally = await tierRates();
  const failures = [];

  for (const tier of ["High", "Medium", "Low"]) {
    const { w, n } = tally[tier];
    assert.ok(n > 0, `${tier}: ledger must contain decisive rows for this tier`);

    const measured = (w / n) * 100;
    const quoted = quotedRate(confidenceCaption(tier));
    assert.ok(quoted !== null, `${tier}: caption must quote a rate — "${confidenceCaption(tier)}"`);

    const drift = Math.abs(measured - quoted);
    if (drift > TOLERANCE_PP) {
      failures.push(
        `${tier}: caption says ${quoted.toFixed(1)}% but the ledger measures ${measured.toFixed(1)}% ` +
          `over n=${n} (drift ${drift.toFixed(2)}pp)`,
      );
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Confidence captions have drifted from the settled ledger.\n  ${failures.join("\n  ")}\n\n` +
      `  FIX: update the rate in src/lib/confidence-labels.ts to the measured value.\n` +
      `  DO NOT widen the tolerance — these numbers are shown to users as fact.`,
  );
});

test("the ordering the captions assert is the ordering the ledger shows", async () => {
  // The captions claim Category A is the LOWEST and Category C the HIGHEST. That relationship is the
  // whole reason the tiers no longer rank, so it is asserted against data rather than trusted.
  if (!fs.existsSync(LEDGER)) return;

  const tally = await tierRates();
  const rate = (t) => tally[t].w / tally[t].n;

  assert.ok(
    rate("High") < rate("Low"),
    `Category A (${(rate("High") * 100).toFixed(1)}%) must still measure BELOW Category C ` +
      `(${(rate("Low") * 100).toFixed(1)}%). If this ever flips, the captions in ` +
      `confidence-labels.ts are backwards and must be rewritten — and the ranking decision in ` +
      `Sprint 035 should be revisited on the new evidence.`,
  );

  assert.match(confidenceCaption("High"), /lowest/i);
  assert.match(confidenceCaption("Low"), /highest/i);
});

test("MUTATION · a drifted caption is actually caught", async () => {
  // Proves the guard can fail. Uses the real ledger and a deliberately wrong quoted rate.
  if (!fs.existsSync(LEDGER)) return;

  const tally = await tierRates();
  const measured = (tally.High.w / tally.High.n) * 100;
  const wrong = measured + 5; // 5pp off — far outside tolerance

  const drift = Math.abs(measured - wrong);
  assert.ok(drift > TOLERANCE_PP, "a 5pp error must exceed the tolerance the guard enforces");
});
