/**
 * QUALIFIED-LEG SURFACE ADOPTION (Program 202 · Release B).
 *
 * One qualification, two consumers. The builder's pool arrives through the methodology engine
 * (the generation-time qualifier); Market Center displays the snapshot owner and the ranked
 * owner. Neither may redefine qualification — and both must satisfy the SAME published-leg
 * contract: settlement identity on every offerable leg, three-state probability, never a
 * zero-fill.
 *
 * ── The B6 statement of record ──────────────────────────────────────────────────────────────────
 * Market Center's rows and Build's pool are DIFFERENT POPULATIONS by design — the snapshot shows
 * every posted market labelled by display-eligibility; the builder offers the engine's
 * leakage-validated legs; the ranked list shows the model's strongest reads. The documented
 * equivalence is at the CONTRACT level: everything either surface offers as selectable/rankable
 * adapts into the one qualified-leg contract with zero refusals. Composition differs;
 * qualification cannot.
 *
 * Run: npx tsx --test src/lib/product-day/qualified-leg-surfaces.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { adaptBuildLeg } from "./qualified-leg.ts";
import { buildEngineLegs } from "../build-legs.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";
import { loadTopReads } from "../top-reads.ts";

const app = process.cwd();

test("every leg the builder OFFERS satisfies the contract — zero refusals on the live pool", () => {
  const slate = loadTodaySlate();
  const pool = buildEngineLegs(slate.eligibleLegs, slate.date || null);
  const refusals = [];
  for (const leg of pool) {
    const res = adaptBuildLeg(leg, { productDate: slate.date ?? "unknown" });
    if (!res.ok) refusals.push(`${leg.id}: ${res.refusal.code} — ${res.refusal.detail}`);
    else {
      assert.ok(res.leg.settlementId, `${leg.id}: settlement identity`);
      const mp = res.leg.modelProbability;
      if (typeof mp === "number") assert.ok(mp > 0 && mp < 1, `${leg.id}: a numeric probability is a real probability`);
      else assert.ok(mp.absent.length > 10, `${leg.id}: absence carries its reason`);
    }
  }
  assert.deepEqual(refusals, [], `the builder offered unqualifiable legs:\n  ${refusals.join("\n  ")}`);
});

test("Market Center's ranked rows carry real probabilities — the ranked owner never zero-fills", () => {
  const set = loadTopReads();
  for (const r of set?.reads ?? []) {
    assert.ok(typeof r.probability === "number" && r.probability > 0 && r.probability < 1,
      `${r.subject}: a ranked read IS a model probability — zero or missing cannot rank`);
  }
});

test("B4 · no probability zero-fill anywhere in source: absence stays typed", () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || e.name.endsWith(".test.mjs")) continue;
      const src = fs.readFileSync(p, "utf8");
      /*
       * Targeted: a probability-named identifier coalesced/defaulted to 0 converts a typed
       * absence into a numeric CLAIM. Exempt: sort comparators — flooring nullables for a stable
       * ORDER renders nothing and claims nothing (the hazard is display/propagation, and the
       * charter says target the architectural hazard, not every string).
       */
      const isRenderLayer = /src\/(components|app)\//.test(p.replace(/\\/g, "/"));
      for (const line of src.split("\n")) {
        if (/\.sort\(/.test(line)) continue;
        /*
         * Scope: the RENDER layer may never coalesce a probability to 0 (every hit there is a
         * claim). In libs, numeric floors are legal semantics (a filter where absence
         * disqualifies; a score where absence contributes nothing) — but a template literal is
         * user copy wherever it lives, so lib lines are flagged only when they build one.
         */
        if (!isRenderLayer && !line.includes("`")) continue;
        for (const m of line.matchAll(/[a-zA-Z]*[Pp]robability\w*\s*(?:\?\?|\|\|)\s*0(?![.\d])/g)) {
          offenders.push(`${path.relative(app, p)}: ${m[0]}`);
        }
      }
    }
  };
  walk(path.join(app, "src"));
  assert.deepEqual(offenders, [], `probability zero-fills found:\n  ${offenders.join("\n  ")}`);
});

test("the consumers adapt from the one owner — no second qualification module", () => {
  // P208: the builder is the Parlay Center's Build Your Own mode at /build/custom.
  const build = fs.readFileSync(path.join(app, "src/app/build/custom/page.tsx"), "utf8");
  const markets = fs.readFileSync(path.join(app, "src/app/markets/page.tsx"), "utf8");
  assert.match(build, /buildEngineLegs/, "the builder's pool comes through the canonical engine");
  assert.match(markets, /buildTop10Board/, "Market Center ranks through the canonical board");
  // Neither page implements eligibility of its own: no leakage / started / qualification logic
  // in the page bodies — those words belong to the owners.
  for (const [name, src] of [["build", build], ["markets", markets]]) {
    assert.ok(!/function\s+\w*(qualif|eligib)\w*\s*\(/i.test(src), `${name}: no page-local qualification implementation`);
  }
});
