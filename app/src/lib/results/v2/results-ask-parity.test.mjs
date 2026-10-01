/**
 * Session 3 · Phase B — RESULTS ↔ ASK PARITY. "How did GameTimePicks do yesterday?" must say exactly what
 * /results/date/<d>/ shows: the same lanes with the same words, the same games with the same grades, the same pending.
 *
 * Ask's daily `results.json` is built from the same two owners the day page renders (productReceiptsFor, resultsDay) —
 * this pins that it STAYS so: every day Ask ships is compared, field by field, with what the page reads today.
 * Post-build: the Ask results asset is a daily build artifact (not committed).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { productReceiptsFor } from "./product-receipts.ts";
import { resultsDay } from "./day.ts";

const ASSET = path.join(process.cwd(), "public/data/ask/v1/results.json");

test("🔴 every results day Ask ships matches the Results day page's owners — lanes, legs, games and grades", (t) => {
  if (!fs.existsSync(ASSET)) return t.skip("post-build: public/data/ask/v1/results.json is emitted by the build");
  const doc = JSON.parse(fs.readFileSync(ASSET, "utf8"));
  assert.ok(Array.isArray(doc.days) && doc.days.length > 0, "Ask ships at least one results day");
  for (const d of doc.days) {
    const page = productReceiptsFor(d.date);
    assert.deepEqual(
      d.lanes.map((l) => [l.product, l.lane, l.result, l.legs.map((g) => [g.selection, g.official, g.result])]),
      (page?.lanes ?? []).map((l) => [l.product, l.lane, l.result, l.legs.map((g) => [g.selection, g.official, g.result])]),
      `${d.date}: Ask's lanes differ from the day page's`,
    );
    const day = resultsDay(d.date);
    for (const [sport, evs] of Object.entries(day)) {
      assert.deepEqual(
        (d.events?.[sport] ?? []).map((e) => [e.title, e.final, e.calls.map((c) => [c.market, c.pick, c.outcome ?? null])]),
        evs.map((e) => [e.title, e.final, e.calls.map((c) => [c.market, c.pick, c.outcome ?? null])]),
        `${d.date} ${sport}: Ask's graded calls differ from the day page's`,
      );
    }
  }
});
