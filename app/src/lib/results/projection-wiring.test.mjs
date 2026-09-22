/**
 * C1 → C2 PRECONDITION: a consumer may not read the projection while nothing builds it.
 *
 * C1 ships the read model deliberately UNWIRED: `build-results-projection.mjs` is in no workflow and
 * `projection.ts` is imported by no page, so the committed artifact is a seed the parity test reads,
 * not a published record. That is a coherent boundary — but only while BOTH halves hold. The moment a
 * page reads the projection and no job rebuilds it, the page serves whatever snapshot happened to be
 * committed, and a static record ages into a false claim. This repository has already paid for that
 * shape twice: a contract that was generated but never added to a commit allowlist (62-hour freshness
 * outage) and a static artifact whose eligibility claim aged into a lie.
 *
 * So the rule is a biconditional, not a reminder:
 *
 *   a consumer imports lib/results/projection  ⟺  a workflow runs build-results-projection.mjs
 *
 * Either state is legal. Only the mixture is refused, and it is refused in whichever direction it
 * appears — a reader wired without a producer (the dangerous one) and a producer running with no
 * reader (harmless, but it means this test has gone stale and should be deleted with C2).
 *
 * Run: cd app && npx tsx --test src/lib/results/projection-wiring.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const WORKFLOWS = path.join(REPO, ".github", "workflows");
const BUILDER = "build-results-projection";

/** Every source file under a directory, tests and node_modules excluded. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (/\.(mjs|ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Files that import the projection READER (`lib/results/projection`), by any spelling a bundler
 * accepts: "@/lib/results/projection", a relative "../results/projection", or the bare module id.
 * `projection-core` is NOT the reader — the builder and the tests import it legitimately.
 */
function readerImporters(roots) {
  const hits = [];
  const IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  for (const root of roots) {
    for (const file of sources(path.join(APP, root))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(IMPORT)) {
        const spec = m[1];
        if (!/(^|\/)results\/projection$/.test(spec) && !/(^|\/)results\/projection\.(ts|js|mjs)$/.test(spec)) continue;
        hits.push(path.relative(APP, file));
        break;
      }
    }
  }
  return hits;
}

/** Workflow files that invoke the builder script. */
function producerWorkflows() {
  let files = [];
  try { files = fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)); } catch { return []; }
  return files.filter((f) => fs.readFileSync(path.join(WORKFLOWS, f), "utf8").includes(BUILDER))
    .map((f) => `.github/workflows/${f}`);
}

test("POSITIVE CONTROL: the two detectors find what they are looking for when it is there", () => {
  // The reader detector, against the spellings a consumer would actually use.
  const IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  const matches = (src) => [...src.matchAll(IMPORT)].some((m) => /(^|\/)results\/projection$/.test(m[1]));
  for (const line of [
    'import { headlineFor } from "@/lib/results/projection";',
    "import x from '../results/projection'",
    'const p = require("@/lib/results/projection")',
    'await import("@/lib/results/projection")',
  ]) assert.ok(matches(line), `the reader detector must see: ${line}`);
  // …and must NOT fire on projection-core (the builder and tests import it legitimately) or a lookalike.
  for (const line of [
    'import { buildProjection } from "../../src/lib/results/projection-core.mjs";',
    'import y from "@/lib/results/projection-reader-notes";',
    'import z from "@/lib/results/projections";',
  ]) assert.equal(matches(line), false, `the reader detector must not fire on: ${line}`);

  // The producer detector, against a workflow line that would run the builder.
  assert.ok("          npx tsx scripts/results/build-results-projection.mjs --now \"$NOW\" --write".includes(BUILDER));
  // The real workflow directory must be readable, or this test proves nothing about the producer half.
  assert.ok(fs.existsSync(WORKFLOWS) && fs.readdirSync(WORKFLOWS).some((f) => /\.ya?ml$/.test(f)), "the workflow directory must be readable");
});

test("a consumer never reads the projection while no workflow builds it (C1 ships both halves off; C2 turns both on)", () => {
  const readers = readerImporters(["src/app", "src/components", "src/lib", "scripts", "api"]);
  const producers = producerWorkflows();

  if (readers.length === 0 && producers.length === 0) return; // C1's state: unwired on both sides.

  assert.ok(
    readers.length > 0 && producers.length > 0,
    readers.length > 0
      ? `${readers.length} consumer(s) read lib/results/projection but NO workflow runs ${BUILDER}.mjs — the artifact would freeze at whatever was committed and the page would serve a stale record as a current one. Wire the builder (nightly-settle, after every owner is rebuilt) in the same change that repoints a reader.\n  readers: ${readers.join(", ")}`
      : `a workflow runs ${BUILDER}.mjs but no consumer reads lib/results/projection — harmless, but this test has outlived its purpose: delete it with C2.\n  producers: ${producers.join(", ")}`,
  );
});

test("the seed artifact and the builder agree on where the projection lives", async () => {
  const { PROJECTION_REL } = await import("./projection-core.mjs");
  assert.equal(PROJECTION_REL, "results/projection");
  const seed = path.join(APP, "public", "data", PROJECTION_REL, "latest.json");
  assert.ok(fs.existsSync(seed), `the seed artifact must be committed at public/data/${PROJECTION_REL}/latest.json`);
  // nightly-settle already stages app/public/data/results/ wholesale, so wiring the builder needs no new
  // allowlist line — but that only holds while the projection lives UNDER results/. Pin it.
  assert.match(PROJECTION_REL, /^results\//, "the projection must live under results/ or nightly-settle's allowlist no longer covers it");
  const settle = fs.readFileSync(path.join(WORKFLOWS, "nightly-settle.yml"), "utf8");
  assert.match(settle, /git add app\/public\/data\/results\/ /, "nightly-settle must still stage app/public/data/results/ wholesale");
});
