/**
 * THE RESULTS TOOLS, AND THE FOUR ARITHMETIC MISTAKES THEY EXIST TO MAKE IMPOSSIBLE.
 *
 * Every test here is about a number that must NOT appear. The Results family's failure mode is not a
 * refusal or a crash — it is a confident wrong figure produced by adding two things the owner keeps
 * apart. So these drive the tools against fixtures with a KNOWN forbidden sum and assert the sum is
 * absent, and the last block mutates the tools to prove each guard is load-bearing.
 *
 * Run: npx tsx --test src/lib/ask/ask-results.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ASK_STATUS, askAssetPath } from "./contract.mjs";
import { ASK_TOOL_NAMES } from "./registry.mjs";
import { buildEvidence } from "./evidence.mjs";
import { getForecastRecord, getPendingResults, getProductRecord, getRecentResults } from "./tools/results.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.cwd();

/* A fixture with the exact shape the emit publishes, and a forbidden sum built in: the current record
   is 37–36 and there is a 5–0 legacy ladder, so 42–36 is the number a careless writer produces. */
const FIXTURE = {
  schemaVersion: 1,
  artifact: "ask-results",
  available: true,
  builtAt: "2026-09-24T00:45:00Z",
  headline: {
    byProduct: { "bank-builder": "product:-:bank-builder:COMPOSITE:protected-record", moonshot: "product:-:moonshot:RECEIPT_ERA:-" },
    bySport: { nfl: "forecast:nfl:-:LIVE_LEDGER:graded-picks" },
  },
  cells: [
    { cellId: "product:-:bank-builder:COMPOSITE:protected-record", recordType: "PRODUCT_RECORD", family: "product", product: "bank-builder", sport: null, segment: "protected-record", era: "COMPOSITE", presentation: "CURRENT", n: 73, counts: { won: 37, lost: 36, pending: 0, push: null, void: 0 }, decisive: 73, hitRate: null, ownerState: null, window: { from: "2026-06-09", to: "2026-09-22" }, status: "LIVE", displayEligible: { eligible: true, reason: "the protected record" }, asOf: "2026-09-23T09:59:55Z" },
    { cellId: "product:-:bank-builder:PROTECTED_BASE:-", recordType: "PRODUCT_RECORD", family: "product", product: "bank-builder", sport: null, segment: null, era: "PROTECTED_BASE", presentation: "CURRENT", n: 33, counts: { won: 19, lost: 14, pending: 0, push: null, void: 0 }, decisive: 33, hitRate: null, ownerState: null, window: { from: "2026-06-09", to: "2026-07-07" }, status: "FROZEN", displayEligible: { eligible: true, reason: "era component" }, asOf: "2026-09-23T09:59:55Z" },
    { cellId: "product:-:bank-builder:LEDGER_ONLY:ladder-1", recordType: "PRODUCT_RECORD", family: "product", product: "bank-builder", sport: null, segment: "ladder-1", era: "LEDGER_ONLY", presentation: "LEGACY_HISTORY", n: 5, counts: { won: 5, lost: 0, pending: null, push: null, void: null }, decisive: 5, hitRate: null, ownerState: null, window: null, status: "FROZEN", displayEligible: { eligible: true, reason: "legacy" }, asOf: null },
    { cellId: "product:-:bank-builder:PENDING_SETTLEMENT:-", recordType: "PRODUCT_RECORD", family: "product", product: "bank-builder", sport: null, segment: null, era: "PENDING_SETTLEMENT", presentation: "CURRENT", n: null, counts: { won: null, lost: null, pending: 4, push: null, void: null }, decisive: null, hitRate: null, ownerState: null, window: null, status: "LIVE", displayEligible: { eligible: true, reason: "awaiting settlement" }, asOf: null },
    { cellId: "product:-:bank-builder:UNRECEIPTED_GAP:-", recordType: "ERA_GAP", family: "product", product: "bank-builder", sport: null, segment: null, era: "UNRECEIPTED_GAP", presentation: "CURRENT", n: null, counts: { won: null, lost: null, pending: null, push: null, void: null }, decisive: null, hitRate: null, ownerState: null, window: null, status: "FROZEN", displayEligible: { eligible: true, reason: "a disclosed gap — never a number" }, asOf: null },
    { cellId: "product:-:moonshot:RECEIPT_ERA:-", recordType: "PRODUCT_RECORD", family: "product", product: "moonshot", sport: null, segment: null, era: "RECEIPT_ERA", presentation: "CURRENT", n: 39, counts: { won: 4, lost: 35, pending: 0, push: null, void: 0 }, decisive: 39, hitRate: null, ownerState: null, window: { from: "2026-08-15", to: "2026-09-22" }, status: "LIVE", displayEligible: { eligible: true, reason: "current" }, asOf: null },
    { cellId: "forecast:nfl:-:LIVE_LEDGER:graded-picks", recordType: "FORECAST_RECORD", family: "forecast", product: null, sport: "nfl", segment: "graded-picks", era: "LIVE_LEDGER", presentation: "CURRENT", n: 61, counts: { won: 32, lost: 27, pending: 0, push: null, void: 2 }, decisive: 59, hitRate: null, ownerState: "EMERGING", window: null, status: "LIVE", displayEligible: { eligible: true, reason: "live" }, asOf: null },
  ],
  recent: {
    nfl: {
      total: 60, asOf: "2026-09-24T00:00:00Z",
      rows: [
        { eventId: "nfl-1", when: "2026-09-15", subject: "DEN @ KC", market: "Winner", predicted: "AWAY", actual: "HOME", hit: false, modelProbability: null },
        { eventId: "nfl-2", when: "2026-09-14", subject: "NYJ @ BUF", market: "Winner", predicted: "HOME", actual: "HOME", hit: true, modelProbability: 0.61 },
        { eventId: "nfl-3", when: "2026-09-13", subject: "MIA @ NE", market: "Winner", predicted: "AWAY", actual: null, hit: null, modelProbability: null },
      ],
    },
  },
};

