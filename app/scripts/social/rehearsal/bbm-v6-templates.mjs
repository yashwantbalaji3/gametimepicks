// BBM V6 TEMPLATE PREVIEWS (founder acceptance target: the 2026-11-04 reference composition). Every image is a TEMPLATE
// (ribboned, never priced, never VERIFIED, never a package) except the sample-priced variants, which carry the SAMPLE
// PRICE ribbon and fixture prices that are never packaged. Writes to --out:
//   previews/   bb-a, bb-b, ms-a, ms-b at step 1 with both placeholder slots
//   variants/   1-leg and 2-leg moneyline layouts per product (real Nov 4 teams and model %, no prices), prop layouts
//               (Level A model value, Level B research; sample player and evidence), and a sample-priced layout per product
//   matrix/     every ladder state per product: step 1 active, step 3 active, step 2 won, lost at step 2, held (no card),
//               held (card awaiting prices), completed, finished short
// Plus mobile/ copies at 400 px wide and compare/ (the reference beside each V6 preview; --reference <png>).
//
//   GTP_DATA_COMMIT=<main sha with the lane> npx tsx scripts/social/rehearsal/bbm-v6-templates.mjs --lanes <dir> \
//       --private-root <dir> --suggested-cards <file> --roster <roster.json> --as-of <ISO> --reference <png> --out <dir outside the repo>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { parseArgs } from "../render-social-pack.mjs";
import { prepareLane, slateReader } from "../render-bbm.mjs";
import { RULES_V2, bbmCardV6, bbmV6LayoutErrors, verifyBbmCardV6 } from "../bbm-cards-v6.mjs";
import { BADGE, RUNG, VIEW } from "../../../src/lib/social/bbm-lane.mjs";
import { readLaneProjection } from "../../../src/lib/challenge-lanes/public-reader.mjs";
import { currentRun } from "../../../src/lib/challenge-lanes/store.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const D = "2026-11-04";
const TERMS = { "bank-builder": { baseCents: 10000, targetCents: 1000000 }, moonshot: { baseCents: 2500, targetCents: 100000 } };
const ms = RULES_V2.milestonesCents;
/** Ladder rungs for a template: `won` steps completed, then the step in `state`. */
const rungsOf = (product, won, at, atState) => ms[product].map((m, i) => ({ step: i + 1, milestoneCents: m, state: i < won ? RUNG.COMPLETED : i + 1 === at ? atState : RUNG.UPCOMING }));
const model = (product, letter, o) => ({ product, letter, laneId: `${product === "moonshot" ? "ms" : "bb"}-${letter.toLowerCase()}`, date: D, steps: 5, ...TERMS[product], template: true, payout: null, ...o });
const PH = [{ placeholder: "required" }, { placeholder: "optional" }];

// Real Nov 4 legs (names, sides, model %) through the normal path, for the 1-leg and 2-leg variants. No prices are used.
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const slate = slateReader([file]);
const legsOf = (laneId) => {
  const r = readLaneProjection({ laneId, dir: a.lanes });
  const p = prepareLane({ doc: r.doc, date: D, slate, roster: JSON.parse(fs.readFileSync(a.roster, "utf8")), asOf: a["as-of"], privateEvents: currentRun(a["private-root"], laneId).events, design: "v3" });
  if (p.refused) throw new Error(`${laneId}: ${p.refused}`);
  return p.combo.legs;
};
const bbLegs = legsOf("bb-a"); const msLegs = legsOf("ms-a").slice(0, 2);

