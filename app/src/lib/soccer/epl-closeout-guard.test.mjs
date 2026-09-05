/**
 * EPL writes to `soccer/epl/` and NOWHERE ELSE.
 *
 * `public/data/world-cup/` is a closed destination (`src/lib/world-cup-closeout.test.mjs`) holding two
 * incompatible graded schemas in one directory. An EPL pipeline that wrote there would resurrect a
 * closed surface and inherit a folder nothing can parse uniformly. The reverse direction matters too:
 * no World Cup surface may start reading EPL artifacts, or the closeout stops meaning anything.
 *
 * This file also pins the internal-route contract, because "internal" on a statically exported site is
 * a build step, not a property of the page.
 *
 * Run: npx tsx --test src/lib/soccer/epl-closeout-guard.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { EPL_ARTIFACT_ROOT, EPL_ARTIFACT_SUBROOTS } from "./epl-artifacts.ts";

const APP = process.cwd();
// src/lib/sports/research joined in Program 149: the shared replay harness uses the EPL Poisson
// module as its reference sport adapter — a deliberate research-lane consumer, not a World Cup
// surface. The guard's purpose (no closed WC-era surface reads EPL artifacts) is unchanged.
// src/app/epl joined the lane on P185: it was SCHEDULE_ONLY and read no EPL artifact, and now it
// renders the public forecast set. The rule this guard enforces is unchanged — no WORLD CUP
// surface may reach EPL data — and the EPL lane's own public page is not that.
const LANE_DIRS = ["src/lib/soccer", "src/app/epl", "src/app/preview/epl", "src/lib/sports/research", "src/lib/sports/epl"];
// Cross-lane AUDITORS may READ EPL artifact paths to reconcile copies of public figures — they are
// exempt from the readers check ONLY (Program 160). They are NOT lane members: the lane-ownership
// rules (no MLB reads, no world-cup paths) do not apply to reconciliation code whose whole job is
// touching every lane's artifacts.
const CROSS_LANE_READERS = [
  "src/lib/audits",
  // watches.mjs (P162): the command center's reality-gated watch NAMES the EPL results artifact
  // path as evidence-to-inspect for a human. It imports nothing from the lane — prose, not a read.
  "src/lib/launch/watches.mjs",
  /*
   * learning-paths.mjs (P188): the learning loop's layout table declares the data root of EVERY
   * sport, so naming EPL's is its job rather than a lane violation. It previously pointed at
   * public/data/epl, which has never existed — the loop would have reported "no settled rows yet"
   * forever once EPL started settling. Listing it here is what lets the path be CORRECT; the lane
   * rule is about surfaces reaching into EPL, not about the cross-sport registry that locates them.
   */
  // Prefix, so the registry AND its guard are both covered — the guard has to name the path
  // it is asserting, or it cannot assert it.
  "src/lib/sports/learning-paths",
  /*
   * epl-publication.test.mjs (P233 · A): the offered-window control plane classifies EVERY sport,
   * and its EPL rule tested for a state the producer never emits — `r.state === "READY"` against a
   * vocabulary of CURRENT_PRE_EVENT / READY_EXCEPT_ODDS. The condition was unsatisfiable, so EPL
   * reported WORK_OWED on days it published successfully.
   *
   * Proving that requires reading the EPL forecast rows themselves: the guard has to name the path
   * it is asserting. Same standing as the learning-path registry above — this is the cross-sport
   * control plane checking its own classification, not a surface reaching into the lane.
   */
  "src/lib/offered-window/epl-publication.test.mjs",
  /*
   * forecast-publication.test.mjs (P234 · A): the same control plane, one hole further in. P233's
   * rule derives publication from the presence of probabilities, which left `{}` and a row of NaNs
   * reading as published; the narrowed rule asks whether the row carries a distribution a reader
   * could be shown.
   *
   * It reads the committed EPL rows for the same reason its sibling above does — a rule about what
   * publication consists of can only be proven against the things actually published. Control
   * plane, not a surface.
   */
  "src/lib/offered-window/forecast-publication.test.mjs",
  /*
   * closure-packet-sources (P196 · Release A/D): the completion control plane reads every sport's
   * own artifacts by design — EPL's forecast set for the current-event verdict and the graded
   * ledger for the live calibration recount that guard C7 compares against the learning artifact.
   * It is the cross-sport operating layer, not a World Cup surface; this rule exists so RETIRED
   * WC surfaces cannot quietly reach EPL data, and the control plane is neither retired nor WC.
   */
  "src/lib/launch/closure-packet-sources",
  /*
   * workflow-script-cwd.test.mjs (P189): the ops guard that checks every workflow step runs its
   * scripts from a directory where the "@/" alias resolves. It NAMES scripts/epl/grade-epl-forecasts
   * as its calibration case — the script that actually died MODULE_NOT_FOUND on a runner — because a
   * detector with no known-positive passes forever while finding nothing. It imports nothing from
   * the lane and reads no EPL artifact: the path is a string it hands to a resolver, prose in the
   * same sense as watches.mjs above. The lane rule is about surfaces reaching into EPL.
   */
  "src/lib/ops/workflow-script-cwd.test.mjs",
  /*
   * epl-band-coverage.test.mjs: proves the ladder can reach all four price bands. It NAMES the odds
   * artifact path because it swaps in a synthetic ten-fixture slate and restores the real one — by
   * mid-afternoon most fixtures have kicked off, so the live artifact cannot answer "can four bands
   * be built" either way. It reads no EPL data for a product surface; the path is a fixture it
   * writes and puts back.
   */
  "src/lib/parlays/epl-band-coverage.test.mjs",
  /*
   * top-reads.ts: the cross-sport "strongest reads" aggregator. It NAMES the EPL artifact paths
   * because it reads every live sport's model output into one ranked list — that is a cross-sport
   * registry doing its job, the same case as learning-paths above, not a World Cup surface reaching
   * into the lane. It imports nothing from the lane and writes nothing.
   */
  "src/lib/top-reads.ts",
];