/** A turn whose loader serves the fixture, so the tools run their real code path against known bytes. */
const ctxWith = (doc) => ({ turn: { load: async (p) => (p === askAssetPath.results() ? { ok: true, json: doc } : { ok: false }) } });
const ctxMissing = () => ({ turn: { load: async () => ({ ok: false }) } });

/* The executor wraps a tool's return in `{ tool, status, data }`; buildEvidence reads `env.data`. This
   mirrors that wrapping so the sentences under test are the ones production actually composes. */
const textOf = (env, tool) => buildEvidence([{ tool, status: env.status, links: env.links, data: env }]).facts.map((f) => f.text).join(" | ");

/* ── 1 · ERAS ARE NEVER SUMMED ──────────────────────────────────────────────────────────────────── */

test("the current record is the cell the OWNER designated, never a scan-and-add", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(FIXTURE));
  assert.equal(r.status, ASK_STATUS.OK);
  assert.equal(r.current.cellId, FIXTURE.headline.byProduct["bank-builder"]);
  assert.equal(r.current.label, "37–36");
  assert.equal(r.current.counts.won, 37);
});

test("legacy history is a SEPARATE field, and the forbidden sum appears nowhere", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(FIXTURE));
  assert.deepEqual(r.legacy.map((c) => c.era), ["LEDGER_ONLY"]);
  assert.equal(r.legacy[0].presentation, "LEGACY_HISTORY");
  assert.ok(r.eraRule && /never added/i.test(r.eraRule));
  // 37 + 5 = 42. The moment that number exists anywhere in the envelope, the era boundary is gone.
  const blob = JSON.stringify(r);
  for (const forbidden of ['"won":42', '"lost":36,"won":42', "42–36"]) {
    assert.ok(!blob.includes(forbidden), `the envelope must not contain ${forbidden}`);
  }
  assert.ok(!r.components.some((c) => c.presentation === "LEGACY_HISTORY"), "a legacy cell must never appear as a component of the current record");
});

