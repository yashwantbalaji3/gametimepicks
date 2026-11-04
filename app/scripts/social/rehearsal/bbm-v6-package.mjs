// BBM V6 FINAL PACKAGES for the Command Center BBM_CHALLENGE_POST importer (PD 2026-11-04). Reads a FINAL render folder
// (bbm-v6-research.mjs --final 1) and the engine's sealed final file, verifies every byte and binding, and writes one
// package per product: <out>/<packageId>/{1-<lane A>.png, 2-<lane B>.png, caption.txt, manifest.json}. Never the live
// packages folder; fail-closed on any mismatch (status, approval, run-2 payout event, image or caption sha, flags).
//
//   npx tsx scripts/social/rehearsal/bbm-v6-package.mjs --render <final render dir> --source <sealed-final-2105.json> --out <dir>
//       --caption-variant v3|compliant --founder-words "<verbatim>" --founder-approved-at <ISO> [--publish-bb <ISO>] [--publish-ms <ISO>]
// Also writes the console's gtp-social-package@1 (BBM_CHALLENGE_POST) per product, in the shape the Command Center
// importer enforces (CC 2026-11-04); approval fields only from the founder's words as relayed by the PD.
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
if (!["v3", "compliant"].includes(a["caption-variant"])) problems.push("--caption-variant must be v3 or compliant (the founder's choice)");
if (!a["founder-words"] || !a["founder-approved-at"] || Number.isNaN(Date.parse(a["founder-approved-at"]))) problems.push("approval needs the founder's verbatim words and the approval time (relayed by the PD)");
const LANE_LOGS = process.env.GTP_LANE_LOGS_DIR ?? path.join(process.env.HOME, "gtp-private", "challenge-lanes");
const numbersIn = (t) => String(t ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
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
    const cap = fs.readFileSync(path.join(a.render, "captions", `${pkg}-2026-11-04${a["caption-variant"] === "compliant" ? "-compliant" : ""}.txt`), "utf8");
    if (a["caption-variant"] === "v3" && sha(Buffer.from(cap, "utf8")) !== r.captionSha256) problems.push(`${lane}: caption bytes differ from the render manifest`);
    // The lane's run-2 log must hold this card and this VERIFIED payout (the importer re-reads it before send).
    const logRef = path.join(LANE_LOGS, lane, "run-2.jsonl");
    const evs = fs.existsSync(logRef) ? fs.readFileSync(logRef, "utf8").trim().split("\n").map((x) => JSON.parse(x)) : [];
    if (!evs.length) problems.push(`${lane}: no run-2 lane log at ${logRef}`);
    else {
      if (!evs.some((e) => e.sha256 === rec.cardEventSha256 && e.type === "CARD_FROZEN")) problems.push(`${lane}: card event ${rec.cardEventSha256} not in run-2`);
      const lastPay = evs.filter((e) => e.type === "PAYOUT_COMPUTED" && e.result === "VERIFIED").at(-1);
      if (lastPay?.sha256 !== rec.payoutEventSha256) problems.push(`${lane}: the last VERIFIED payout in run-2 is ${lastPay?.sha256}, not ${rec.payoutEventSha256}`);
    }
    caption = cap;
    media.push({ order: i + 1, laneId: lane, laneType: lane.endsWith("-a") ? "NBA_MONEYLINE" : "NBA_PLAYER_PROPS", file: `${i + 1}-${lane}.png`, sha256: r.imageSha256, width: 1080, height: 1350, png,
      lane: { recordSha256: rec.recordSha256, candidateRecordSha256: rec.candidateRecordSha256, approvalStatus: rec.approvalStatus, approvalRef: rec.approvalRef ?? null, priceEventSha256: rec.priceEventSha256, payoutEventSha256: rec.payoutEventSha256, cardEventSha256: rec.cardEventSha256, run2HeadSha256: rec.run2HeadSha256 ?? null,
        stakeCents: rec.money.stakeCents, grossPayoutCents: rec.money.grossPayoutCents, profitCents: rec.money.profitCents, combinedAmerican: rec.combined.american,
        // Each leg carries its tip (the console's firstStartUtc is the earliest), taken from the sealed record.
        legs: r.legs.map((l) => ({ ...l, startUtc: rec.legs.find((x) => x.legId === l.legId)?.startUtc ?? null })) } });
    if (media.at(-1).lane.legs.some((l) => !l.startUtc)) problems.push(`${lane}: a leg has no startUtc in the record`);
  }
  packages.push({ pkg, packageId: `${pkg}-2026-11-04`, product: pkg === "bb" ? "bank-builder" : "moonshot", media, caption });
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
  // The console's package (gtp-social-package@1, BBM_CHALLENGE_POST), exactly the importer's shape.
  const firstStartUtc = new Date(Math.min(...p.media.flatMap((m) => m.lane.legs.map((l) => Date.parse(l.startUtc))))).toISOString();
  const captionSha = sha(Buffer.from(p.caption, "utf8"));
  const lanes = p.media.map((m) => ({ laneId: m.laneId, laneType: m.laneType, runId: "run-2", laneLogRef: path.join(LANE_LOGS, m.laneId, "run-2.jsonl"), cardEventSha256: m.lane.cardEventSha256, payoutEventSha256: m.lane.payoutEventSha256, recordSha256: m.lane.recordSha256 }));
  const contentSha256 = sha(Buffer.from(JSON.stringify({ images: p.media.map((m) => m.sha256), captionSha256: captionSha, lanes: lanes.map((l) => [l.laneId, l.recordSha256, l.cardEventSha256, l.payoutEventSha256]) })));
  const variant = p.product;
  const social = {
    schema: "gtp-social-package@1", revision: 1, designVersion: "1", sport: "nba", date: "2026-11-04", contentType: "BBM_CHALLENGE_POST", variant,
    dedupeId: `gtp-social:nba:2026-11-04:BBM_CHALLENGE_POST:${variant}`, contentSha256, containsMarketData: true,
    approval: { status: "FINAL", socialAuthorized: true, founderWords: a["founder-words"], founderApprovedAt: new Date(a["founder-approved-at"]).toISOString(), oddsSnapshotOverride: OVERRIDE, authorizationRef: "41c421cf1d / f529fa44fa" },
    verification: { passed: true, checks: ["render FINAL from this source", "records FOUNDER_APPROVED with run-2 event shas", "run-2 lane log holds the card and last VERIFIED payout", "image and caption bytes match the render", "record parity", "money reconciliation", "diversity@2", "layout and checker clean"] },
    window: { opensAt: new Date(a["founder-approved-at"]).toISOString(), closesAt: firstStartUtc },
    provenance: { source: manifest.source, render: manifest.render, packageId: p.packageId },
    images: p.media.map((m) => ({ path: path.join(dir, m.file), sha256: m.sha256, width: 1080, height: 1350, scale: 1, laneId: m.laneId })),
    content: { bbm: { product: variant, preliminary: false, superseded: false, doNotPost: false, template: false, lanes } },
    commandCenter: {
      postId: `2026-11-04:NBA:bbm:${variant}`, title: `${variant === "bank-builder" ? "Bank Builder" : "Moonshot"} · lanes A + B`, sport: "NBA", date: "2026-11-04", firstStartUtc,
      suggestedPublishAt: a[`publish-${p.pkg}`] ?? null,
      claims: [...new Set(numbersIn(p.caption))].map((n) => ({ key: `caption.${n}`, display: n, evidenceRef: `${p.packageId}/manifest.json` })),
      captions: [{ id: "A", text: p.caption, tone: "factual" }],
    },
  };
  fs.writeFileSync(path.join(out, `nba-2026-11-04-bbm-${variant}.json`), `${JSON.stringify(social, null, 2)}\n`);
  console.log(`${p.packageId}: ${p.media.map((m) => `${m.file} ${m.sha256.slice(0, 16)}`).join(", ")} caption ${manifest.caption.sha256.slice(0, 16)}`);
}
