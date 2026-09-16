/**
 * LIVE TRUTH + SAFETY GUARDS (v1.1 · §4, §13, §14).
 *
 * These are source-level guards, and the hazard with source-level guards in this repository is that
 * they pass VACUOUSLY — a path that no longer exists, a regex that matches nothing. So every scan
 * here first proves it read a non-empty file, and the banned-phrase scan is mutation-probed: a
 * deliberate violation is injected into the scanned text and the checker must catch it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const APP = path.join(here, "..", "..", "..");

/** Every file that produces live-facing copy or decides live behaviour. */
const LIVE_SOURCES = [
  "src/lib/live/contract.mjs",
  "src/lib/live/freshness.mjs",
  "src/lib/live/forecast-join.mjs",
  "src/lib/live/client.ts",
  "src/lib/live/preview-data.ts",
  "src/lib/live/adapters/mlb-statsapi.mjs",
  "src/lib/live/adapters/espn-nfl.mjs",
  "src/components/live/live-panel.tsx",
  "src/components/live/live-primitives.tsx",
  "src/components/live/use-live-event.ts",
  "src/app/preview/live/page.tsx",
  "api/live.mjs",
  "api/_live-core.mjs",
];

const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/**
 * Split a source file into executable CODE and rendered STRING literals, with comments discarded.
 *
 * Written as a scanner rather than a regex because both halves have a false-positive mode that would
 * quietly break these guards: a regex over raw text finds banned words inside the very comments that
 * DOCUMENT the ban (every failure on the first run of this suite was exactly that), while naive
 * comment-stripping eats the "//" inside a URL string. Only tracking string state gets both right.
 */
function partition(source) {
  let code = "";
  const strings = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      let lit = "";
      while (j < source.length) {
        if (source[j] === "\\") { lit += source[j + 1] ?? ""; j += 2; continue; }
        if (source[j] === quote) break;
        lit += source[j];
        j += 1;
      }
      strings.push(lit);
      code += quote + quote; // an empty placeholder keeps surrounding code shape intact
      i = j + 1;
      continue;
    }
    code += c;
    i += 1;
  }
  return { code, strings: strings.join("\n") };
}

/** Rendered copy only — string and template literals, comments excluded. */
function renderedStrings(source) {
  return partition(source).strings;
}

/** Executable code only — comments and string contents excluded. */
function codeOnly(source) {
  return partition(source).code;
}

test("SAFETY 0 · every scanned file exists and is non-trivial (the anti-vacuity check)", () => {
  for (const rel of LIVE_SOURCES) {
    const body = read(rel);
    assert.ok(body.length > 400, `${rel} is too small to be the real file — a scan over it proves nothing`);
  }
  assert.equal(LIVE_SOURCES.length, 13);
});

/**
 * Phrases §4 forbids unless a validated live model exists. None does.
 *
 * Matched against RENDERED strings, since "no probabilistic inference is implied" is a sentence a
 * comment is allowed to contain and a label is not.
 */
const BANNED = [
  /\bon pace\b/i,
  /\bon track\b/i,
  /\blive win probability\b/i,
  /\bchance to hit\b/i,
  /\block\b(?!ed|s\b)/i,
  /\bsafe bet\b/i,
  /\bmodel (?:has )?(?:changed|updated)\b/i,
  /\bguaranteed\b/i,
];

test("SAFETY 1 · no live surface renders a forbidden probabilistic phrase", () => {
  let scanned = 0;
  for (const rel of LIVE_SOURCES) {
    const copy = renderedStrings(read(rel));
    scanned += copy.length;
    for (const rx of BANNED) {
      assert.equal(rx.test(copy), false, `${rel} renders a forbidden phrase matching ${rx}`);
    }
  }
  assert.ok(scanned > 3000, "the scan read real rendered copy, not an empty extraction");
});

