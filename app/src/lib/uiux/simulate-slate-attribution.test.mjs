/**
 * THE SIMULATION EXPLORER MUST SAY WHICH SLATE IT IS SHOWING — Program 232 · Release C.
 *
 * Run: npx tsx --test src/lib/uiux/simulate-slate-attribution.test.mjs   (after a build)
 *
 * On 2026-09-02 `/simulate` contradicted itself inside one scroll. The header, honestly, said:
 *
 *     "0 of 0 events on this slate have a simulation report ready"
 *     MLB · 0 events · "No MLB games on this date."
 *
 * and below it the Simulation Explorer rendered "Showing 15 of 15 simulated games" — full 10,000-run
 * reports for NYM @ TB, SD @ CIN and thirteen others. Those fifteen were 2026-09-01's slate.
 *
 * `explorerCards()` calls `buildAllGameDetails()` with no date filter, so it shows whatever the newest
 * artifacts hold while the page header describes the date the reader selected. Nothing was fabricated
 * and nothing was stale in the data — the SECTION had no date on it, and a reader has no way to know
 * these are yesterday's.
 *
 * The browse surface is worth keeping: "what did the simulation say about every game" is a real
 * question on a day with no games. It just has to say when.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const PAGE = path.join(APP, "out", "simulate", "index.html");

const text = fs.existsSync(PAGE)
  ? fs.readFileSync(PAGE, "utf8").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  : null;

/**
 * The EXPLORER's own text, not the page's.
 *
 * Scoped because the first version of this guard passed vacuously: the page's date rail lists every
 * selectable date, so "Sep 1" was on the page and the assertion matched the DATE PICKER while the
 * gallery below stayed undated. A section-attribution test that reads the whole page is not testing
 * attribution.
 */
const explorer = (() => {
  if (!text) return null;
  const i = text.indexOf("Simulation Explorer");
  return i === -1 ? null : text.slice(i, i + 1200);
})();

/** The date the explorer's cards actually belong to, read from the newest committed sim artifact. */
function newestSimulatedDate() {
  const dir = path.join(APP, "public", "data", "mlb", "full-game-simulations");
  try {
    return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop()?.slice(0, 10) ?? null;
  } catch { return null; }
}

test("IF THE EXPLORER RENDERS CARDS, IT NAMES THEIR SLATE", () => {
  if (!text) return;
  const showing = /Showing (\d+) of (\d+) simulated games/.exec(text);
  if (!showing || Number(showing[2]) === 0) return; // nothing rendered — nothing to attribute

  const date = newestSimulatedDate();
  assert.ok(date, "a rendered explorer must have an artifact behind it");
  const [y, m, d] = date.split("-").map(Number);
  const human = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  assert.ok(
    explorer && (explorer.includes(date) || explorer.includes(human)),
    `the explorer shows ${showing[2]} cards from ${date} (${human}) and its own section never says so`,
  );
});

test("REFUSAL · a header saying zero events may not sit over a gallery of games with no date", () => {
  /*
   * The contradiction as a reader meets it. This does not require the two to MATCH — browsing the
   * last simulated slate on an empty day is useful — only that the page cannot assert both "no games
   * on this date" and an undated wall of games.
   */
  if (!text) return;
  const showing = /Showing (\d+) of (\d+) simulated games/.exec(text);
  if (!showing || Number(showing[2]) === 0) return;

  const claimsEmpty = /No MLB games on this date/.test(text) || /0 of 0 events on this slate/.test(text);
  if (!claimsEmpty) return;

  const date = newestSimulatedDate();
  const [y, m, d] = date.split("-").map(Number);
  const human = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  assert.ok(
    explorer && (explorer.includes(human) || explorer.includes(date)),
    "the page says there are no games on this date AND shows games — the GALLERY must state which slate it is",
  );
});

test("the explorer's own empty state does not claim a slate it was not given", () => {
  /*
   * The empty copy said "for this slate", which reads as the selected one — the same conflation in
   * the branch where nothing renders.
   */
  const src = fs.readFileSync(path.join(APP, "src/components/games/simulation-explorer.tsx"), "utf8");
  const rendered = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  assert.ok(
    !/generated for this slate yet/.test(rendered),
    "the empty state must not say 'this slate' — the explorer is not scoped to the selected date",
  );
});
