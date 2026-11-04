// BBM V6 REAL SAMPLES (PD 2026-11-04): the engine's own Nov 4 Bank Builder cards (real legs, VERIFIED prices, superseded,
// never posted) and Moonshot HELD built as engine event logs (STATUS NO_ELIGIBLE_CARD with a reason) because the real
// Nov 4 Moonshot cards carry 5 legs and rules v2 refuse them. Writes to --out: full/, mobile/ (400 px), compare/
// (beside the reference), and manifest.json (one parity-gate row per image, with PNG hashes; never a package).
//
//   GTP_DATA_COMMIT=<main sha with the lane> npx tsx scripts/social/rehearsal/bbm-v6-real.mjs --lanes <dir> \
//       --private-root <dir> --suggested-cards <file> --roster <roster.json> --as-of <ISO> --reference <png> --out <dir>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { parseArgs } from "../render-social-pack.mjs";
import { packageCaption, parityGateRow, prepareLane, rendererCommit, slateReader } from "../render-bbm.mjs";
import { bbmV6LayoutErrors, verifyBbmCardV6 } from "../bbm-cards-v6.mjs";
import { parseEvents } from "../../../src/lib/challenge-lanes/chain.mjs";
import { append } from "../../../src/lib/challenge-lanes/lanes.mjs";
import { laneProjection } from "../../../src/lib/challenge-lanes/projection.mjs";
import { readLaneProjection } from "../../../src/lib/challenge-lanes/public-reader.mjs";
import { currentRun } from "../../../src/lib/challenge-lanes/store.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
const D = file.productDay;
const slate = slateReader([file]);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
// The engine's held wording (betting-engine, 2026-11-04): STATUS NO_ELIGIBLE_CARD, code NO_QUALIFIED_CARD, reason shown verbatim.
const HELD_REASON = "No qualified card: no candidate passed every gate (hit-rate evidence, lineup sensitivity, or a payout outside the ±10% step band).";

const prepared = [];
for (const id of ["bb-a", "bb-b"]) {
  const r = readLaneProjection({ laneId: id, dir: a.lanes });
  prepared.push({ test: false, p: prepareLane({ doc: r.doc, date: D, slate, roster, asOf: a["as-of"], privateEvents: currentRun(a["private-root"], id).events, design: "v6" }) });
}
for (const id of ["ms-a", "ms-b"]) {
  const first = parseEvents(fs.readFileSync(path.join(a["private-root"], id, "run-1.jsonl"), "utf8"))[0];
  const events = append([first], { type: "STATUS", date: D, step: 1, at: `${D}T16:00:00Z`, source: "TEST", status: "NO_ELIGIBLE_CARD", code: "NO_QUALIFIED_CARD", reason: HELD_REASON });
  prepared.push({ test: true, p: prepareLane({ doc: laneProjection(id, [events]), date: D, slate, roster, asOf: a["as-of"], testData: true, design: "v6" }) });
}
const refused = prepared.filter((x) => x.p.refused).map((x) => `${x.p.laneId}: ${x.p.refused}`);
if (refused.length) throw new Error(`refused:\n  ${refused.join("\n  ")}`);
const bad = prepared.flatMap((x) => verifyBbmCardV6(x.p.card).map((e) => `${x.p.laneId}: ${e}`));

const require = createRequire(path.resolve("package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch();
const layout = await bbmV6LayoutErrors(browser, prepared.map((x) => x.p.card));
const full = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const mobile = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 400 / 1080 });
const rows = []; const images = {};
try {
  for (const dir of ["full", "mobile", "compare"]) fs.mkdirSync(path.join(out, dir), { recursive: true });
  for (const [product, ids] of [["bank-builder", ["bb-a", "bb-b"]], ["moonshot", ["ms-a", "ms-b"]]]) {
    const lanes = ids.map((id) => prepared.find((x) => x.p.laneId === id));
    const caption = packageCaption(product, lanes.map((x) => x.p), D);
    for (const [i, x] of lanes.entries()) {
      const shots = {};
      for (const [pg, dir, suffix] of [[full, "full", ""], [mobile, "mobile", "-400w"]]) {
        await pg.setContent(x.p.card.html, { waitUntil: "load" });
        await pg.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
        const b = await pg.screenshot({ type: "png" });
        const f = `${dir}/${x.p.laneId}${suffix}.png`;
        fs.writeFileSync(path.join(out, f), b);
        shots[dir] = { file: f, sha256: sha(b), bytes: b.length };
      }
      images[x.p.laneId] = shots;
      rows.push({ ...parityGateRow(x.p, { packageId: `${product === "moonshot" ? "ms" : "bb"}-${D}`, date: D, mediaIndex: i + 1, imageSha256: shots.full.sha256, caption, commit: rendererCommit() }), mobile: shots.mobile, testData: x.test, parityWithEngine: { ok: x.p.parity.ok, mismatches: x.p.parity.mismatches } });
    }
  }
  if (a.reference) {
    const ref = `data:image/png;base64,${fs.readFileSync(a.reference).toString("base64")}`;
    const cmp = await browser.newPage({ viewport: { width: 1640, height: 1070 } });
    for (const [id, left] of [["bb-a", 0], ["ms-a", -768]]) {
      const ours = `data:image/png;base64,${fs.readFileSync(path.join(out, "full", `${id}.png`)).toString("base64")}`;
      await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:20px;padding:10px;font:600 18px sans-serif;color:#ddd"><div><div style="width:768px;height:1024px;overflow:hidden;position:relative"><img src="${ref}" style="height:1024px;position:absolute;left:${left}px"></div>reference</div><div><img src="${ours}" style="height:1024px;display:block">V6 ${id}</div></body>`, { waitUntil: "load" });
      fs.writeFileSync(path.join(out, "compare", `${id}-reference-vs-v6.png`), await cmp.screenshot({ type: "png" }));
    }
  }
} finally { await browser.close(); }
const manifest = { schema: "gtp.bbm-v6-samples@1", date: D, note: "Samples only, never a package. Bank Builder: the engine's real Nov 4 cards (superseded by rules v2, do not post). Moonshot: HELD built as engine event logs (TEST).", rendererCommit: rendererCommit(), checker: bad, layout, parityRows: rows };
fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`checker problems: ${bad.length}${bad.length ? `\n  ${bad.join("\n  ")}` : ""}`);
console.log(`layout problems: ${layout.length}${layout.length ? `\n  ${layout.join("\n  ")}` : ""}`);
for (const r of rows) console.log(`${r.laneId} ${r.view} ${r.classification} legs=${r.legs.length} parity=${r.parityWithEngine.ok} full=${images[r.laneId].full.sha256.slice(0, 12)} 400w=${images[r.laneId].mobile.sha256.slice(0, 12)}`);