/** Every source file this lane owns. */
function laneFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  for (const d of LANE_DIRS) walk(path.join(APP, d));
  return out;
}

const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(APP, p);
/** Source with comments removed — these guards are about what the CODE does, not what it explains. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** The files that ship. Tests carry the patterns these guards search for and would match themselves. */
const shippedFiles = () => laneFiles().filter((f) => !f.endsWith(".test.mjs") && !f.endsWith(".md"));

test("the artifact root is competition-scoped under soccer/epl", () => {
  assert.equal(EPL_ARTIFACT_ROOT, "public/data/soccer/epl");
  for (const subroot of EPL_ARTIFACT_SUBROOTS) {
    assert.ok(fs.existsSync(path.join(APP, EPL_ARTIFACT_ROOT, subroot)), subroot);
  }
});

test("no lane code names world-cup as a path, and none imports the World Cup modules", () => {
  for (const file of shippedFiles()) {
    assert.equal(
      /world[-_]cup/i.test(code(file)),
      false,
      `${rel(file)} must not carry a world-cup path or module specifier outside a comment`,
    );
  }
});

test("nothing under public/data/world-cup claims to be EPL", () => {
  const dir = path.join(APP, "public/data/world-cup");
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (/epl/i.test(e.name)) offenders.push(rel(p));
      if (!e.name.endsWith(".json")) continue;
      const head = read(p).slice(0, 4096);
      if (/"competition"\s*:\s*"epl"/i.test(head) || /soccer\/epl/.test(head)) offenders.push(rel(p));
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], "EPL output must never land in the closed World Cup root");
});

test("only this lane references the soccer/epl root — no World Cup surface reads it", () => {
  const readers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx|mjs)$/.test(e.name)) continue;
      if ([...LANE_DIRS, ...CROSS_LANE_READERS].some((lane) => rel(p).startsWith(lane))) continue;
      if (/data\/soccer\/epl|soccer\/epl-/.test(read(p))) readers.push(rel(p));
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(readers, [], "EPL artifacts and modules are reachable only through the EPL lane");
});

test("the preview route is internal: guarded in source AND pruned from the export", () => {
  const page = path.join(APP, "src/app/preview/epl/page.tsx");
  assert.ok(fs.existsSync(page));
  assert.match(read(page), /guardInternalRoute\(\)/, "the page must 404 in the production export");

  const prune = read(path.join(APP, "scripts/prune-internal-routes.mjs"));
  const list = prune.match(/const INTERNAL_ROUTES = \[([^\]]*)\]/);
  assert.ok(list, "prune-internal-routes declares INTERNAL_ROUTES");
  assert.match(list[1], /"preview"/, "the prune list must cover /preview, which contains this route");
});

test("committed EPL artifacts: samples stay non-public; only a membership-verified capture may be public", () => {
  // `sweepInternalData` deletes any out/data JSON with `public: false`, so samples are never served
  // raw. Program 149 added the first REAL capture: it may declare public:true ONLY as a
  // FIXTURE_CAPTURE carrying its membershipVerification receipt — display-eligible public-domain
  // schedule data. Anything else claiming public is still a defect.
  for (const subroot of ["fixtures", "odds"]) {
    const dir = path.join(APP, EPL_ARTIFACT_ROOT, subroot);
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(read(path.join(dir, name)));
      if (data.public === true) {
        assert.equal(data.dataClass, "FIXTURE_CAPTURE", `${subroot}/${name}: only a real capture may be public`);
        assert.ok(data.membershipVerification?.sources?.length >= 2, `${subroot}/${name}: public capture requires the dual-source membership receipt`);
      } else {
        assert.equal(data.public, false, `${subroot}/${name}`);
      }
    }
  }
});

test("no EPL surface reads the MLB data root", () => {
  for (const file of shippedFiles()) {
    assert.equal(/\bmlb\b/i.test(code(file)), false, `${rel(file)} must not reach into MLB paths or modules`);
  }
});

test("the lane makes no predictive claim in what it ships", () => {
  const banned = [/\bedge\b/i, /\block\b/i, /beat the market/i, /guarantee/i, /\bROI\b/, /sure thing/i];
  for (const file of shippedFiles()) {
    const src = read(file);
    for (const pattern of banned) {
      assert.equal(pattern.test(src), false, `${rel(file)} contains ${pattern}`);
    }
  }
  assert.ok(shippedFiles().length >= 8, "the guard must actually be scanning the lane");
});

test("money is untouched by this lane", () => {
  const md5 = crypto
    .createHash("md5")
    .update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
