// BBM V6 FINAL PACKAGES for the Command Center BBM_CHALLENGE_POST importer (PD 2026-11-04). Reads a FINAL render folder
// (bbm-v6-research.mjs --final 1) and the engine's sealed final file, verifies every byte and binding, and writes one
// package per product: <out>/<packageId>/{1-<lane A>.png, 2-<lane B>.png, caption.txt, manifest.json}. Never the live
// packages folder; fail-closed on any mismatch (status, approval, run-2 payout event, image or caption sha, flags).
//
//   npx tsx scripts/social/rehearsal/bbm-v6-package.mjs --render <final render dir> --source <sealed-final-2105.json> --out <dir>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { LIVE_PACKAGES } from "../render-bbm.mjs";

const a = parseArgs(process.argv.slice(2));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const out = path.resolve(a.out);
if (out === LIVE_PACKAGES || out.startsWith(LIVE_PACKAGES + path.sep)) throw new Error("never the live packages folder");
const render = JSON.parse(fs.readFileSync(path.join(a.render, "manifest.json"), "utf8"));
const srcRaw = fs.readFileSync(a.source);
const src = JSON.parse(srcRaw);
const problems = [];
if (render.status !== "FINAL" || render.final !== true) problems.push(`render status ${render.status}: only a FINAL render is packaged`);
if (render.source?.sha256 !== sha(srcRaw)) problems.push("the render was not made from this source file");
if ((render.checker ?? []).length || (render.layout ?? []).length || (render.diversity?.repeats ?? []).length) problems.push("the render carries checker, layout or diversity problems");
// Founder override 2026-11-04 (odds snapshot): captured odds, may have changed, not a live offer.
const OVERRIDE = { id: "2026-11-04-founder-odds-snapshot-override", commits: ["f529fa44fa", "41c421cf1d"], fetchedWindowUtc: "2026-11-04T21:05Z/2026-11-04T21:07Z" };
const packages = [];
for (const [pkg, lanes] of [["bb", ["bb-a", "bb-b"]], ["ms", ["ms-a", "ms-b"]]]) {
  const rows = lanes.map((l) => render.parityRows.find((r) => r.laneId === l && !r.alternate));
  const media = []; let caption = null;
  for (const [i, r] of rows.entries()) {
    const lane = lanes[i];
    const rec = src.records?.[`${lane}:A`]?.record;
    if (!r || !rec) { problems.push(`${lane}: missing render row or source record`); continue; }
    if (rec.approvalStatus !== "FOUNDER_APPROVED") problems.push(`${lane}: approval ${rec.approvalStatus}`);
    for (const k of ["priceEventSha256", "payoutEventSha256", "cardEventSha256"]) if (!/^[0-9a-f]{64}$/.test(rec[k] ?? "")) problems.push(`${lane}: ${k} is not a run-2 event sha (${rec[k]})`);
    if (r.recordSha256 !== rec.recordSha256 || r.candidateRecordSha256 !== rec.candidateRecordSha256) problems.push(`${lane}: the image was not rendered from this record`);
    if (!r.parity?.ok) problems.push(`${lane}: parity ${r.parity?.mismatches?.join("; ")}`);
    const png = fs.readFileSync(path.join(a.render, "full", `${lane}.png`));
    if (sha(png) !== r.imageSha256) problems.push(`${lane}: image bytes differ from the render manifest`);
    const cap = fs.readFileSync(path.join(a.render, "captions", `${pkg}-2026-11-04.txt`), "utf8");
    if (sha(Buffer.from(cap, "utf8")) !== r.captionSha256) problems.push(`${lane}: caption bytes differ from the render manifest`);
    caption = cap;
    media.push({ order: i + 1, laneId: lane, laneType: lane.endsWith("-a") ? "NBA_MONEYLINE" : "NBA_PLAYER_PROPS", file: `${i + 1}-${lane}.png`, sha256: r.imageSha256, width: 1080, height: 1350, png,
      lane: { recordSha256: rec.recordSha256, candidateRecordSha256: rec.candidateRecordSha256, approvalStatus: rec.approvalStatus, approvalRef: rec.approvalRef ?? null, priceEventSha256: rec.priceEventSha256, payoutEventSha256: rec.payoutEventSha256, cardEventSha256: rec.cardEventSha256, run2HeadSha256: rec.run2HeadSha256 ?? null,
        stakeCents: rec.money.stakeCents, grossPayoutCents: rec.money.grossPayoutCents, profitCents: rec.money.profitCents, combinedAmerican: rec.combined.american, legs: r.legs } });
  }
  packages.push({ packageId: `${pkg}-2026-11-04`, product: pkg === "bb" ? "bank-builder" : "moonshot", media, caption });
}
if (problems.length) throw new Error(`packaging refused:\n  ${problems.join("\n  ")}`);
for (const p of packages) {
  const dir = path.join(out, p.packageId);
  fs.mkdirSync(dir, { recursive: true });
  for (const m of p.media) fs.writeFileSync(path.join(dir, m.file), m.png);
  fs.writeFileSync(path.join(dir, "caption.txt"), p.caption);
  const manifest = {
    schema: "gtp.bbm-challenge-post@1", kind: "BBM_CHALLENGE_POST", status: "FINAL", packageId: p.packageId, product: p.product, date: "2026-11-04",
    media: p.media.map(({ png: _png, ...m }) => m),
    caption: { text: p.caption, sha256: sha(Buffer.from(p.caption, "utf8")) },
    source: { file: path.basename(a.source), sha256: sha(srcRaw), engine: src.engine ?? null },
    render: { graphicVersion: render.parityRows[0].graphicVersion, designVersion: render.parityRows[0].designVersion, renderedAt: render.renderedAt, manifestSha256: sha(fs.readFileSync(path.join(a.render, "manifest.json"))) },
    oddsSnapshotOverride: OVERRIDE, flags: { template: false, preliminary: false, superseded: false, testData: false },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${p.packageId}: ${p.media.map((m) => `${m.file} ${m.sha256.slice(0, 16)}`).join(", ")} caption ${manifest.caption.sha256.slice(0, 16)}`);
}