test("the evidence SENTENCE labels a legacy row as legacy — the writer cannot read it as current", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(FIXTURE));
  const text = textOf(r, "getProductRecord");
  assert.match(text, /5–0 — settled under an earlier policy and NOT part of the current record/);
  assert.ok(!/42–36/.test(text));
});

/* ── 2 · PENDING IS A COUNT, NEVER A LOSS ───────────────────────────────────────────────────────── */

test("pending is carried on its own and never folded into lost", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(FIXTURE));
  assert.equal(r.current.counts.lost, 36, "lost is the owner's own number");
  const pend = await getPendingResults({}, ctxWith(FIXTURE));
  assert.equal(pend.totalPending, 4);
  const text = textOf(pend, "getPendingResults");
  assert.match(text, /never treated as a loss/);
});

test("an ungraded row is excluded from won AND from lost", async () => {
  const r = await getRecentResults({ sport: "NFL", limit: 10 }, ctxWith(FIXTURE));
  assert.equal(r.matched, 3);
  assert.equal(r.won, 1);
  assert.equal(r.lost, 1);
  assert.equal(r.ungraded, 1, "the null-outcome row is neither a win nor a loss");
  assert.equal(r.won + r.lost + r.ungraded, r.matched);
});

/* ── 3 · MISSING IS NOT ZERO ────────────────────────────────────────────────────────────────────── */

test("a cell with no decisive counts gets NO label — never a 0–0", async () => {
  const pend = await getPendingResults({}, ctxWith(FIXTURE));
  const gap = pend.disclosedGaps[0];
  assert.ok(gap, "the disclosed gap is reported");
  assert.equal(gap.label, null, "a gap has no record label");
  assert.equal(gap.n, null);
  assert.ok(!JSON.stringify(pend).includes('"label":"0–0"'));
});

test("a disclosed gap is reported as a gap, not as nothing to report", async () => {
  const pend = await getPendingResults({}, ctxWith(FIXTURE));
  assert.equal(pend.disclosedGaps.length, 1);
  assert.match(textOf(pend, "getPendingResults"), /discloses a gap/);
});

test("a bounded list always reports the TRUE total beside what it returned", async () => {
  const r = await getRecentResults({ sport: "NFL", limit: 1 }, ctxWith(FIXTURE));
  assert.equal(r.rows.length, 1);
  assert.equal(r.totalRecorded, 60, "the feed's true size, not the page size");
  assert.equal(r.publishedRows, 3);
  assert.match(textOf(r, "getRecentResults"), /60 graded NFL forecasts on record/);
});

/* ── 4 · NO HIT RATE IS INVENTED ────────────────────────────────────────────────────────────────── */

test("hitRate is copied, never computed — and the typed recordType rides along", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(FIXTURE));
  assert.equal(r.current.hitRate, null, "the owner publishes none, so there is none");
  assert.equal(r.current.recordType, "PRODUCT_RECORD");
  const f = await getForecastRecord({ sport: "NFL" }, ctxWith(FIXTURE));
  assert.equal(f.current.recordType, "FORECAST_RECORD", "a forecast record is never relabelled as a product record");
  assert.equal(f.current.hitRate, null);
  // 37/73 = 0.5068… — a rate nobody published must not be anywhere in the envelope.
  assert.ok(!/0\.50|50\.6|50%/.test(JSON.stringify(r)));
});

test("the forecast record uses the owner's DECISIVE denominator, and voids are not losses", async () => {
  const f = await getForecastRecord({ sport: "NFL" }, ctxWith(FIXTURE));
  assert.equal(f.current.decisive, 59, "59 decided, not the 61 recorded");
  assert.equal(f.current.counts.void, 2);
  assert.match(f.current.label, /32–27 · 2 void/);
});

