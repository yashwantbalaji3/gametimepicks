/**
 * ESPN scoreboard callers — ONE transport owner, and the dead range form can never come back.
 *
 * 2026-09-20: `?dates=YYYYMMDD-YYYYMMDD` began answering 400 for basketball/nba, football/nfl and every
 * soccer league (mma/ufc still answered). The two schedule captures were repaired on 09-22; eight
 * other scripts were not — the three RESULTS captures swallowed the 400 as SOURCE_STALE and stayed
 * green while writing nothing (NFL results froze at 2026-09-15; Week 3 finals never landed), and the
 * soccer forecast / grading / Dixon-Coles jobs went red on every run. This file pins the repair:
 *   1. no script under app/scripts or app/api builds a scoreboard URL with a date RANGE;
 *   2. every windowed caller imports the shared fetcher (no cloned fetch loops);
 *   3. the shared fetcher's behaviour, with an injected fetch: month plan, window filter, 4xx → a
 *      refusal the caller can tell from an outage, malformed → not a refusal;
 *   4. positive controls: the scan regex catches the exact strings that were on disk before.
 *
 * Run: npx tsx --test src/lib/sports/espn-scoreboard-callers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fetchScoreboardWindowEvents, ScoreboardFetchError, isProviderRefusal, utcDayStart, utcDayEnd } from "./espn-scoreboard-window.mjs";

const APP = process.cwd();
const HELPER_REL = "src/lib/sports/espn-scoreboard-window.mjs";

/** Every .mjs/.ts under app/scripts and app/api (tests excluded). */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== "node_modules") walk(p); continue; }
      if (/\.(mjs|ts|js)$/.test(ent.name) && !/\.test\./.test(ent.name)) out.push(p);
    }
  };
  for (const d of ["scripts", "api"]) if (fs.existsSync(path.join(APP, d))) walk(path.join(APP, d));
  return out;
}

/**
 * A scoreboard URL whose `dates=` value carries a hyphen (A-B) — the form the provider refuses.
 *
 * ANCHORED ON `?dates=`, NOT ON THE WORD "scoreboard". The first version of this guard required the
 * literal `scoreboard?dates=` on one line, so a caller that kept the host in a const and appended the
 * query — `` `${SCOREBOARD}?dates=${month}` ``, which is exactly how capture-epl-results.mjs is written
 * — was invisible to it. Mutation probe (2026-09-22): injecting `dates=${month}-${month}` there left
 * the suite at 10 pass / 0 fail. The scan now reads the `dates=` VALUE in any ESPN file and looks for a
 * hyphen OUTSIDE a `${...}` expression, so `${from}-${to}` and `20260922-20261121` are offenders while
 * `${plan.date.replace(/-/g, "")}` (api/_live-core.mjs, one day) and `${month}` are not.
 */

/**
 * Every `dates=` value a source line spells, each as `{ raw, literal }`. A plain regex cannot do this:
 * `?dates=${plan.date.replace(/-/g, "")}` contains a SPACE and a hyphen inside its expression, so a
 * `[^&`"'\s]*` capture truncates it to `${plan.date.replace(/-/g,` and the leftover hyphen reads as a
 * range. This walks the value instead, consuming `${...}` (brace-balanced, spaces and all) into `raw`
 * only, so `literal` holds exactly the URL text the author wrote outside any expression.
 */