test("SAFETY 2 · MUTATION PROBE — the banned-phrase scan actually catches a violation", () => {
  // Without this, SAFETY 1 could pass because the extractor returns nothing.
  const poisoned = renderedStrings(`const label = "Jefferson is on pace to hit";`);
  assert.ok(poisoned.includes("on pace"), "the extractor must see rendered strings");
  assert.equal(BANNED.some((rx) => rx.test(poisoned)), true, "the ban list must reject it");
  for (const sample of ['const a = "78% chance to hit now";', 'const b = "this is a lock";', 'const c = "the model changed to 12";']) {
    assert.equal(BANNED.some((rx) => rx.test(renderedStrings(sample))), true, `missed: ${sample}`);
  }
  // The inverse probe: a comment that DOCUMENTS the ban must not itself register as a violation,
  // which is what made this suite fail on its first run.
  const documented = renderedStrings('// never say "on pace"\n/* and never "this is a lock" */\nconst ok = "inside pregame range";');
  assert.equal(BANNED.some((rx) => rx.test(documented)), false, "a comment about the ban is not a violation");
  assert.equal(documented.includes("inside pregame range"), true, "real copy still reaches the scan");
  // And code-only extraction must keep a URL intact rather than treating "//" as a comment.
  assert.equal(codeOnly('const u = "x"; fetch(y);').includes("fetch"), true);
  assert.equal(renderedStrings('const u = "https://statsapi.mlb.com/x";').includes("statsapi.mlb.com"), true);
});