/* ── REFUSALS AND DEGRADATION ───────────────────────────────────────────────────────────────────── */

test("an unavailable asset degrades ONE tool, and never invents a record", async () => {
  for (const fn of [getProductRecord, getForecastRecord, getRecentResults, getPendingResults]) {
    const r = await fn({ product: "bank-builder", sport: "NFL" }, ctxMissing());
    assert.equal(r.status, ASK_STATUS.ERROR);
    assert.ok(!JSON.stringify(r).includes("37"), "a refusal must carry no figures");
  }
});

test("a projection marked unavailable is an honest refusal, not an empty record", async () => {
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith({ ...FIXTURE, available: false }));
  assert.equal(r.status, ASK_STATUS.UNSUPPORTED);
  assert.match(r.detail, /no canonical Results projection/);
});

test("a product with no designated headline says so rather than picking a cell itself", async () => {
  const doc = { ...FIXTURE, headline: { byProduct: {}, bySport: {} } };
  const r = await getProductRecord({ product: "bank-builder" }, ctxWith(doc));
  assert.equal(r.status, ASK_STATUS.UNSUPPORTED);
  assert.ok(!JSON.stringify(r).includes("37–36"), "no record is reported when none is designated");
});

test("a sport with no published graded feed lists what IS available", async () => {
  const r = await getRecentResults({ sport: "MLB" }, ctxWith(FIXTURE));
  assert.equal(r.status, ASK_STATUS.UNSUPPORTED);
  assert.deepEqual(r.availableSports, ["nfl"]);
});

/* ── THE TOOLS ARE DECLARED, AND THE PROJECTION IS A DAILY FILE ─────────────────────────────────── */

test("all four Results tools are in the registry", () => {
  for (const name of ["getProductRecord", "getForecastRecord", "getRecentResults", "getPendingResults"]) {
    assert.ok(ASK_TOOL_NAMES.includes(name), `${name} must be declared`);
  }
});

test("results.json is a DAILY file — committing it would report the projection stale every morning", async () => {
  const { ASK_DAILY_FILES, isAskDailyFile } = await import("./contract.mjs");
  assert.ok(ASK_DAILY_FILES.includes("results.json"));
  assert.ok(isAskDailyFile("results.json"));
});

test("the emitted asset carries no model-family cell and nothing the owner marked ineligible", () => {
  const file = path.join(APP, "public/data/ask/v1/results.json");
  if (!fs.existsSync(file)) return; // not emitted in this run; the build emits it and the guard above pins the contract
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const c of doc.cells ?? []) {
    assert.notEqual(c.family, "model-family", `${c.cellId}: calibration states must not cross into Ask`);
    assert.equal(c.displayEligible?.eligible, true, `${c.cellId}: only display-eligible cells cross`);
  }
  assert.ok(!/shadow|challenger|prereg/i.test(JSON.stringify(doc)), "no internal research vocabulary crosses");
});