function datesValues(line) {
  const out = [];
  const re = /\?dates=/g;
  let m;
  while ((m = re.exec(line))) {
    let i = m.index + m[0].length, raw = "", literal = "";
    while (i < line.length) {
      if (line.startsWith("${", i)) {
        let depth = 0, j = i + 1;
        for (; j < line.length; j++) {
          if (line[j] === "{") depth += 1;
          else if (line[j] === "}") { depth -= 1; if (depth === 0) break; }
        }
        raw += line.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (/[&`"'\s);,]/.test(line[i])) break;
      raw += line[i]; literal += line[i]; i += 1;
    }
    out.push({ raw, literal });
  }
  return out;
}

/** True when a `dates=` value expresses a RANGE: a hyphen in the literal text joining two terms. */
const isRangeForm = (v) => v.literal.includes("-");

/** Files that talk to the ESPN site API at all — the only ones this transport rule governs. */
const espnSources = () => sources().filter((f) => fs.readFileSync(f, "utf8").includes("site.api.espn.com"));

const MIGRATED = [
  "scripts/ufc/capture-ufc-events.mjs",
  "scripts/ufc/capture-ufc-results.mjs",
  "scripts/ufc/fetch-ufc-history.mjs",
  "scripts/nfl/capture-nfl-results.mjs",
  "scripts/nfl/capture-nfl-schedule.mjs",
  "scripts/nba/capture-nba-results.mjs",
  "scripts/nba/capture-nba-schedule.mjs",
  "scripts/soccer/build-league-forecasts.mjs",
  "scripts/soccer/grade-league-forecasts.mjs",
  "scripts/soccer/dixon-coles-shadow.mjs",
];

test("positive control: the scan catches every range-form string that was on disk before the repair", () => {
  const before = [
    "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${fmt(d0)}-${fmt(new Date(d0.getTime() + DAYS * 86400_000))}&limit=1000",
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${from}-${to}",
    "https://site.api.espn.com/apis/site/v2/sports/soccer/${L.espn}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=200",
    "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20260922-20261121&limit=1000",
  ];
  for (const s of before) {
    const vals = datesValues(s);
    assert.ok(vals.length === 1, `the scan must find the dates= value in: ${s}`);
    assert.ok(isRangeForm(vals[0]), `the guard must recognise: ${s}`);
  }
  // The const-built form the FIRST version of this guard could not see (mutation-probed 2026-09-22).
  for (const s of ["`${SCOREBOARD}?dates=${month}-${month}&limit=1000`", "`${SITE}/scoreboard?dates=${from}-${to}`"]) {
    assert.ok(isRangeForm(datesValues(s)[0]), `a const-built range form must be caught: ${s}`);
  }
  // and it must NOT fire on the forms the provider still answers, nor on a one-day value that
  // merely spells a hyphen INSIDE its expression (api/_live-core.mjs strips the ISO dashes).
  for (const s of [
    "scoreboard?dates=202609&limit=1000",
    "scoreboard?dates=${day}&limit=1000",
    "scoreboard?dates=20260921",
    "`${SCOREBOARD}?dates=${month}&limit=1000`",
    "`${SITE}/scoreboard?dates={YYYYMMDD}`",
    "`?dates=${plan.date.replace(/-/g, \"\")}`",
  ]) {
    const vals = datesValues(s);
    assert.ok(vals.length === 1, `the scan must find the dates= value in: ${s}`);
    assert.equal(isRangeForm(vals[0]), false, `single-day / month forms are fine: ${s} (literal ${JSON.stringify(vals[0].literal)})`);
  }
});

test("no script builds a scoreboard URL with a date RANGE — the provider answers 400 (mma still answers, which is not a licence)", () => {
  const offenders = [];
  for (const file of espnSources()) {
    const src = fs.readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // comments may describe the dead form
      for (const v of datesValues(line)) if (isRangeForm(v)) offenders.push(`${path.relative(APP, file)}:${i + 1} (dates=${v.raw})`);
    }
  }
  assert.deepEqual(offenders, [], `range-form scoreboard calls: ${offenders.join(", ")}`);
});

test("every windowed caller imports the shared fetcher and carries no fetch loop of its own", () => {
  for (const rel of MIGRATED) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.match(src, /fetchScoreboardWindowEvents/, `${rel} must use the shared fetcher`);
    assert.match(src, /espn-scoreboard-window\.mjs/, `${rel} must import the shared owner`);
    assert.doesNotMatch(src, /scoreboardMonthUrls\(/, `${rel} must not plan its own month requests (that is the fetcher's job)`);
    assert.doesNotMatch(src, /await fetch\([^)]*scoreboard/, `${rel} must not fetch the scoreboard directly`);
  }
});

test("the only module that spells the scoreboard URL with a dates= parameter is the shared owner (plus single-day callers)", () => {
  // Single-day callers (`dates=YYYYMMDD` for one card / one match day) are allowed; a windowed call is not.
  const windowed = [];
  for (const file of espnSources()) {
    const rel = path.relative(APP, file);
    if (rel === HELPER_REL) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const { raw: v } of datesValues(line)) {
        // `${day}` / `${date}` (one card, one match day), a literal YYYYMMDD, or the documentation
        // placeholder `{YYYYMMDD}` that capture-epl-espn-players.mjs records in its `endpoints` list.
        const singleDay = /^\$\{(day|date|plan\.date.*|[a-zA-Z]+\.replace.*)\}$/.test(v) || /^\d{8}$/.test(v) || v === "{YYYYMMDD}" || v === "";
        // `${month}` in capture-epl-results.mjs: the ONE sanctioned windowed caller outside the shared
        // fetcher. It keeps its own loop because its failure semantics differ (EXIT_SOURCE_STALE=4 with
        // nothing written, plus per-month provenance in the artifact's `source` block) — but its month
        // PLAN comes from the shared owner, which the next test pins.
        const eplMonth = rel === "scripts/epl/capture-epl-results.mjs" && v === "${month}";
        if (!singleDay && !eplMonth) windowed.push(`${rel}:${i + 1} dates=${v}`);
      }
    }
  }
  assert.deepEqual(windowed, [], `windowed scoreboard calls outside the owner: ${windowed.join("; ")}`);
});

test("the EPL results capture keeps its own loop but NOT its own month plan — one owner for the rule", () => {
  const rel = "src/lib/soccer/epl-results-capture.mjs";
  const src = fs.readFileSync(path.join(APP, rel), "utf8");
  assert.match(src, /monthsCovering/, `${rel} must take the month plan from the shared owner`);
  assert.match(src, /sports\/espn-scoreboard-window\.mjs/, `${rel} must import the shared owner`);
  assert.doesNotMatch(src, /getUTCMonth\(\)/, `${rel} must not re-derive months itself (that is the owner's rule)`);
});

test("the two month plans agree — the EPL signature is a wrapper, never a second rule", async () => {
  const { scoreboardMonths } = await import("../soccer/epl-results-capture.mjs");
  const { monthsCovering } = await import("./espn-scoreboard-window.mjs");
  for (const [start, now] of [
    ["2026-08-21", "2026-09-22T15:00:00Z"],
    ["2026-08-21", "2027-05-24T23:59:00Z"],
    ["2026-12-30", "2027-01-02T00:00:00Z"],
    ["2026-09-01", "2026-09-01T00:00:00Z"],
  ]) {
    assert.deepEqual(scoreboardMonths(start, now), monthsCovering(`${start}T00:00:00Z`, now), `${start} → ${now}`);
  }
  // the EPL signature answers [] where the owner throws — an inverted window is a refusal upstream
  assert.deepEqual(scoreboardMonths("2026-09-22", "2026-09-01T00:00:00Z"), []);
  assert.deepEqual(scoreboardMonths("nope", "2026-09-01T00:00:00Z"), []);
});

/* ── the fetcher itself, with an injected fetch ── */
const fakeFetch = (table) => async (url) => {
  const hit = table[url];
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  if (hit.status && hit.status !== 200) return { ok: false, status: hit.status, json: async () => ({}) };
  if (hit.notJson) return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
  return { ok: true, status: 200, json: async () => hit.body };
};
const U = (sp, ym) => `https://site.api.espn.com/apis/site/v2/sports/${sp}/scoreboard?dates=${ym}&limit=1000`;

test("fetcher: asks the MONTH form for each month the window touches and merges to exactly the window", async () => {
  const d0 = "2026-09-15T00:00:00Z", d1 = "2026-10-02T23:59:59.999Z";
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, accept: init?.headers?.accept }); return fakeFetch({
    [U("football/nfl", "202609")]: { body: { events: [{ id: 1, date: "2026-09-10T17:00Z" }, { id: 2, date: "2026-09-20T17:00Z" }] } },
    [U("football/nfl", "202610")]: { body: { events: [{ id: 2, date: "2026-09-20T17:00Z" }, { id: 3, date: "2026-10-02T23:00Z" }, { id: 4, date: "2026-10-03T00:30Z" }] } },
  })(url); };
  const r = await fetchScoreboardWindowEvents("football/nfl", d0, d1, { fetch: fetchImpl });
  assert.deepEqual(seen.map((s) => s.url), [U("football/nfl", "202609"), U("football/nfl", "202610")]);
  assert.equal(seen[0].accept, "application/json");
  assert.deepEqual(r.events.map((e) => e.id), [2, 3], "before-window and after-window events drop; the echoed event collapses");
  assert.equal(r.requests, 2);
  for (const u of r.urls) assert.equal(isRangeForm(datesValues(u)[0]), false, `the owner must never build a range: ${u}`);
});

