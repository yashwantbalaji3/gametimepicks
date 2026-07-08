/**
 * Paid Sports Data API readiness — scaffolding tests (Phase 2.6, planning only).
 *
 * These tests pin the HARD RULES of the scaffold:
 *   (a) the registry works with ALL provider env vars UNSET (no real key required),
 *   (b) an unconfigured / unknown provider fails GRACEFULLY (returns unavailable, never throws),
 *   (c) NO secrets are committed — the new files + .env.example expose only placeholder NAMES,
 *   (d) simulation/report code can mark modules unavailable when provider data is missing,
 *   (e) canonical money is untouched — portfolio.json md5 stays the fingerprint.
 *
 * No network call is made anywhere in this suite. Run from `app/`:
 *   npx tsx --test src/lib/data-providers/data-providers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  listProviders,
  describeProviders,
  knownEnvKeyNames,
  getProvider,
  missingProvider,
  resolveModule,
} from "./registry.ts";
import {
  unavailableModule,
  unavailableResult,
  byImpact,
  CAPABILITY_IMPACT,
} from "./types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(process.cwd(), "public", "data");
const REPO_ROOT = path.resolve(process.cwd(), ".."); // app/ -> repo root
const PORTFOLIO_MD5 = "affe6b21071f2b3be96bb2774eb347c3"; // canonical money fingerprint — must never change

// The env var NAMES this phase introduces (placeholders only — never real keys).
const PLACEHOLDER_ENV_NAMES = [
  "SPORTS_DATA_PROVIDER_KEY",
  "PLAYER_PROPS_PROVIDER_KEY",
  "ODDS_CONSENSUS_KEY",
  "INJURIES_LINEUPS_KEY",
  "SOCCER_STATS_PROVIDER_KEY",
  "HISTORICAL_DATA_PROVIDER_KEY",
];

/** Run a function with the given env NAMES forcibly deleted, then restore. */
function withEnvUnset(names, fn) {
  const saved = new Map();
  for (const n of names) {
    saved.set(n, process.env[n]);
    delete process.env[n];
  }
  try {
    return fn();
  } finally {
    for (const [n, v] of saved) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  }
}

// ── (a) registry needs no real keys — works with every provider env var unset ────────────────────

test("(a) registry lists providers and reports unconfigured with ALL env vars unset (no key needed)", () => {
  withEnvUnset(PLACEHOLDER_ENV_NAMES, () => {
    const providers = listProviders();
    assert.ok(providers.length >= 6, "expected the six ranked provider categories");
    for (const p of providers) {
      assert.equal(p.isConfigured(), false, `${p.id} must be unconfigured when its env NAME is unset`);
    }
    // The registry only inspects NAMES it declares; every declared name is a known placeholder.
    for (const name of knownEnvKeyNames()) {
      assert.ok(PLACEHOLDER_ENV_NAMES.includes(name), `unexpected env NAME inspected: ${name}`);
    }
  });
});

test("(a) provider ranking is documented HIGH→LOW and official settlement is #1", () => {
  assert.equal(CAPABILITY_IMPACT.official_settlement, 1, "official settlement is the highest-impact need");
  const ordered = byImpact(["historical", "official_settlement", "odds_consensus"]);
  assert.deepEqual(ordered, ["official_settlement", "odds_consensus", "historical"]);
});

// ── (b) unconfigured / unknown providers fail GRACEFULLY (never throw) ────────────────────────────

test("(b) getProvider on an UNKNOWN id returns a graceful unavailable result (no throw)", () => {
  const r = getProvider("does-not-exist");
  assert.equal(r.ok, false);
  assert.equal(r.available, false);
  assert.equal(r.providerId, "does-not-exist");
  assert.match(r.reason, /no provider registered/i);
});

test("(b) missingProvider() never throws and always reports unavailable", () => {
  withEnvUnset(PLACEHOLDER_ENV_NAMES, () => {
    // known but unconfigured
    const known = missingProvider("official-boxscore");
    assert.equal(known.available, false);
    assert.match(known.reason, /not configured/i);
    // unknown
    const unknown = missingProvider("totally-made-up");
    assert.equal(unknown.available, false);
    assert.match(unknown.reason, /no provider registered/i);
  });
});

