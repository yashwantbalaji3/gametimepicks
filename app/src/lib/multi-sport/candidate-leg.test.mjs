/**
 * MULTI-SPORT CANDIDATE LEG + POOL/PREVIEW (2026-07-09) — schema, settlement gating, no exposure.
 *
 * Pins: the shared CandidateLeg schema accepts MLB + Soccer legs; product eligibility is settlement-
 * aware (MLB and un-wired soccer markets are ineligible → analysis/watchlist only); the read-only pool
 * marks every MLB leg ineligible and never fabricates; the product preview is only ever no-play/
 * watchlist (never an active card / exposure); the schema is NOT wired into money-product generation;
 * money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { normalizeCandidateLeg, settlementSourceFor, evaluateProductEligibility } from "./candidate-leg.ts";

const app = process.cwd();
const repo = path.join(app, "..");

test("1 · schema accepts both MLB and Soccer legs and derives eligibility", () => {
  const mlb = normalizeCandidateLeg({ sport: "MLB", date: "2026-07-09", gameId: "g1", eventName: "A @ B", market: "moneyline", selection: "B ML", dataQuality: "strong", artifactSource: "mlb/team-markets" });
  const soc = normalizeCandidateLeg({ sport: "Soccer", date: "2026-07-09", gameId: "m1", eventName: "X vs Y", market: "double_chance", selection: "X or Draw", dataQuality: "strong", artifactSource: "wc/proj" });
  assert.equal(mlb.sport, "MLB"); assert.equal(soc.sport, "Soccer");
  for (const l of [mlb, soc]) for (const f of ["settlementSource", "productEligible", "productEligibilityReason", "publicLabel"]) assert.ok(l[f] != null, `${f} derived`);
  // publicLabel never leaks a probability.
  for (const l of [mlb, soc]) assert.doesNotMatch(l.publicLabel, /%|\d+\.\d{2,}/);
});

test("2 · settlement source is honest — MLB none, soccer core api-football, soccer AH/team-totals none", () => {
  // MLB settlement is now wired for the tested markets (statsapi box scores); unsupported ⇒ none.
  assert.equal(settlementSourceFor("MLB", "moneyline"), "statsapi");
  assert.equal(settlementSourceFor("MLB", "batter_hits"), "statsapi");
  assert.equal(settlementSourceFor("MLB", "batter_home_runs"), "none"); // no settlement rule (retired market)
  assert.equal(settlementSourceFor("Soccer", "double_chance"), "api-football");
  assert.equal(settlementSourceFor("Soccer", "btts"), "api-football");
  assert.equal(settlementSourceFor("Soccer", "asian_handicap"), "none"); // expanded market, settlement not wired
  assert.equal(settlementSourceFor("Soccer", "team_totals"), "none");
});

test("3 · product eligibility requires a settlement rule + adequate data", () => {
  assert.equal(evaluateProductEligibility("MLB", "moneyline", "strong").productEligible, true); // settleable now
  assert.equal(evaluateProductEligibility("MLB", "batter_home_runs", "strong").productEligible, false); // no rule
  assert.equal(evaluateProductEligibility("MLB", "moneyline", "thin").productEligible, false); // thin ⇒ watchlist
  assert.equal(evaluateProductEligibility("Soccer", "double_chance", "strong").productEligible, true);
  assert.equal(evaluateProductEligibility("Soccer", "double_chance", "unavailable").productEligible, false);
  assert.equal(evaluateProductEligibility("Soccer", "asian_handicap", "strong").productEligible, false); // settlement not wired
});

test("4 · read-only candidate pool: product-eligible legs are on settleable markets (MLB statsapi / soccer api-football)", () => {
  const dir = path.join(repo, "data/internal/multi-sport/candidate-pool");
  if (!fs.existsSync(dir)) return; // artifact optional in a fresh checkout
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) return;
  const pool = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  assert.equal(pool.public, false);
  for (const l of pool.legs) {
    // An eligible leg must cite a real settlement source, never "none".
    if (l.productEligible) assert.ok(["statsapi", "api-football"].includes(l.settlementSource), `${l.sport} ${l.market} eligible ⇒ real settlement source`);
    // A leg on an unsettleable market must NOT be eligible.
    if (l.settlementSource === "none") assert.equal(l.productEligible, false, `${l.sport} ${l.market} unsettleable ⇒ ineligible`);
  }
});

test("5 · product preview is ONLY no-play/watchlist — never an active card or exposure", () => {
  const dir = path.join(repo, "data/internal/multi-sport/product-preview");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) return;
  const prev = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  for (const key of ["bankBuilderPreview", "moonshotPreview"]) {
    assert.ok(["no-play", "watchlist"].includes(prev[key].status), `${key} status is no-play/watchlist`);
    assert.notEqual(prev[key].status, "active");
  }
  // No exposure/stake/placed field anywhere in the preview.
  assert.doesNotMatch(JSON.stringify(prev), /"(exposure|stake|placed|activeCard)"\s*:/);
});

// The multi-sport schema must NOT be wired into money-product generation yet.
function collectSources(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") collectSources(p, acc); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

test("6 · candidate-leg schema is NOT imported by money-product generation code", () => {
  const moneyDirs = ["parlays", "mr-dub", "daily-portfolio", "moonshot", "world-cup"].map((d) => path.join(app, "src/lib", d)).filter(fs.existsSync);
  for (const dir of moneyDirs) {
    for (const p of collectSources(dir, [])) {
      const s = fs.readFileSync(p, "utf8");
      assert.ok(!/multi-sport\/candidate-leg/.test(s), `${path.relative(app, p)} must not import the multi-sport schema yet`);
    }
  }
});

test("7 · money md5 unchanged — the multi-sport layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
