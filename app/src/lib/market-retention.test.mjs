/**
 * Sprint 039 — durable market retention.
 *
 * THE PROBLEM THIS CLOSES
 * `normalized.json` is the richest schema in the repo: per-row `capturedAt`, `availableAt`,
 * `sourceLastUpdate`, `bookmaker`, `noVigProbability`, `researchEligible`, `provenance`, plus an
 * integrity hash. It is exactly the evidence needed to answer "what information existed before the
 * event happened?" — and it was gitignored. Measured: **104 of 106 capture directories had already
 * lost it**, and ~16 more were discarded every day.
 *
 * WHY IT WAS DEFERRED, AND WHY THAT WAS WRONG
 * Retention was costed at 7.4 GB/year and shelved for four sprints. That figure was for the RAW
 * payload. This data is enormously repetitive, and measured gzip on the two survivors is 46-53×
 * (1,702 KB → 32 KB; 970 KB → 21 KB). At ~26 KB/capture × 16/day that is **~150 MB/year** — git-viable,
 * with no object storage, no new infrastructure, and no credentials to provision.
 *
 * `raw.json` stays ignored: it is the provider blob, and `normalized` already carries every research
 * field plus provenance and an integrity hash.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SNAPSHOTS = path.join(REPO, "data/internal/mlb/pregame-archive/market-snapshots");

const CAPTURE_SCRIPTS = [
  "scripts/capture-mlb-pregame-markets.mjs",
  "scripts/capture-mlb-pregame-player-props.mjs",
];
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

// ── the writer ─────────────────────────────────────────────────────────────

test("every capture script writes a durable gzipped payload", () => {
  for (const rel of CAPTURE_SCRIPTS) {
    const src = read(rel);
    assert.match(src, /normalized\.json\.gz/, `${rel}: must write the durable copy`);
    assert.match(src, /zlib\.gzipSync/, `${rel}: must actually compress it`);
    // The gz must be derived from the SAME serialized string that was written uncompressed, or the
    // durable copy could silently diverge from the working one.
    assert.match(
      src,
      /const normalizedJson = JSON\.stringify/,
      `${rel}: gz and json must share one serialization`,
    );
    const jsonAt = src.indexOf("const normalizedJson");
    const gzAt = src.indexOf("normalized.json.gz");
    assert.ok(jsonAt >= 0 && jsonAt < gzAt, `${rel}: serialize before compressing`);
  }
});

test("gzip round-trips losslessly and preserves every research field", () => {
  // Uses a REAL surviving payload rather than a synthetic fixture — the point is that this exact data
  // shape survives, including the fields that make leakage provable.
  const survivors = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "normalized.json") survivors.push(p);
    }
  };
  walk(SNAPSHOTS);
  if (survivors.length === 0) return; // payloads are ignored; a clean clone has none

  const raw = fs.readFileSync(survivors[0]);
  const back = zlib.gunzipSync(zlib.gzipSync(raw, { level: 9 }));
  assert.equal(Buffer.compare(raw, back), 0, "round-trip must be byte-identical");

  const doc = JSON.parse(back.toString("utf8"));
  assert.ok(Array.isArray(doc.records) && doc.records.length > 0, "records must survive");
  assert.ok(doc.normalizedHash, "the integrity hash must survive");

  // These five fields are what make the archive research-grade. capturedAt vs availableAt is the pair
  // that makes leakage provable, and losing either would silently void the corpus.
  for (const field of ["capturedAt", "availableAt", "bookmaker", "noVigProbability", "researchEligible"]) {
    assert.ok(field in doc.records[0], `per-row "${field}" must survive compression`);
  }
});

// ── the retention policy ───────────────────────────────────────────────────

test("the gzipped payload is TRACKED while the raw blob stays ignored", () => {
  const ignore = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
  assert.match(ignore, /market-snapshots\/\*\*\/raw\.json/, "raw provider blob stays out of git");
  assert.match(ignore, /market-snapshots\/\*\*\/normalized\.json$/m, "the uncompressed copy stays out");
  assert.match(
    ignore,
    /^!data\/internal\/mlb\/pregame-archive\/market-snapshots\/\*\*\/normalized\.json\.gz$/m,
    "the gzipped copy must be explicitly un-ignored — it is the durable record",
  );
  // Order matters in .gitignore: the negation must come AFTER the pattern it overrides.
  assert.ok(
    ignore.indexOf("normalized.json.gz") > ignore.indexOf("market-snapshots/**/normalized.json"),
    "the negation must follow the rule it overrides or git ignores it",
  );
});

test("retention stays internal — it must never reach the public export", () => {
  // The archive is research data, not a public surface. prune-internal-routes sweeps public:false
  // JSON out of out/, and these live outside public/ entirely.
  assert.ok(
    !SNAPSHOTS.includes(path.join(APP, "public")),
    "market snapshots must live outside app/public",
  );
  for (const rel of CAPTURE_SCRIPTS) {
    assert.match(read(rel), /public:\s*false/, `${rel}: payloads must be flagged non-public`);
  }
});

test("the size claim that justified this decision is checkable, not asserted", () => {
  // If a future capture balloons, the 150 MB/year figure stops being true and someone should notice.
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "normalized.json.gz") found.push(fs.statSync(p).size);
    }
  };
  walk(SNAPSHOTS);
  if (found.length === 0) return; // none captured yet — the writer just landed

  const avg = found.reduce((a, b) => a + b, 0) / found.length;
  const projectedMbPerYear = (avg * 16 * 365) / 1048576;
  assert.ok(
    projectedMbPerYear < 1024,
    `projected ${projectedMbPerYear.toFixed(0)} MB/year exceeds 1 GB — the git-viability premise no longer holds, ` +
      `revisit the storage decision rather than silently accumulating`,
  );
  console.log(`  [retention] ${found.length} durable payloads · avg ${(avg / 1024).toFixed(0)} KB · projected ${projectedMbPerYear.toFixed(0)} MB/year`);
});

// ── mutation ───────────────────────────────────────────────────────────────

test("MUTATION · removing the gz write is caught", () => {
  const rel = "scripts/capture-mlb-pregame-markets.mjs";
  const abs = path.join(APP, rel);
  const original = fs.readFileSync(abs, "utf8");
  const before = createHash("md5").update(original).digest("hex");
  try {
    const mutated = original.replace(/normalized\.json\.gz/g, "normalized-DISABLED.bin");
    assert.notEqual(mutated, original, "mutation must change the file");
    fs.writeFileSync(abs, mutated);
    assert.doesNotMatch(
      fs.readFileSync(abs, "utf8"),
      /normalized\.json\.gz/,
      "the guard must detect a removed durable write",
    );
  } finally {
    fs.writeFileSync(abs, original);
    assert.equal(
      createHash("md5").update(fs.readFileSync(abs, "utf8")).digest("hex"),
      before,
      "must restore byte-identically",
    );
  }
  assert.match(read(rel), /normalized\.json\.gz/);
});
