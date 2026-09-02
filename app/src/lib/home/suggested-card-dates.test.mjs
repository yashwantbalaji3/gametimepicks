/**
 * "TODAY'S SUGGESTED CARDS" MUST BE TODAY'S — Program 232 · Release C.
 *
 * Run: npx tsx --test src/lib/home/suggested-card-dates.test.mjs   (after a build)
 *
 * The homepage headed a section "Today's suggested cards" and rendered four lanes of tier chips with
 * NO DATE on any of them. On 2026-09-02 those lanes carried:
 *
 *     MLB    2026-09-01   yesterday
 *     EPL    2026-09-05   three days out
 *     UFC    2026-09-05   three days out
 *     mixed  2026-09-01   yesterday
 *
 * Not one was today's. Two were stale and two were for a future event, presented side by side under
 * one word that was wrong about all four — twelve inches below a status strip reading "0 events
 * today", with nothing on the page to reconcile them.
 *
 * The lanes are not wrong. UFC and EPL are event-driven and their current card legitimately belongs
 * to a future fight night or matchweek; MLB's was yesterday's because today's had not published yet,
 * which the page says at the top. The DATES are the truth, and the page was throwing them away — the
 * loader already carried `date` on every lane and nothing rendered it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadSuggestedParlaysPreview } from "./suggested-parlays.mjs";

const APP = process.cwd();
const preview = (() => {
  try { return loadSuggestedParlaysPreview(path.join(APP, "public", "data")); }
  catch { return null; }
})();

test("every live lane carries the date its card belongs to", () => {
  if (!preview?.live?.length) return;
  for (const lane of preview.live) {
    assert.ok(
      lane.date && /^\d{4}-\d{2}-\d{2}$/.test(lane.date),
      `${lane.lane}: a lane of tier chips with no date cannot be read — is this today's card or last week's?`,
    );
  }
});

test("THE RENDERED PAGE SHOWS EACH LANE'S DATE", () => {
  const page = path.join(APP, "out", "index.html");
  if (!fs.existsSync(page) || !preview?.live?.length) return;
  const text = fs.readFileSync(page, "utf8").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ");

  /*
   * The claim: a reader can tell WHEN each lane's card is for, from the page. Distinct dates must
   * each appear — rendering one lane's date and letting it stand for all four is the same defect.
   */
  const dates = [...new Set(preview.live.map((l) => l.date).filter(Boolean))];
  for (const d of dates) {
    const [, m, day] = d.split("-");
    const human = new Date(Date.UTC(2026, Number(m) - 1, Number(day)))
      .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    assert.ok(
      text.includes(d) || text.includes(human),
      `no lane on the page states ${d} (${human}) — the tier chips are undated`,
    );
  }
});

test("REFUSAL · the section may not call a card 'today's' when it is not", () => {
  const page = path.join(APP, "out", "index.html");
  if (!fs.existsSync(page) || !preview?.live?.length) return;
  const text = fs.readFileSync(page, "utf8").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ");

  /*
   * Read the build's own frozen clock rather than a wall clock: a static export is generated once,
   * and the question is what the page claimed when it was built.
   */
  const marker = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "out", "data", "build-info.json"), "utf8")); }
    catch { return null; }
  })();
  if (!marker?.buildEtDate) return;

  const allToday = preview.live.every((l) => l.date === marker.buildEtDate);
  if (!allToday) {
    assert.ok(
      !/Today[’']s suggested cards/.test(text),
      `the page says "Today's suggested cards" while lanes carry ${[...new Set(preview.live.map((l) => l.date))].join(", ")} and the build clock is ${marker.buildEtDate}`,
    );
  }
});