const items = [];
const add = (dir, name, m) => items.push({ dir, name, m });
for (const [product, ids] of [["bank-builder", ["A", "B"]], ["moonshot", ["A", "B"]]]) for (const L of ids) {
  const base = TERMS[product].baseCents;
  add("previews", `${product === "moonshot" ? "ms" : "bb"}-${L.toLowerCase()}-step1-template`, model(product, L, { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: PH }));
}
for (const [product, legs, tag] of [["bank-builder", bbLegs, "bb"], ["moonshot", msLegs, "ms"]]) {
  const base = TERMS[product].baseCents;
  add("variants", `${tag}-1-leg`, model(product, "A", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: legs.slice(0, 1) }));
  add("variants", `${tag}-2-leg`, model(product, "A", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: legs.slice(0, 2) }));
  // Props: a sample player (no real name carries invented evidence); the team and tip come from a real leg.
  const prop = (l, level) => ({ kind: "PROP", legId: `${l.legId}-prop`, player: { name: "Sample Player" }, team: l.team, opponent: l.opponent, home: l.home, tipUtc: l.tipUtc, lineText: "Over 24.5 pts", level, evidence: { l10: "8/10", l20: "14/20" }, ...(level === "A" ? { projectionText: "61%" } : {}) });
  add("variants", `${tag}-prop-level-a`, model(product, "A", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: [prop(legs[0], "A"), legs[1]] }));
  add("variants", `${tag}-prop-level-b`, model(product, "B", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: [prop(legs[0], "B")] }));
  // Sample prices (fixture, SAMPLE PRICE ribbon): shows the payout hierarchy. Never a package, never VERIFIED.
  const two = legs.slice(0, 2);
  const px = { [two[0].legId]: { price: -150, oddsFormat: "american" }, [two[1].legId]: { price: 120, oddsFormat: "american" } };
  add("variants", `${tag}-2-leg-sample-priced`, model(product, "A", { template: false, step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: two, payout: { fixture: true, preliminary: false, combinedAmerican: 267, grossCents: Math.round(base * 3.667), profitCents: Math.round(base * 2.667), legs: px } }));
  const m = ms[product];
  const res = (outs) => legs.slice(0, 2).map((l, i) => ({ legId: l.legId, outcome: outs[i] }));
  add("matrix", `${tag}-step1-active`, model(product, "A", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.ACTIVE, view: VIEW.CARD, legs: PH }));
  add("matrix", `${tag}-step3-active`, model(product, "A", { step: 3, rungs: rungsOf(product, 2, 3, RUNG.ACTIVE), bankrollCents: m[1], badge: BADGE.ACTIVE, view: VIEW.CARD, legs: PH }));
  add("matrix", `${tag}-step2-won`, model(product, "A", { step: 2, rungs: rungsOf(product, 2, 0, null), bankrollCents: m[1], badge: BADGE.WON, view: VIEW.WON, legs: legs.slice(0, 2), legResults: res(["WIN", "WIN"]) }));
  add("matrix", `${tag}-lost-step2`, model(product, "A", { step: 2, rungs: rungsOf(product, 1, 2, RUNG.FAILED), bankrollCents: m[0], badge: BADGE.LOST, view: VIEW.BUSTED, legs: legs.slice(0, 2), legResults: res(["WIN", "LOSS"]) }));
  add("matrix", `${tag}-held-no-card`, model(product, "A", { step: 2, rungs: rungsOf(product, 1, 2, RUNG.ACTIVE), bankrollCents: m[0], badge: BADGE.HELD, view: VIEW.NO_ELIGIBLE_CARD, legs: [] }));
  add("matrix", `${tag}-held-awaiting-prices`, model(product, "A", { step: 1, rungs: rungsOf(product, 0, 1, RUNG.ACTIVE), bankrollCents: base, badge: BADGE.HELD, view: VIEW.CARD, legs: legs.slice(0, 2) }));
  add("matrix", `${tag}-completed`, model(product, "A", { step: 5, rungs: rungsOf(product, 5, 0, null), bankrollCents: TERMS[product].targetCents + base * 5, badge: BADGE.COMPLETED, view: VIEW.COMPLETE, legs: [] }));
  add("matrix", `${tag}-finished-short`, model(product, "A", { step: 5, rungs: rungsOf(product, 5, 0, null), bankrollCents: Math.round(TERMS[product].targetCents * 0.8), badge: BADGE.FINISHED_SHORT, view: VIEW.FINISHED_SHORT, legs: [] }));
}

const cards = items.map((it) => ({ ...it, card: { ...bbmCardV6(it.m), name: it.name } }));
const bad = cards.flatMap((c) => verifyBbmCardV6(c.card).map((e) => `${c.name}: ${e}`));
const require = createRequire(path.resolve("package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch();
const layout = await bbmV6LayoutErrors(browser, cards.map((c) => c.card));
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const mobile = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 400 / 1080 });
try {
  for (const c of cards) {
    for (const [p, dir] of [[page, c.dir], [mobile, "mobile"]]) {
      await p.setContent(c.card.html, { waitUntil: "load" });
      await p.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
      fs.mkdirSync(path.join(out, dir), { recursive: true });
      fs.writeFileSync(path.join(out, dir, `${c.name}${dir === "mobile" ? "-400w" : ""}.png`), await p.screenshot({ type: "png" }));
    }
  }
  if (a.reference) {
    // The reference (Bank Builder left half, Moonshot right half) beside the matching V6 preview, same height.
    const ref = `data:image/png;base64,${fs.readFileSync(a.reference).toString("base64")}`;
    fs.mkdirSync(path.join(out, "compare"), { recursive: true });
    const cmp = await browser.newPage({ viewport: { width: 1640, height: 1070 } });
    for (const [tag, left] of [["bb", 0], ["ms", -768]]) {
      const ours = `data:image/png;base64,${fs.readFileSync(path.join(out, "previews", `${tag}-a-step1-template.png`)).toString("base64")}`;
      await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:20px;padding:10px;font:600 18px sans-serif;color:#ddd"><div><div style="width:768px;height:1024px;overflow:hidden;position:relative"><img src="${ref}" style="height:1024px;position:absolute;left:${left}px"></div>reference</div><div><img src="${ours}" style="height:1024px;display:block">V6</div></body>`, { waitUntil: "load" });
      fs.writeFileSync(path.join(out, "compare", `${tag}-reference-vs-v6.png`), await cmp.screenshot({ type: "png" }));
    }
  }
} finally { await browser.close(); }
const report = { checker: bad, layout, images: cards.map((c) => `${c.dir}/${c.name}.png`) };
fs.writeFileSync(path.join(out, "templates-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`checker problems: ${bad.length}${bad.length ? `\n  ${bad.join("\n  ")}` : ""}`);
console.log(`layout problems: ${layout.length}${layout.length ? `\n  ${layout.join("\n  ")}` : ""}`);
console.log(`${cards.length} templates → ${out}`);
