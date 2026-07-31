/**
 * Vercel canonical-project guard — one production project, declared in one place.
 *
 * 2026-07-31: two Vercel projects were found deploying every push of this repo. The canonical
 * one (`gametime-picks`, WITH dash — proven by builtAt fingerprint on the custom domain) was
 * already documented in docs/VERCEL_DEPLOYMENT_CLEANUP_2026-06-02.md, yet three LIVING docs
 * drifted into calling the duplicate the "gate", and the duplicate kept building for two more
 * months. These assertions make that drift a test failure instead of a rediscovery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.resolve(APP, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

const CANONICAL = "gametime-picks"; // WITH dash — serves gametimepicks.yashwantbalaji.com
const DUPLICATE = "gametimepicks"; // NO dash — serves nothing public

test("vercel.json wires the ignored-build script", () => {
  const cfg = JSON.parse(read("app/vercel.json"));
  assert.match(cfg.ignoreCommand ?? "", /vercel-ignore-build\.sh/);
});

test("the ignore script skips ONLY the known duplicate slug and fails open", () => {
  const sh = read("app/scripts/vercel-ignore-build.sh");
  // Skip patterns must be the duplicate's exact host shapes…
  assert.match(sh, /gametimepicks\.vercel\.app\|gametimepicks-\*\.vercel\.app/);
  // …and the canonical host must never appear as a skip pattern.
  assert.doesNotMatch(sh, /case[^\n]*\n(?:[^\n]*\n)*?\s*gametime-picks\.vercel\.app\)/);
  // Unknown/absent project identity must fall through to the diff logic, not skip.
  assert.match(sh, /VERCEL_PROJECT_PRODUCTION_URL:-/);
});

test("the canonical declaration exists and is unambiguous", () => {
  const doc = read("docs/VERCEL_CANONICAL_PROJECT.md");
  assert.match(doc, /Canonical production project:\s*`gametime-picks`/);
  assert.match(doc, /`gametimepicks`[^\n]*duplicate|duplicate[^\n]*`gametimepicks`/i);
});

test("living docs no longer call the duplicate the production gate", () => {
  // Historical reports keep their original text; these three are LIVING references and were
  // corrected. A regression here means the mislabel is spreading again.
  for (const f of ["docs/ARCHITECTURE.md", "docs/PROJECT_OVERVIEW.md", "docs/KNOWN_LIMITATIONS_AND_RISKS.md"]) {
    const doc = read(f);
    assert.doesNotMatch(
      doc,
      /gametimepicks \(gate\)|`gametimepicks`\s*\(gate\)|gametime-picks[^\n]*\(legacy/i,
      `${f}: still carries the inverted canonical/duplicate labeling`,
    );
  }
});

test("smoke/report tooling points at the canonical public host", () => {
  assert.match(read("app/scripts/smoke-test-production.mjs"), new RegExp(`${CANONICAL}\\.vercel\\.app`));
  assert.match(read("app/scripts/write-run-report.mjs"), new RegExp(`${CANONICAL}\\.vercel\\.app`));
  assert.ok(CANONICAL !== DUPLICATE);
});