test("fetcher: a 4xx is a provider REFUSAL (status carried, isProviderRefusal true) — the caller must go red, not stale", async () => {
  const fetchImpl = fakeFetch({ [U("basketball/nba", "202609")]: { status: 400 } });
  await assert.rejects(
    () => fetchScoreboardWindowEvents("basketball/nba", "2026-09-13T00:00:00Z", "2026-09-22T23:59:59Z", { fetch: fetchImpl }),
    (err) => err instanceof ScoreboardFetchError && err.status === 400 && isProviderRefusal(err) && /202609/.test(err.url),
  );
});

test("fetcher: a 5xx or a malformed payload is an OUTAGE, not a refusal (last-known-good may stand)", async () => {
  await assert.rejects(
    () => fetchScoreboardWindowEvents("mma/ufc", "2026-09-13T00:00:00Z", "2026-09-22T23:59:59Z", { fetch: fakeFetch({ [U("mma/ufc", "202609")]: { status: 503 } }) }),
    (err) => err instanceof ScoreboardFetchError && err.status === 503 && !isProviderRefusal(err),
  );
  await assert.rejects(
    () => fetchScoreboardWindowEvents("mma/ufc", "2026-09-13T00:00:00Z", "2026-09-22T23:59:59Z", { fetch: fakeFetch({ [U("mma/ufc", "202609")]: { body: { nope: true } } }) }),
    (err) => err instanceof ScoreboardFetchError && err.malformed === true && !isProviderRefusal(err),
  );
  await assert.rejects(
    () => fetchScoreboardWindowEvents("mma/ufc", "2026-09-13T00:00:00Z", "2026-09-22T23:59:59Z", { fetch: fakeFetch({ [U("mma/ufc", "202609")]: { notJson: true } }) }),
    (err) => err instanceof ScoreboardFetchError && err.malformed === true && !isProviderRefusal(err),
  );
  // a plain network failure is not even a ScoreboardFetchError → never a refusal
  assert.equal(isProviderRefusal(new TypeError("fetch failed")), false);
});