test("the daily artifact carries its OWN drop receipt — the committed manifest must not move nightly", () => {
  /*
   * The manifest is committed and `ask:check` compares it byte-for-byte. A count derived from the
   * results projection — which the settlement pipeline rebuilds every night — would make the manifest
   * change every morning and the currency check cry wolf daily. So the receipt for what was excluded
   * lives in results.json, which is a daily file, and the manifest stays stable.
   */
  const repo = path.join(APP, "..");
  const manifestPath = path.join(repo, "data/ask-projection/v1/manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.dailyFiles.includes("results.json"), "results.json must be declared daily in the receipt");
  for (const d of manifest.dropped ?? []) {
    assert.ok(!String(d.what ?? "").startsWith("results"), `the committed manifest must not carry a nightly-derived results count (${JSON.stringify(d)})`);
  }
  const resultsPath = path.join(repo, "data/ask-projection/v1/results.json");
  if (!fs.existsSync(resultsPath)) return;
  const doc = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  assert.ok(Array.isArray(doc.excluded), "the daily artifact states what it cut, even when it cut nothing");
});

/* ── MUTATION PROBES ────────────────────────────────────────────────────────────────────────────── */

function mutating(file, find, replace, probeSource) {
  const target = path.join(HERE, file);
  const original = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const text = original.toString();
  assert.ok(text.includes(find), `mutation anchor not found in ${file} — the source changed shape`);
  for (const stale of fs.readdirSync(path.dirname(target)).filter((n) => n.includes(".mutation-probe."))) {
    fs.rmSync(path.join(path.dirname(target), stale), { force: true });
  }
  const mutatedPath = path.join(HERE, file.replace(/\.mjs$/, ".mutation-probe.mjs"));
  const probePath = path.join(os.tmpdir(), `gtp-ask-results-probe-${digest.slice(0, 8)}.mjs`);
  let out = "";
  try {
    fs.writeFileSync(mutatedPath, text.replace(find, replace));
    fs.writeFileSync(probePath, probeSource(mutatedPath));
    out = execFileSync("npx", ["tsx", probePath], { encoding: "utf8", cwd: APP }).trim();
  } finally {
    fs.rmSync(mutatedPath, { force: true });
    fs.rmSync(probePath, { force: true });
  }
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"), digest,
    `${file} was NOT left untouched — the probe must never write the live module`);
  return out;
}

const PROBE_FIXTURE = JSON.stringify(FIXTURE);

test("MUTATION · folding legacy into the current list produces the 42–36 that must not exist", () => {
  const out = mutating(
    "tools/results.mjs",
    '    .filter((c) => c.presentation === "CURRENT" && c.cellId !== current.cellId && recordLabel(c) !== null)',
    "    .filter((c) => c.cellId !== current.cellId && recordLabel(c) !== null)",
    (t) => `import { getProductRecord } from ${JSON.stringify(t)};
const doc = ${PROBE_FIXTURE};
const ctx = { turn: { load: async () => ({ ok: true, json: doc }) } };
const r = await getProductRecord({ product: "bank-builder" }, ctx);
const leaked = r.components.some((c) => c.era === "LEDGER_ONLY");
console.log(leaked ? "MISSED" : "CAUGHT");`,
  );
  assert.equal(out, "MISSED", "the mutation must actually put a legacy row among the current components");
});

test("MUTATION · folding ungraded rows into the graded set makes them vanish from the accounting", () => {
  const out = mutating(
    "tools/results.mjs",
    "  const graded = rows.filter((r) => r.hit !== null);",
    "  const graded = rows;",
    (t) => `import { getRecentResults } from ${JSON.stringify(t)};
const doc = ${PROBE_FIXTURE};
const ctx = { turn: { load: async () => ({ ok: true, json: doc }) } };
const r = await getRecentResults({ sport: "NFL", limit: 10 }, ctx);
/* The fixture holds one row with hit:null. Unmutated, ungraded is 1 and the reader is told so.
   Mutated, that row is folded into the graded set and simply vanishes from the accounting. */
console.log(r.ungraded === 0 ? "MISSED" : "CAUGHT");`,
  );
  assert.equal(out, "MISSED", "the mutation must make the ungraded row disappear from the accounting");
});

test("MUTATION · a label built from missing counts invents a 0–0 for a disclosed gap", () => {
  const out = mutating(
    "tools/results.mjs",
    "  if (!c || c.won == null || c.lost == null) return null;",
    "  if (!c) return null;",
    (t) => `import { getPendingResults } from ${JSON.stringify(t)};
const doc = ${PROBE_FIXTURE};
const ctx = { turn: { load: async () => ({ ok: true, json: doc }) } };
const r = await getPendingResults({}, ctx);
const gap = r.disclosedGaps[0];
console.log(gap && gap.label !== null ? "MISSED" : "CAUGHT");`,
  );
  assert.equal(out, "MISSED", "the mutation must produce a label where the owner carries no counts");
});
