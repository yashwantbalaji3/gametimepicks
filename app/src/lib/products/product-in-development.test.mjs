/**
 * A NAMED-BUT-UNBUILT PRODUCT MUST NOT DRIFT INTO LOOKING BUILT.
 *
 * Goal Rush and Bucket Blitz now have destinations. That is the risk these guard: a page under a
 * good name is exactly where a placeholder quietly becomes a promise — first a sample number "for
 * layout", then a projection, then a pick, each step small and none of them backed by a validated
 * model. The site has already rejected four models for failing a preregistered bar; shipping an
 * unvalidated read behind a nice name would undo that.
 *
 * So: the state must be DERIVED from the gate, the page must state no probability, and the two must
 * agree. The state check reads the assessment rather than the string, so the day the stages go green
 * the product is required to change rather than allowed to.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
/* Comments explain what a page REFUSES to do, in the same words the refusal is about. Scanning them
   as if they were rendered output is the denial trap — strip them first. (Sixth time.) */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const UNBUILT = [
  { sport: "soccer", name: "Goal Rush", route: "src/app/goal-rush/page.tsx" },
  { sport: "nba", name: "Bucket Blitz", route: "src/app/bucket-blitz/page.tsx" },
];

test("an unbuilt product's coming-soon state is backed by unmet gate stages", async () => {
  const { productReadiness } = await import("./product-readiness.ts");
  const { gateKeyFor, signatureFor } = await import("./signature-products.ts");

  for (const u of UNBUILT) {
    const product = signatureFor(u.sport);
    assert.ok(product, `${u.name} is missing from the registry`);
    const r = productReadiness(gateKeyFor(product), path.join(APP, "public", "data"));

    // The gate key must actually resolve. Looking a product up under a key the assessment does not
    // have returns no stages at all, and "no stages" reads as "nothing proven" — a wrong key would
    // therefore look exactly like an honest early-stage product.
    assert.equal(r.met.length + r.missing.length, 10,
      `${u.name} resolves no gate stages under "${gateKeyFor(product)}" — the key does not exist in the assessment`);

    if (product.state === "coming-soon") {
      assert.ok(!r.buildable,
        `${u.name} is marked coming-soon but every required stage is proven — either build it or correct the gate`);
      assert.ok(r.missing.length > 0, `${u.name} claims to be unbuilt with nothing outstanding`);
    } else {
      // The other direction matters just as much: a product may not be promoted to live while the
      // gate still has holes in it.
      assert.ok(r.buildable,
        `${u.name} is marked ${product.state} while ${r.missing.map((m) => m.id).join(", ")} are unproven`);
    }
  }
});

test("an unbuilt product's page states no probability, projection or pick", () => {
  const shared = stripComments(read("src/components/products/product-in-development.tsx"));
  const sources = [shared, ...UNBUILT.map((u) => stripComments(read(u.route)))];

  for (const src of sources) {
    // A percentage or a decimal probability rendered from data is the thing that must not appear.
    assert.doesNotMatch(src, /\{[^}]*\btoFixed\(/, "a formatted number is being rendered — this page has no model to render one from");
    assert.doesNotMatch(src, /\b(probability|impliedProb|winProb|projection|projected|prediction)\b/i,
      "prediction vocabulary on a page with no validated model");
    for (const banned of [/\bbest bet\b/i, /\block\b/i, /\bedge\b/i, /\bguarantee/i, /\bsure thing\b/i]) {
      assert.doesNotMatch(src, banned, `promotional language on an unbuilt product: ${banned}`);
    }
  }
});

test("the page's stage list is read from the gate, never hand-typed", () => {
  const src = read("src/lib/products/product-readiness.ts");
  assert.match(src, /from "@\/lib\/sports\/sport-gate\.mjs"/, "stage definitions must come from the gate");
  assert.match(src, /from "@\/lib\/sports\/sport-assessments\.mjs"/, "statuses must come from the committed assessment");

  // Every required stage must be a real gate stage — a typo would silently drop a requirement,
  // making the product look closer to ready than it is.
  const gate = read("src/lib/sports/sport-gate.mjs");
  const required = /const REQUIRED_STAGES = \[([^\]]+)\]/.exec(src)?.[1] ?? "";
  const ids = [...required.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, "the required-stage list looks truncated");
  for (const id of ids) {
    assert.match(gate, new RegExp(`id: "${id}"`), `"${id}" is required but is not a stage in the gate`);
  }
});

test("calibration can never be dropped from what a signature product requires", () => {
  // The one stage that must not become negotiable. Every rejected model on this site was rejected
  // at this stage; a product that skips it is the exact failure the rejections exist to prevent.
  const src = read("src/lib/products/product-readiness.ts");
  const required = /const REQUIRED_STAGES = \[([^\]]+)\]/.exec(src)?.[1] ?? "";
  assert.match(required, /"calibration"/, "a signature product must require calibration");
  assert.match(required, /"settlement"/, "a product that cannot be settled cannot be graded");
});

test("the band keeps a coming-soon card visually distinct from a live one", () => {
  const src = stripComments(read("src/components/products/signature-products-band.tsx"));
  // Linking an unbuilt product is fine; presenting it as enterable is not.
  assert.match(src, /border: live \? "1px solid var\(--vault-border\)" : "1px dashed var\(--vault-rule\)"/,
    "the dashed border is what tells a reader the card is not a product");
  assert.match(src, /Coming soon/, "the coming-soon badge must survive");
  assert.match(src, /live \?[\s\S]{0,400}Open →/, "only a live card may say Open");
});

test("PRODUCTION TRUTH · the built pages carry no percentage", () => {
  for (const u of UNBUILT) {
    const out = path.join(APP, "out", u.route.replace("src/app/", "").replace("/page.tsx", ""), "index.html");
    if (!fs.existsSync(out)) continue; // no build in this run
    const html = fs.readFileSync(out, "utf8");
    const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
    // The rendered page must not show a percentage anywhere: there is nothing it could honestly be.
    const pct = body.match(/>[^<]*?\d+(\.\d+)?%/g);
    assert.equal(pct, null, `${u.name} renders a percentage: ${pct?.slice(0, 3).join(" / ")}`);
    assert.match(body, /no picks on this page/i, `${u.name} must say plainly that it has no picks`);
  }
});