test("SAFETY 3 · no provider host is spelled outside the gateway core and the adapters' comments", () => {
  const ALLOWED = new Set(["api/_live-core.mjs", "src/lib/live/adapters/mlb-statsapi.mjs", "src/lib/live/adapters/espn-nfl.mjs"]);
  let found = 0;
  for (const rel of LIVE_SOURCES) {
    const body = read(rel);
    const hits = [...body.matchAll(/https?:\/\/(?:statsapi\.mlb\.com|site\.api\.espn\.com)/g)];
    if (hits.length) found += hits.length;
    if (!ALLOWED.has(rel)) {
      assert.equal(hits.length, 0, `${rel} names a provider host — only the gateway core may build a provider URL`);
    }
  }
  assert.ok(found > 0, "the pattern matches something somewhere — otherwise this guard is vacuous");
  // In the adapters the host may appear ONLY in a comment (they take parsed payloads, never fetch).
  for (const rel of ["src/lib/live/adapters/mlb-statsapi.mjs", "src/lib/live/adapters/espn-nfl.mjs"]) {
    const { code, strings } = partition(read(rel));
    assert.equal(/https?:\/\//.test(code + strings), false, `${rel} must not build a URL — it takes parsed payloads only`);
    assert.equal(/\bfetch\s*\(|node:fs|node:http/.test(code), false, `${rel} must never perform I/O`);
  }
});

test("SAFETY 4 · no secret, credential or key is read anywhere on the live path", () => {
  for (const rel of LIVE_SOURCES) {
    const body = codeOnly(read(rel));
    for (const rx of [/process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD)/, /Authorization:/i, /api[_-]?key/i]) {
      assert.equal(rx.test(body), false, `${rel} touches a credential — the live path requires none`);
    }
  }
});

test("SAFETY 5 · the client bundle reads NEXT_PUBLIC_* only, and only as a literal", () => {
  for (const rel of ["src/lib/live/client.ts", "src/components/live/use-live-event.ts", "src/components/live/live-panel.tsx", "src/components/live/live-primitives.tsx"]) {
    const body = read(rel);
    for (const m of codeOnly(body).matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      assert.match(m[1], /^NEXT_PUBLIC_/, `${rel} reads a server variable (${m[1]}) from client code`);
    }
    // ⚠ Next inlines a LITERAL member expression only; a computed read compiles to undefined in the
    // browser and the feature would silently never turn on.
    assert.equal(/process\.env\[/.test(codeOnly(body)), false, `${rel} reads process.env by computed key`);
  }
});

test("SAFETY 6 · the gateway is OFF by default and its flag is the whole rollback", () => {
  const core = read("api/_live-core.mjs");
  assert.match(core, /LIVE_GATEWAY_ENABLED/);
  const client = read("src/lib/live/client.ts");
  assert.match(client, /NEXT_PUBLIC_LIVE_ENABLED/);
  // Two independent switches: the server stops spending, the client stops rendering and polling.
  assert.match(read("src/components/live/live-panel.tsx"), /liveEnabled\(\)/);
});

test("SAFETY 7 · ⚠ MLB totals stay PAUSED — no live surface mentions a combined total or over/under", () => {
  const surfaces = ["src/components/live/live-panel.tsx", "src/components/live/live-primitives.tsx", "src/lib/live/preview-data.ts"];
  for (const rel of surfaces) {
    const copy = renderedStrings(read(rel));
    for (const rx of [/\bover\/under\b/i, /\btotal runs\b/i, /\bo\/u\b/i, /\bgame total\b/i]) {
      assert.equal(rx.test(copy), false, `${rel} renders a totals concept while MLB totals are PAUSED`);
    }
    assert.equal(/totalRuns/.test(read(rel)), false, `${rel} reads the paused market's field`);
  }
});

test("SAFETY 8 · the live path never writes a file, and never settles anything", () => {
  for (const rel of LIVE_SOURCES) {
    const body = codeOnly(read(rel));
    assert.equal(/writeFileSync|writeFile\(|appendFileSync|mkdirSync|rmSync/.test(body), false, `${rel} writes to disk`);
    assert.equal(/\bsettle|isGradeable|gradeGame/i.test(body), false, `${rel} reaches into settlement — a live FINAL is not a graded result`);
  }
});

test("SAFETY 9 · every refusal reason the gateway can emit has reader-facing copy", () => {
  const core = read("api/_live-core.mjs");
  const handler = read("api/live.mjs");
  const contract = read("src/lib/live/contract.mjs");
  const primitives = read("src/components/live/live-primitives.tsx");
  const declared = [...contract.matchAll(/"([A-Z_]+)",/g)].map((m) => m[1])
    .filter((r) => /^(PROVIDER_|EVENT_|AMBIGUOUS_|UNSUPPORTED_|FEATURE_)/.test(r));
  assert.ok(declared.length >= 6, "the reason list was read, not guessed");
  for (const reason of declared) {
    assert.ok(primitives.includes(reason), `${reason} has no reader-facing copy`);
  }
  // And every reason the code actually emits is one of the declared ones.
  for (const src of [core, handler]) {
    for (const m of src.matchAll(/reason: "([A-Z_]+)"/g)) {
      assert.ok(declared.includes(m[1]), `${m[1]} is emitted but not declared in the contract`);
    }
  }
});

test("SAFETY 10 · the preview route is internal-guarded, noindex, and ABSENT from the built export", () => {
  const page = read("src/app/preview/live/page.tsx");
  assert.match(page, /guardInternalRoute\(\)/);
  assert.match(page, /index: false/);
  assert.match(read("scripts/prune-internal-routes.mjs"), /INTERNAL_ROUTES = \[[^\]]*"preview"/);

  // The source-level gates above are intent. This is the outcome: the page really is not shipped.
  // "Internal" on a statically exported site has meant "world-readable at its URL" before now, so
  // the claim is checked against the export rather than against the guard that is supposed to cause it.
  const exportDir = path.join(APP, "out");
  assert.ok(fs.existsSync(exportDir), "no built export to check — run npm run build first");
  assert.ok(fs.existsSync(path.join(exportDir, "index.html")), "the export is real, not an empty directory");
  assert.ok(fs.existsSync(path.join(exportDir, "nfl", "index.html")), "a known public route IS present, so absence below means something");

  for (const rel of [["preview", "live", "index.html"], ["preview", "live"], ["preview"]]) {
    assert.equal(fs.existsSync(path.join(exportDir, ...rel)), false, `/${rel.join("/")} was shipped to the public export`);
  }
  // Its compiled chunk is a separately guessable URL, and deleting the HTML alone would leave it.
  const chunkDir = path.join(exportDir, "_next", "static", "chunks", "app", "preview");
  assert.equal(fs.existsSync(chunkDir), false, "the preview route's JS chunk is still on the CDN");
});
