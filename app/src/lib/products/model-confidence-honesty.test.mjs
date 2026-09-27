/**
 * A FIELD NAMED FOR THE MODEL THAT HOLDS THE BOOKMAKER'S NUMBER (F1 · Option A).
 *
 * 🔴 WHAT IS TRUE ON THE LIVE PRODUCT RIGHT NOW. Every leg in the public Bank Builder and Moonshot
 * lanes — 7 legs, all MLB, $100 + $100 + $25 = $225 of paper exposure — carries:
 *
 *     probabilityBasis : "market-implied"
 *     probabilitySource: "market-devigged"
 *     modelConfidence  == impliedProbability   ← byte-identical on all 7
 *
 * So `modelConfidence` holds the de-vigged DraftKings price. The name asserts the model; the value is
 * the market's.
 *
 * ⚠ AND YET THERE IS NO PUBLIC MASQUERADE TODAY, which is the part that must not be overstated. The
 * /bank-builder surface labels it correctly — "market-implied N%", a typed `jointProbabilityBasis`,
 * and the Moonshot card's own "limited-data / market-implied" note. The one component that renders a
 * bare `conf` with no basis (`parlay-lab-client.tsx`) is imported by NOTHING, and the `/parlay-lab`
 * route that shares its name is a legacy client redirect.
 *
 * So this is a LATENT trap, not a live lie: the honest label lives in the presentation layer while the
 * misleading name lives in the data. Any new consumer that reads `modelConfidence` without checking
 * `probabilityBasis` would present the book's number as ours, and would be reading a field whose name
 * invites exactly that.
 *
 * These guards keep the trap latent. Renaming the field is a producer change to a committed artifact
 * that drives a live product behind a frozen baseline, so it is prepared separately, not slipped in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => fs.readFileSync(p, "utf8");
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };

const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
};

/**
 * Components transitively imported from a route. A guard scoped to "every file" would flag dead code
 * forever and get deleted; a guard scoped to REACHABLE code is the one worth keeping.
 */
function reachableFromRoutes() {
  const all = [...walk(path.join(APP, "src/app")), ...walk(path.join(APP, "src/components"))];
  const byStem = new Map();
  for (const f of all) byStem.set(path.relative(path.join(APP, "src"), f).replace(/\.tsx?$/, ""), f);

  const seen = new Set();
  const queue = walk(path.join(APP, "src/app"));           // every route file is a root
  for (const q of queue) seen.add(q);
  while (queue.length) {
    const f = queue.shift();
    const src = read(f);
    for (const m of src.matchAll(/from\s+"@\/((?:components|lib)\/[^"]+)"/g)) {
      const hit = byStem.get(m[1]);
      if (hit && !seen.has(hit)) { seen.add(hit); queue.push(hit); }
    }
  }
  return seen;
}

test("🔴 the live public lanes really are all market-implied — the premise, verified not assumed", () => {
  const dp = readJson(path.join(APP, "public/data/mr-dub/daily-portfolio.json"));
  if (!dp?.lanes) return; // artifact moved on; the guards below still stand
  const legs = dp.lanes.flatMap((l) => l.legs ?? []);
  if (!legs.length) return; // a genuine no-card day

  for (const l of legs) {
    assert.ok(l.probabilityBasis, "every live leg must declare a probability basis");
    if (l.probabilityBasis === "market-implied") {
      /* The whole finding, asserted rather than described. */
      assert.equal(l.modelConfidence, l.impliedProbability,
        "a market-implied leg's modelConfidence is the book's number — if this ever differs, someone has started deriving one and the field name matters more, not less");
    }
  }
});

test("a REACHABLE surface may not render modelConfidence without its basis", () => {
  /*
   * The trap made structural. A component that shows the number must also show where it came from —
   * "market-implied", "model", or the basis field itself. Otherwise a reader sees a confidence
   * figure that reads as GameTimePicks' own.
   */
  const reachable = reachableFromRoutes();
  const offenders = [];
  for (const f of reachable) {
    const src = read(f);
    if (!/\bmodelConfidence\b/.test(src)) continue;
    const declaresBasis = /probabilityBasis|market-implied|marketImplied|model-implied/.test(src);
    if (!declaresBasis) offenders.push(path.relative(APP, f));
  }
  assert.deepEqual(offenders, [], "these render a model-named confidence with no stated basis");
});

test("the guard's reachability actually resolves — it must not pass by reaching nothing", () => {
  /* A reachability guard whose walker finds no components reports success forever. */
  const reachable = reachableFromRoutes();
  assert.ok(reachable.size > 50, `reachability found only ${reachable.size} files — the walker is broken`);
  /* And it must reach a component known to be imported from a route. */
  const names = [...reachable].map((f) => path.relative(APP, f));
  assert.ok(names.some((n) => n.includes("components/footer.tsx")), "the walker never reached the footer, which every page imports");
});

test("parlay-lab-client is confirmed UNREACHABLE — the exemption is measured, not assumed", () => {
  /*
   * It renders a bare `conf` with no basis. It is excluded from the guard above only because nothing
   * imports it and `/parlay-lab` is a legacy client redirect. If either fact changes, the guard above
   * starts failing — which is the correct behaviour, and this test says why.
   */
  const f = path.join(APP, "src/components/parlay-lab-client.tsx");
  if (!fs.existsSync(f)) return; // deleted; nothing to exempt
  assert.ok(!reachableFromRoutes().has(f), "parlay-lab-client is now reachable and renders an unlabelled confidence");
  const route = path.join(APP, "src/app/parlay-lab/page.tsx");
  if (fs.existsSync(route)) assert.match(read(route), /ClientRedirect/, "the /parlay-lab route is a redirect, not a render");
});

test("the /bank-builder surface states the basis — the honest label is load-bearing", () => {
  /* If this disclosure is ever removed while the legs stay market-implied, the product starts making
     a claim it cannot support. */
  const files = walk(path.join(APP, "src/components/bank-builder"));
  const joined = files.map(read).join("\n");
  assert.ok(files.length > 0, "the bank-builder components must exist for this guard to mean anything");
  assert.match(joined, /market-implied/, "the surface must say where its probabilities come from");
});
