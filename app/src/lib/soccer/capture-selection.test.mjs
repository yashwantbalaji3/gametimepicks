/**
 * NOBODY READS THE OLDEST CAPTURE.
 *
 * `app/public/data/soccer/epl/fixtures/` is append-only — twenty-five captures and counting. The
 * forecast builder selected one with `readdir().find(…)`, which returns whatever the filesystem
 * lists first, and in practice returned `capture-2026-27-2026-08-09T2245.json`. Every EPL forecast
 * this repository published was built from an eighteen-day-old fixture list.
 *
 * That is not cosmetic, because the kickoff time is part of the canonical eventId. All ten
 * matchweek-2 rows carried `…:20260829t1400` — one fabricated slot for fixtures that actually run
 * Aug 28 19:00, Aug 29 11:30/14:00/16:30 and Aug 30 13:00/15:30. Crystal Palace v Manchester City
 * kicks off the DAY BEFORE the time its own forecast claimed: a freeze-before-kickoff check would
 * pass on a match already played, and settlement would join by an id no official result carries.
 *
 * Every other consumer already sorted. This guard is here so the next one does too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const FIXTURES = path.join(APP, "public/data/soccer/epl/fixtures");

/** Files that select a capture out of that directory. */
const CONSUMERS = [
  "scripts/epl/build-epl-forecasts.mjs",
  "scripts/epl/build-epl-lane-status.mjs",
  "scripts/epl/capture-epl-odds.mjs",
  "scripts/products/build-forward-coverage.mjs",
  "scripts/ops/publication-slo.mjs",
  "src/lib/soccer/epl-current-results.mjs",
];

test("no capture consumer selects with .find() — that is the OLDEST file, not the newest", () => {
  for (const rel of CONSUMERS) {
    const file = path.join(APP, rel);
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const line of code.split("\n")) {
      if (!line.includes('startsWith("capture-")')) continue;
      assert.ok(
        !/\.find\s*\(/.test(line),
        `${rel}: selects a capture with .find() — sort() and take the last`,
      );
    }
  }
});

test("the forecast builder sorts and takes the last", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-forecasts.mjs"), "utf8");
  const block = src.slice(src.indexOf("const capFile"), src.indexOf("const capFile") + 400);
  assert.match(block, /\.sort\(\)/);
  assert.match(block, /\.at\(-1\)|\.pop\(\)/);
});

test("LIVE ARTIFACT · the published forecasts agree with the NEWEST capture on every kickoff", () => {
  /*
   * The assertion that would have caught this on day one. A forecast's kickoff is not an opinion —
   * it is a fact carried by the fixture list, and the two must not be able to disagree.
   */
  if (!fs.existsSync(FIXTURES)) return;
  const names = fs.readdirSync(FIXTURES).filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort();
  if (!names.length) return;
  const capture = JSON.parse(fs.readFileSync(path.join(FIXTURES, names.at(-1)), "utf8"));
  const forecastPath = path.join(APP, "public/data/soccer/epl/forecasts/latest.json");
  if (!fs.existsSync(forecastPath)) return;
  const forecasts = JSON.parse(fs.readFileSync(forecastPath, "utf8"));
  if (!Array.isArray(forecasts.rows) || !forecasts.rows.length) return;

  const kickoffById = new Map((capture.rows ?? []).map((r) => [r.eventId, r.kickoffIso]));
  const mismatched = [];
  for (const row of forecasts.rows) {
    const truth = kickoffById.get(row.eventId);
    // An eventId the newest capture does not carry is itself the symptom: the id embeds the kickoff,
    // so a stale kickoff produces an id no current fixture has.
    if (truth === undefined) { mismatched.push(`${row.matchup}: eventId ${row.eventId} is not in the newest capture`); continue; }
    if (truth !== row.kickoffUtc) mismatched.push(`${row.matchup}: forecast ${row.kickoffUtc} vs capture ${truth}`);
  }
  assert.deepEqual(mismatched, [], `forecast kickoffs disagree with the fixture list:\n  ${mismatched.join("\n  ")}`);
});

test("ALL-IDENTICAL KICKOFFS · ten fixtures across three days cannot share one slot", () => {
  /*
   * The shape of the bug, pinned directly. The stale capture gave every matchweek-2 row the same
   * 14:00Z kickoff; a matchweek genuinely spanning Friday to Sunday cannot look like that.
   */
  const forecastPath = path.join(APP, "public/data/soccer/epl/forecasts/latest.json");
  if (!fs.existsSync(forecastPath)) return;
  const rows = JSON.parse(fs.readFileSync(forecastPath, "utf8")).rows ?? [];
  if (rows.length < 4) return;
  const distinct = new Set(rows.map((r) => r.kickoffUtc));
  assert.ok(
    distinct.size > 1,
    `all ${rows.length} forecast rows share one kickoff (${[...distinct][0]}) — that is a stale or fabricated fixture list`,
  );
});
