import { test } from "node:test";
import assert from "node:assert/strict";

import { unionFrozenForecasts } from "./public-forecast-union.mjs";

const art = (generatedAt, ids) => ({ generatedAt, forecasts: ids.map((id) => ({ providerEventId: id, marker: `${generatedAt}:${id}` })) });

test("a started game's frozen forecast is read beside the live ones from the same run", () => {
  const out = unionFrozenForecasts(art("T1", ["a", "b"]), art("T1", ["c", "d"]));
  assert.deepEqual(out.forecasts.map((f) => f.providerEventId), ["a", "b", "c", "d"]);
});

test("a frozen file from an EARLIER run never resurrects its games", () => {
  /* The builder writes both files in one run. If a later run wrote only latest.json, the old frozen file
     describes a week that may be over — reading it would put last week's games back on this week. */
  const live = art("T2", ["a"]);
  assert.equal(unionFrozenForecasts(live, art("T1", ["z"])), live);
});

test("live wins on an id collision, and absent inputs pass through untouched", () => {
  const out = unionFrozenForecasts(art("T1", ["a"]), art("T1", ["a", "b"]));
  assert.equal(out.forecasts.length, 2);
  assert.equal(out.forecasts[0].marker, "T1:a");
  assert.equal(unionFrozenForecasts(null, art("T1", ["a"])), null);
  const live = art("T1", ["a"]);
  assert.equal(unionFrozenForecasts(live, null), live);
  assert.equal(unionFrozenForecasts(live, art("T1", [])), live);
});
