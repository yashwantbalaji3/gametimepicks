/**
 * Simulation Theater V2 · public integration contract (P242 narrow exception, founder 2026-10-19).
 *
 *   flag        GTP_NFL_THEATER_PUBLIC is ON only for exactly "1"; next.config.mjs defines it into the bundle ("0"
 *               otherwise), and the page imports the section ONLY inside that compile-time `if` (no static import of
 *               any theater module), so a default build contains none of it (the built export is
 *               checked by public-theater-export.test.mjs in the post-build phase);
 *   labels      the four persistent labels and the methodology note, exact;
 *   fail closed a missing, unshowable, foreign or all-invalid receipt gives "Simulation replay unavailable", never a
 *               manifest (so nothing is packed);
 *   ceremony    the integration never mounts the retired presentation player or staged animation.
 *
 * Run: npx tsx --test src/lib/simulation-theater/public-theater.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readShadowReceipts, showableSimulationEvents, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import {
  NFL_THEATER_PUBLIC_ENV, PUBLIC_THEATER_LABELS, PUBLIC_THEATER_LABEL_LINE, PUBLIC_THEATER_METHODOLOGY, UNAVAILABLE_TITLE,
  defaultSample, driveTableRows, nflTheaterPublicEnabled, publicTheaterLoad,
} from "./public-theater.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const PAGE = "src/app/nfl/simulation/[eventId]/page.tsx";
const SECTION = "src/components/simulation-theater/PublicTheaterSection.tsx";

test("the flag is ON only for exactly \"1\"", () => {
  assert.equal(NFL_THEATER_PUBLIC_ENV, "GTP_NFL_THEATER_PUBLIC");
  assert.equal(nflTheaterPublicEnabled({}), false);
  for (const v of ["", "0", "true", "yes", "on", " 1", "1 ", "01", "TRUE"]) assert.equal(nflTheaterPublicEnabled({ GTP_NFL_THEATER_PUBLIC: v }), false, JSON.stringify(v));
  assert.equal(nflTheaterPublicEnabled({ GTP_NFL_THEATER_PUBLIC: "1" }), true);
});

test("next.config.mjs defines the flag into the bundle as \"1\" or \"0\", default \"0\"", async () => {
  const load = async (v) => {
    const prev = process.env.GTP_NFL_THEATER_PUBLIC;
    if (v === undefined) delete process.env.GTP_NFL_THEATER_PUBLIC; else process.env.GTP_NFL_THEATER_PUBLIC = v;
    try {
      return (await import(`${pathToFileURL(path.join(APP, "next.config.mjs")).href}?flag=${encodeURIComponent(String(v))}`)).default;
    } finally {
      if (prev === undefined) delete process.env.GTP_NFL_THEATER_PUBLIC; else process.env.GTP_NFL_THEATER_PUBLIC = prev;
    }
  };
  assert.equal((await load(undefined)).env.GTP_NFL_THEATER_PUBLIC, "0");
  assert.equal((await load("true")).env.GTP_NFL_THEATER_PUBLIC, "0");
  assert.equal((await load("1")).env.GTP_NFL_THEATER_PUBLIC, "1");
});

test("the page imports the section only inside the compile-time flag branch; no static theater import", () => {
  const src = read(PAGE);
  // no static import of any theater module (a static import would put the island and its CSS in every build)
  for (const m of src.matchAll(/^import[^;]*from\s+["']([^"']+)["']/gm)) {
    assert.ok(!/simulation-theater/.test(m[1]), `static import of ${m[1]}`);
  }
  // exactly one dynamic import of the section, and it sits inside the `=== "1"` branch
  const dyn = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(dyn, ["@/components/simulation-theater/PublicTheaterSection"]);
  const branch = src.match(/if \(process\.env\.GTP_NFL_THEATER_PUBLIC === "1"\) \{([\s\S]*?)\n  \}/);
  assert.ok(branch, "the flag branch is a literal `process.env.GTP_NFL_THEATER_PUBLIC === \"1\"` test (DefinePlugin-constant)");
  assert.match(branch[1], /await import\("@\/components\/simulation-theater\/PublicTheaterSection"\)/);
  assert.match(src, /<SimulationReplay rec=\{rec\} \/>/, "the replay renders the page's own receipt of record");
  // the public route never enables the dev hooks
  assert.doesNotMatch(read(SECTION), /<TheaterSection[^>]*devHooks/);
  assert.doesNotMatch(src, /devHooks/);
});

test("persistent labels and methodology: exact strings, rendered outside the island", () => {
  assert.deepEqual([...PUBLIC_THEATER_LABELS], ["SIMULATED", "DRIVE-LEVEL", "MOVEMENT ILLUSTRATIVE", "EXPERIMENTAL MODEL"]);
  assert.equal(PUBLIC_THEATER_LABEL_LINE, "SIMULATED · DRIVE-LEVEL · MOVEMENT ILLUSTRATIVE · EXPERIMENTAL MODEL");
  const m = PUBLIC_THEATER_METHODOLOGY.map((x) => x.text).join(" ");
  assert.match(m, /Drive boundaries are recorded facts from this game's drive-engine receipt/);
  assert.match(m, /Movement within a drive is illustrative/);
  assert.match(m, /has not been shown to be more accurate than the baseline/);
  for (const sentence of m.split(/(?<=\.)\s+/)) {
    if (/\b(beats?|outperforms?|better than|more accurate|superior)\b/i.test(sentence)) assert.match(sentence, /has not been shown/, `no superiority claim: ${sentence}`);
  }
  const src = read(SECTION);
  // labels, note and table are siblings of <TheaterSection>, never children of it (the island replaces its children)
  const labelsAt = src.indexOf("<Labels />"), methodAt = src.indexOf("<Methodology />"), sectionAt = src.indexOf("<TheaterSection load={load} />");
  assert.ok(labelsAt > 0 && methodAt > labelsAt && sectionAt > methodAt);
  assert.match(src, /<TheaterSection load=\{load\} \/>\s*<DriveTable /, "the drive table follows the section, server-rendered");
  assert.match(src, /aria-label=\{`Simulation replay disclosure: \$\{PUBLIC_THEATER_LABEL_LINE\}`\}/);
});

test("fail closed: no record, an unshowable record, a foreign engine or no valid run → unavailable, no manifest", () => {
  assert.equal(UNAVAILABLE_TITLE, "Simulation replay unavailable");
  const none = publicTheaterLoad(null);
  assert.equal(none.ok, false);
  assert.equal(none.manifest, null);
  assert.equal(none.error.code, "NO_RECEIPT");
  const entries = readShadowReceipts(REPO);
  const id = showableSimulationEvents(entries)[0];
  const rec = simulationOfRecord(entries, id);
  const ok = publicTheaterLoad(rec);
  assert.equal(ok.ok, true);
  assert.equal(publicTheaterLoad({ ...rec, showable: false, refusals: ["runCount 10 < 10000"] }).error.code, "NOT_SHOWABLE");
  const foreign = publicTheaterLoad({ ...rec, receipt: { ...rec.receipt, simulationEngine: "world-model-v2" } });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.manifest, null);
  const broken = structuredClone(rec);
  for (const r of broken.receipt.representativeRuns) r.drives[0].score = [99, 99];
  const allBad = publicTheaterLoad(broken);
  assert.equal(allBad.ok, false);
  assert.equal(allBad.manifest, null);
  assert.match(allBad.error.code, /NO_VALID_RUN|SCORE|DRIVE|INVALID|REP/);
});

test("the drive table rows are the default run's recorded drives", () => {
  const entries = readShadowReceipts(REPO);
  const rec = simulationOfRecord(entries, showableSimulationEvents(entries)[0]);
  const m = publicTheaterLoad(rec).manifest;
  const s = defaultSample(m);
  const rows = driveTableRows(s, m.teams);
  assert.equal(rows.length, s.events.length);
  assert.match(rows[0].start, /^Q1 15:00$/);
  for (const r of rows) assert.doesNotMatch(Object.values(r).join(" "), /\binterception|\bfumble|\bsack|\bpenalt|\btimeout/i, "only recorded fields");
});

test("the integration never mounts the retired ceremony (P242): no presentation player, no staged animation", () => {
  for (const f of [PAGE, SECTION, "src/components/simulation-theater/TheaterSection.tsx", "src/components/simulation-theater/TheaterLoader.tsx", "src/components/simulation-theater/TheaterIsland.tsx"]) {
    // code only: block and line comments may NAME the retired ceremony (to say this is not it)
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(src, /presentation-player|PresentationPlayer|presentation-launcher|SportSimulationAnimation|simulation-animation/, `${f}`);
    assert.doesNotMatch(src, /Generate Simulation|[?&]play=1/, `${f}`);
  }
});
