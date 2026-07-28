/**
 * Sport capability EVIDENCE guards — Sprint 032 Phase 5.
 *
 * `sport-capability-registry.test.mjs` already checks that every cited evidence path exists. Sprint
 * 032 found the narrower gap: existence is not capability. A directory can sit there, present and
 * empty, while the registry keeps advertising FULL_MODEL — the same green-but-broken shape as a
 * health check passing off a dead heartbeat. "Never promote a sport because UI exists" only holds if
 * something enforces it.
 *
 * WHY THESE ASSERTIONS AND NOT FRESHNESS
 * The obvious guard — "a FULL_MODEL sport must have an artifact from the last N days" — is a test
 * that rots on the calendar rather than on the code. It would fail on an off-season, on a legitimate
 * quiet day, and on any founder running the suite a week later, training everyone to ignore it. So
 * age is REPORTED by scripts/audit-sports.mjs and never asserted here. What is asserted is the
 * invariant that cannot be true of a working sport at any time of year: a capability claim resting
 * on an empty directory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { SPORT_CAPABILITIES, capabilityState, FULL_MODEL_SPORTS } from "./sport-capability-registry.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

const dirsOf = (cap) =>
  cap.evidence
    .map((rel) => ({ rel, abs: path.join(REPO, rel) }))
    .filter((e) => fs.existsSync(e.abs) && fs.statSync(e.abs).isDirectory());

// ── the invariant ──────────────────────────────────────────────────────────

test("a FULL_MODEL sport may not rest its claim on an empty directory", () => {
  const fullModel = SPORT_CAPABILITIES.filter((c) => c.state === "FULL_MODEL");
  assert.ok(fullModel.length > 0, "the registry should declare at least one live sport");

  for (const cap of fullModel) {
    const dirs = dirsOf(cap);
    assert.ok(
      dirs.length > 0,
      `${cap.key}: FULL_MODEL must cite at least one artifact DIRECTORY, not only source files — ` +
        `code that could produce data is not the same as data`,
    );
    for (const { rel, abs } of dirs) {
      const entries = fs.readdirSync(abs);
      assert.ok(
        entries.length > 0,
        `${cap.key}: cited directory ${rel} is EMPTY — a present-but-empty path is exactly how a ` +
          `dead sport keeps advertising itself as live`,
      );
    }
  }
});

test("a FULL_MODEL sport's artifact directories contain real, non-trivial files", () => {
  for (const cap of SPORT_CAPABILITIES.filter((c) => c.state === "FULL_MODEL")) {
    for (const { rel, abs } of dirsOf(cap)) {
      const files = fs.readdirSync(abs).filter((f) => f.endsWith(".json"));
      assert.ok(files.length > 0, `${cap.key}: ${rel} holds no JSON artifact`);
      // A zero-byte or stub file passes an existence check and carries no capability.
      for (const f of files) {
        const bytes = fs.statSync(path.join(abs, f)).size;
        assert.ok(bytes > 100, `${cap.key}: ${rel}/${f} is ${bytes} bytes — a stub, not an artifact`);
      }
    }
  }
});

// ── fail-closed posture ────────────────────────────────────────────────────

test("unknown sports fail closed to DISABLED", () => {
  // Genuinely unknown inputs only. "cricket" is here on purpose: the sport is registered as `ipl`,
  // so the colloquial name must NOT resolve — a near-miss quietly resolving to a capable sport is
  // precisely the failure this registry exists to prevent.
  for (const unknown of ["", "  ", "cricket", "tennis", "f1", "esports", "worldcup", null, undefined]) {
    assert.equal(capabilityState(unknown), "DISABLED", `"${unknown}" must not be assumed capable`);
  }
});

test("lookup normalizes case and surrounding whitespace, and nothing else", () => {
  // Documented contract on capabilityOf. Pinned because callers pass values straight from routes and
  // artifacts, where "MLB" and " mlb " both legitimately occur.
  for (const variant of ["mlb", "MLB", "Mlb", " mlb ", "\tMLB\n"]) {
    assert.equal(capabilityState(variant), "FULL_MODEL", `"${variant}" should resolve to mlb`);
  }
  // Normalization must not extend to fuzzy matching — only case and edges are forgiven.
  for (const notMlb of ["ml b", "mlb-", "m l b", "baseball"]) {
    assert.equal(capabilityState(notMlb), "DISABLED", `"${notMlb}" must not fuzzy-match a real sport`);
  }
});

test("FULL_MODEL_SPORTS is derived from state, never hand-listed", () => {
  const derived = SPORT_CAPABILITIES.filter((c) => c.state === "FULL_MODEL").map((c) => c.key);
  assert.deepEqual([...FULL_MODEL_SPORTS].sort(), derived.sort());
});

// ── registry completeness against the Sprint 032 audit list ────────────────

test("every sport named in the Sprint 032 audit has an explicit, evidenced state", () => {
  // The audit list from the sprint brief. World Cup is deliberately absent: it was closed out as an
  // active destination and lives under `soccer` as archive/proof only.
  const REQUIRED = ["nba", "nfl", "nhl", "ufc", "ipl", "soccer", "wnba", "mls", "epl"];
  const known = new Set(SPORT_CAPABILITIES.map((c) => c.key));
  for (const key of REQUIRED) {
    assert.ok(known.has(key), `${key} is named in the audit but carries no registry entry`);
    const cap = SPORT_CAPABILITIES.find((c) => c.key === key);
    assert.ok(cap.reason.length > 15, `${key}: needs a reason a non-engineer can check`);
    assert.ok(cap.evidence.length > 0, `${key}: a status nobody can audit is just an opinion`);
  }
});

test("no sport is promoted above SCAFFOLD_ONLY without a populated artifact directory", () => {
  // The rule the sprint brief states outright: never promote a sport because UI exists. SCAFFOLD_ONLY
  // and below may cite source files alone; anything claiming live or historical DATA must point at data.
  const CLAIMS_DATA = new Set(["FULL_MODEL", "HISTORICAL_ONLY"]);
  for (const cap of SPORT_CAPABILITIES.filter((c) => CLAIMS_DATA.has(c.state))) {
    const hasRealEvidence = cap.evidence.some((rel) => {
      const abs = path.join(REPO, rel);
      if (!fs.existsSync(abs)) return false;
      const st = fs.statSync(abs);
      if (st.isDirectory()) return fs.readdirSync(abs).length > 0;
      // A data file counts; a source file does not — code is capability-to-produce, not capability.
      return /\.json$/.test(rel) && st.size > 100;
    });
    assert.ok(
      hasRealEvidence,
      `${cap.key} claims ${cap.state} but cites no populated data — UI and source code are not evidence of data`,
    );
  }
});

// ── the audit tool itself ──────────────────────────────────────────────────

test("the audit script exists and reports rather than gates", () => {
  const script = fs.readFileSync(path.join(APP, "scripts/audit-sports.mjs"), "utf8");
  assert.match(script, /SPORT_CAPABILITIES/, "the audit must read the registry, not a parallel list");
  assert.doesNotMatch(
    script,
    /process\.exit\(1\)/,
    "the audit reports; age-based failure belongs nowhere — it would rot on the calendar",
  );
});

// ── money guard ────────────────────────────────────────────────────────────

test("money file untouched", () => {
  const md5 = createHash("md5")
    .update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
