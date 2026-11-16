/**
 * Level A record windows — synthetic entries only.
 * Run (from app/): npx tsx --test src/lib/results/level-a-windows.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_DECIDED_FOR_RATE, recordWindows } from "./level-a-record.mjs";

const e = (productDay, status) => ({ productDay, status });

test("anchored on the newest product day; pending and void never losses; decided = won + lost", () => {
  const w = recordWindows([e("2026-11-15", "PENDING"), e("2026-11-14", "WON"), e("2026-11-13", "LOST"), e("2026-11-13", "VOID"), e("2026-11-09", "WON"), e("2026-10-01", "LOST")]);
  const by = Object.fromEntries(w.map((x) => [x.key, x]));
  assert.deepEqual([by.day.from, by.day.through, by.day.recorded, by.day.pending, by.day.decided], ["2026-11-15", "2026-11-15", 1, 1, 0]);
  assert.deepEqual([by["3d"].from, by["3d"].won, by["3d"].lost, by["3d"].void, by["3d"].decided], ["2026-11-13", 1, 1, 1, 2]);
  assert.deepEqual([by["7d"].from, by["7d"].recorded, by["7d"].won], ["2026-11-09", 5, 2]);
  assert.deepEqual([by.all.from, by.all.recorded, by.all.won, by.all.lost], ["2026-10-01", 6, 2, 2]);
  assert.ok(w.every((x) => !x.rateShown), "no rate below the minimum");
});

test("rate only at the site's minimum decided count; empty record ⇒ empty windows, no dates", () => {
  const many = Array.from({ length: MIN_DECIDED_FOR_RATE }, (_, i) => e("2026-11-15", i % 2 ? "WON" : "LOST"));
  assert.equal(recordWindows(many).find((x) => x.key === "day").rateShown, true);
  assert.deepEqual(recordWindows([]).map((x) => [x.key, x.recorded, x.from, x.through]), [["day", 0, null, null], ["3d", 0, null, null], ["7d", 0, null, null], ["all", 0, null, null]]);
});

test("the results component prints window counts but no pooled rate", async () => {
  const React = (await import("react")).default;
  globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Record } = await import("../../components/results/model-suggestions-record.tsx");
  const { levelARecord } = await import("./level-a-record.mjs");
  const sug = Array.from({ length: MIN_DECIDED_FOR_RATE + 2 }, (_, i) => ({ id: `s${i}`, productDay: "2026-11-15", policy: "untiered-pick@1", tier: "untiered", legs: [] }));
  const grades = sug.map((x, i) => ({ entryId: x.id, result: i % 2 ? "win" : "loss", legs: [] }));
  const html = renderToStaticMarkup(React.createElement(Record, { view: levelARecord(sug, grades) }));
  assert.match(html, /data-windows/);
  const windowTable = html.slice(html.indexOf("data-windows"), html.indexOf("</table>", html.indexOf("data-windows")));
  assert.doesNotMatch(windowTable, /% of \d+ decided/);
  assert.match(windowTable, /Since recording began/);
});