test("(b) a configured provider (env NAME present) reports available WITHOUT any network call", () => {
  const name = "SPORTS_DATA_PROVIDER_KEY";
  const saved = process.env[name];
  process.env[name] = "placeholder-not-a-real-key"; // presence only — value is never read by the code
  try {
    const r = getProvider("official-boxscore");
    assert.equal(r.ok, true);
    assert.equal(r.available, true, "presence of the env NAME flips the provider to configured");
    // moduleFor still returns a plain availability record, not a network result.
    const m = r.provider.moduleFor("official_settlement_grade");
    assert.equal(m.available, true);
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

// ── (c) NO secrets committed — only placeholder NAMES appear in the new files + .env.example ──────

test("(c) new data-provider files + .env.example contain only placeholder NAMES, no secret VALUES", () => {
  const filesToScan = [
    path.join(HERE, "types.ts"),
    path.join(HERE, "registry.ts"),
    path.join(HERE, "data-providers.test.mjs"),
    path.join(REPO_ROOT, ".env.example"),
  ];

  // Patterns that resemble a REAL secret VALUE assigned to one of our placeholder NAMES,
  // e.g. `SPORTS_DATA_PROVIDER_KEY=abc123...`. An empty assignment (`NAME=`) is allowed.
  const assignedValue = new RegExp(
    `\\b(?:${PLACEHOLDER_ENV_NAMES.join("|")})\\s*[=:]\\s*['"\`]?([A-Za-z0-9_\\-]{12,})`,
  );
  // Generic long hex/base64-ish tokens that would indicate a leaked key of any kind.
  const genericHexKey = /\b(?:sk|pk|key|token|secret|bearer)[_-]?[A-Za-z0-9]{16,}\b/i;
  const longHex = /\b[a-f0-9]{40,}\b/i; // 40+ hex chars (SHA-ish / API-key-ish) — excludes short md5 hashes

  for (const file of filesToScan) {
    assert.ok(fs.existsSync(file), `expected ${file} to exist`);
    const text = fs.readFileSync(file, "utf8");

    const assigned = text.match(assignedValue);
    assert.equal(assigned, null, `a placeholder NAME is assigned a value-like token in ${file}: ${assigned?.[0]}`);

    const generic = text.match(genericHexKey);
    // Allow the words themselves in prose/identifiers; only flag if it looks like an actual token.
    if (generic) {
      assert.fail(`possible committed secret token in ${file}: ${generic[0]}`);
    }

    const hex = text.match(longHex);
    assert.equal(hex, null, `possible committed long-hex secret in ${file}: ${hex?.[0]}`);
  }
});

test("(c) .env.example declares every placeholder NAME with an EMPTY value", () => {
  const envExample = path.join(REPO_ROOT, ".env.example");
  const text = fs.readFileSync(envExample, "utf8");
  for (const name of PLACEHOLDER_ENV_NAMES) {
    // Must appear as an empty assignment on its own line: `NAME=` (optionally trailing whitespace).
    const re = new RegExp(`^${name}=\\s*$`, "m");
    assert.match(text, re, `${name} must be present in .env.example as an EMPTY placeholder assignment`);
  }
});

// ── (d) simulation/report code can mark modules unavailable when provider data is missing ─────────

test("(d) resolveModule returns an unavailable record (no fabrication) when no provider is configured", () => {
  withEnvUnset(PLACEHOLDER_ENV_NAMES, () => {
    const m = resolveModule("xg_shots");
    assert.equal(m.available, false);
    assert.equal(m.module, "xg_shots");
    assert.match(m.reason, /do not fabricate|unavailable/i);
  });
});

test("(d) unavailableModule / unavailableResult are pure and never throw", () => {
  const m = unavailableModule("score_distribution", "not yet simulated");
  assert.deepEqual(m, { module: "score_distribution", available: false, reason: "not yet simulated" });
  const r = unavailableResult("soccer-advanced", "provider not configured");
  assert.equal(r.ok, false);
  assert.equal(r.available, false);
});

test("(d) a provider reports its OWN modules unavailable when unconfigured, available when configured", () => {
  const name = "SOCCER_STATS_PROVIDER_KEY";
  const saved = process.env[name];
  delete process.env[name];
  try {
    const r = getProvider("soccer-advanced");
    assert.equal(r.ok, true);
    const off = r.provider.moduleFor("xg_shots");
    assert.equal(off.available, false, "unconfigured provider marks its module unavailable");
    assert.match(off.reason, /not configured/i);

    process.env[name] = "placeholder-only";
    const on = r.provider.moduleFor("xg_shots");
    assert.equal(on.available, true, "configured provider marks its module available");

    // a module the provider does not cover is unavailable regardless of config
    const foreign = r.provider.moduleFor("player_prop_lines");
    assert.equal(foreign.available, false);
    assert.match(foreign.reason, /does not cover/i);
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

// ── (e) canonical money unchanged ────────────────────────────────────────────────────────────────

test("(e) canonical money is untouched — portfolio.json md5 is unchanged", () => {
  const raw = fs.readFileSync(path.join(DATA_ROOT, "mr-dub", "portfolio.json"));
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  assert.equal(md5, PORTFOLIO_MD5, "portfolio.json md5 is the canonical fingerprint — scaffolding touches no money");
});

// ── sanity: descriptions are non-secret and complete ─────────────────────────────────────────────

test("every provider description is non-secret and maps to a placeholder env NAME", () => {
  const descs = describeProviders();
  assert.ok(descs.length >= 6);
  for (const d of descs) {
    assert.equal(typeof d.id, "string");
    assert.ok(d.capabilities.length >= 1);
    assert.equal(d.optional, true);
    assert.ok(PLACEHOLDER_ENV_NAMES.includes(d.envKeyName), `${d.id} must use a declared placeholder NAME`);
    // description text must not itself embed a value-like token
    assert.doesNotMatch(d.summary, /[a-f0-9]{40,}/i, `${d.id} summary must not contain a key-like token`);
  }
});