test("fetcher: a second month that fails aborts the whole window — a half-window must never look like a full one", async () => {
  const fetchImpl = fakeFetch({ [U("soccer/eng.1", "202609")]: { body: { events: [{ id: 9, date: "2026-09-27T14:00Z" }] } } }); // 202610 → 404
  await assert.rejects(() => fetchScoreboardWindowEvents("soccer/eng.1", "2026-09-25T00:00:00Z", "2026-10-03T00:00:00Z", { fetch: fetchImpl }), (e) => e.status === 404);
});

test("fetcher refuses a sportPath that is not provider/league shaped", async () => {
  await assert.rejects(() => fetchScoreboardWindowEvents("nfl", "2026-09-25T00:00:00Z", "2026-10-03T00:00:00Z", { fetch: fakeFetch({}) }), /sportPath/);
});

test("UTC day bounds reproduce the day-granular semantics of the old `dates=YYYYMMDD` form", () => {
  assert.equal(utcDayStart("2026-09-22T15:27:11Z").toISOString(), "2026-09-22T00:00:00.000Z");
  assert.equal(utcDayEnd("2026-09-22T15:27:11Z").toISOString(), "2026-09-22T23:59:59.999Z");
  assert.equal(utcDayEnd(Date.parse("2026-12-31T00:00:00Z")).toISOString(), "2026-12-31T23:59:59.999Z");
  assert.throws(() => utcDayStart("nope"));
});
