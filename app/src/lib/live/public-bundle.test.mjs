/**
 * WHAT LIVE CODE REACHES A PUBLIC READER (Stage 2 · built-export guard).
 *
 * Reads `out/` — the bytes actually shipped — rather than source, because the question here is not
 * "what did we import" but "what can a reader download". Stage 2 mounts the MLB live panel on a
 * public page, so some live code ships by design; the ESPN-backed NFL provider path must not.
 *
 * ⚠ WHAT THIS GUARD DOES AND DOES NOT PROVE. It proves the NFL PROVIDER path is absent from the
 * client. It is NOT the thing that stops a reader reaching NFL live data — that is the gateway's
 * server-side allowlist (`rollout.test.mjs`), which holds no matter what the bundle contains. Both
 * are asserted because they fail in different ways.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const OUT = path.join(APP, "out");

/**
 * Every shipped JS/HTML file path. Deliberately NOT concatenated: the export is 450+ pages and
 * joining it into one string exhausts the heap (it did, on this guard's first run). Callers scan
 * file by file, which is also what lets a finding name the file it came from.
 */
function shippedFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(e.name)) files.push(full);
    }
  };
  walk(OUT);
  return files;
}

/*
 * v1.4.1 · ONE read of the shipped export for every needle this file asks about. The guards below used to re-read
 * the whole export once per needle (up to 16 full passes). The pass keeps, per needle, the FIRST shipped file
 * containing it (the same walk order as before) — over all shipped files and over scripts only — and the scripts
 * that carry "Live game state". Every assertion reads these answers; nothing is scanned less.
 */
const ESPN_VOCABULARY = ["STATUS_RAIN_DELAY", "STATUS_END_PERIOD", "shortDownDistanceText", "possessionText"];
const PROVIDER_HOSTS = ["statsapi.mlb.com", "site.api.espn.com"];
const SERVER_VARIABLES = ["LIVE_GATEWAY_ENABLED", "LIVE_PUBLIC_SPORTS", "BLOB_READ_WRITE_TOKEN", "ODDS_API_KEY"];
const LIVE_SURFACE = ["Live beta", "mlb-statsapi", "Live game state"];
const NEEDLES = [...ESPN_VOCABULARY, ...PROVIDER_HOSTS, "/api/live", ...SERVER_VARIABLES, ...LIVE_SURFACE];

let scanCache = null;
function scan() {
  if (scanCache) return scanCache;
  const files = shippedFiles();
  const first = new Map();
  const firstScript = new Map();
  const liveChunks = [];
  for (const f of files) {
    const body = fs.readFileSync(f, "utf8");
    const isScript = f.endsWith(".js");
    for (const n of NEEDLES) {
      if (!body.includes(n)) continue;
      if (!first.has(n)) first.set(n, f);
      if (isScript && !firstScript.has(n)) firstScript.set(n, f);
    }
    if (isScript && body.includes("Live game state")) liveChunks.push(f);
  }
  scanCache = { files, first, firstScript, liveChunks };
  return scanCache;
}

/** The first shipped file containing `needle`, or null (from the single pass). */
function findInShipped(needle) {
  if (!NEEDLES.includes(needle)) throw new Error(`public-bundle: "${needle}" is not in NEEDLES — add it so the single pass scans for it`);
  return scan().first.get(needle) ?? null;
}

test("BUNDLE 0 · the export is real (anti-vacuity)", () => {
  assert.ok(fs.existsSync(path.join(OUT, "index.html")), "no built export — run npm run build first");
  const files = shippedFiles();
  assert.ok(files.length > 400, `only ${files.length} shipped files scanned`);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(bytes > 1_000_000, "the shipped export is implausibly small");
});

test("BUNDLE 1 · ⚠ the ESPN PROVIDER path never reaches a public reader", () => {
  /*
   * Scoped to ESPN's own VOCABULARY rather than to our function names, because a minifier renames
   * local symbols: the absence of `normalizeNflScoreboard` from a minified chunk would prove
   * nothing. String literals survive minification, and these particular strings exist ONLY inside
   * the NFL adapter — so their absence is evidence and their presence would be a leak.
   */
  // Anti-vacuity: prove these strings are real by finding them in the adapter we are claiming is
  // server-side. A typo'd needle would otherwise make this guard pass forever.
  const adapter = fs.readFileSync(path.join(APP, "src/lib/live/adapters/espn-nfl.mjs"), "utf8");
  for (const v of ESPN_VOCABULARY) {
    assert.ok(adapter.includes(v), `"${v}" is not in the adapter — the needle is wrong, not the bundle`);
  }

  for (const v of ESPN_VOCABULARY) {
    const hit = findInShipped(v);
    assert.equal(hit, null, `"${v}" — ESPN adapter code shipped to the client in ${hit && path.basename(hit)}`);
  }
});

test("BUNDLE 2 · no shipped SCRIPT can call a provider directly", () => {
  /*
   * ⚠ Scoped to .js, deliberately. The provider hosts DO appear in shipped prose — /ufc cites
   * "Settled from ESPN MMA scoreboard (site.api.espn.com…)" as provenance, which predates Live and
   * is exactly the kind of sourcing this product should publish. A citation is not a call. What
   * must never exist is a SCRIPT that can reach a provider, because that is the design in which
   * upstream volume scales with readers instead of with events.
   */
  const scripts = scan().files.filter((f) => f.endsWith(".js"));
  assert.ok(scripts.length > 50, `only ${scripts.length} scripts scanned — the scan is not finding the bundle`);
  for (const host of PROVIDER_HOSTS) {
    const f = scan().firstScript.get(host);
    assert.equal(f === undefined, true, `${f && path.basename(f)} can call ${host} directly — the client must only ever call our gateway`);
  }
  assert.ok(findInShipped("/api/live"), "the client does reach the gateway — otherwise this guard is vacuous");
});

test("BUNDLE 3 · no credential, key or token travels with the live code", () => {
  for (const forbidden of SERVER_VARIABLES) {
    const hit = findInShipped(forbidden);
    assert.equal(hit, null, `"${forbidden}" is a SERVER variable and must not ship (found in ${hit && path.basename(hit)})`);
  }
});

test("BUNDLE 4 · the MLB live surface IS shipped, and says what it is", () => {
  // The inverse check: if Stage 2 silently shipped nothing, every guard above would pass trivially.
  for (const expected of LIVE_SURFACE) {
    assert.ok(findInShipped(expected), `"${expected}" is missing — the MLB live surface did not ship`);
  }
});

test("BUNDLE 5 · ⚠ MLB totals stay PAUSED — no combined total ships with the live surface", () => {
  // Scoped to the chunk that actually carries the live panel, so an unrelated page's copy cannot
  // fail this and, more importantly, cannot make it pass by accident.
  const { liveChunks } = scan();
  assert.ok(liveChunks.length > 0, "the live chunk was located — otherwise this guard proves nothing");
  for (const f of liveChunks) {
    const body = fs.readFileSync(f, "utf8");
    assert.equal(/\bover\/under\b/i.test(body), false, `${path.basename(f)} ships a totals concept`);
    assert.equal(body.includes("totalRuns"), false, `${path.basename(f)} ships the paused market's field`);
  }
});
