// BBM V6 FINAL PACKAGES for the Command Center BBM_CHALLENGE_POST importer (PD 2026-11-04). Reads a FINAL render folder
// (bbm-v6-research.mjs --final 1) and the engine's sealed final file, verifies every byte and binding, and writes one
// package per product: <out>/<packageId>/{1-<lane A>.png, 2-<lane B>.png, caption.txt, manifest.json}. Never the live
// packages folder; fail-closed on any mismatch (status, approval, run-2 payout event, image or caption sha, flags).
//
//   npx tsx scripts/social/rehearsal/bbm-v6-package.mjs --render <final render dir> --source <sealed-final-2105.json> --out <dir>
//       --caption-variant v3|compliant --founder-approved-at <ISO> [--publish-bb <ISO>] [--publish-ms <ISO>]
//       --founder-words "<verbatim>" | --approval-file <founder decisions .md> (section A is quoted verbatim)
//       [--approved-shas bb-a=<sha>,bb-b=<sha>,ms-a=<sha>,ms-b=<sha>,bb-caption=<sha>,ms-caption=<sha>]
// With --approved-shas the founder approved the FINAL_CANDIDATE bytes themselves (2026-11-04 22:30:09Z): no re-render.
// The candidate render is packaged only when all six shas match exactly and each sealed final record carries the same
// candidateRecordSha256 the images were rendered from (the engine applies identical data).
// Also writes the console's gtp-social-package@1 (BBM_CHALLENGE_POST) per product, in the shape the Command Center
// importer enforces (CC 2026-11-04); approval fields only from the founder's words as relayed by the PD.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { LIVE_PACKAGES } from "../render-bbm.mjs";
import { RULES_V2 } from "../bbm-cards-v6.mjs";

const a = parseArgs(process.argv.slice(2));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const out = path.resolve(a.out);
if (out === LIVE_PACKAGES || out.startsWith(LIVE_PACKAGES + path.sep)) throw new Error("never the live packages folder");
const render = JSON.parse(fs.readFileSync(path.join(a.render, "manifest.json"), "utf8"));
const srcRaw = fs.readFileSync(a.source);
const src = JSON.parse(srcRaw);
const problems = [];
const APPROVED = a["approved-shas"] ? Object.fromEntries(String(a["approved-shas"]).split(",").map((x) => x.split("="))) : null;
let approvalSource = null;
if (a["approval-file"]) {
  const raw = fs.readFileSync(a["approval-file"]);
  const text = raw.toString("utf8");
  const sec = /^A\. [^\n]*\n([\s\S]*?)\n(?=B\. )/m.exec(text);
  if (!sec) problems.push("the approval file has no section A");
  else { a["founder-words"] = `${text.match(/^A\. [^\n]*/m)[0]}\n${sec[1]}`.trim(); approvalSource = { file: a["approval-file"], sha256: sha(raw), section: "A" }; }
}
if (!(a.road && a.road !== "0") && !["v3", "compliant", "final"].includes(a["caption-variant"])) problems.push("--caption-variant must be v3, compliant or final (the founder's choice)");
// --final-copy-file/-sha/-section (founder 2026-11-05): a final-copy candidate; the founder's console click is the content
// approval (contentApproval null). Otherwise the founder's words and approval time are required.
// Several approval files may be cited (comma-separated, in order; sections "|"-separated); every one must hash as given.
const fcFiles = String(a["final-copy-file"] ?? "").split(",").filter(Boolean); const fcShas = String(a["final-copy-sha"] ?? "").split(","); const fcSec = String(a["final-copy-section"] ?? "").split("|");
const FINAL_COPY = fcFiles.length ? { files: fcFiles.map((f, i) => ({ file: f, sha256: fcShas[i], section: fcSec[i] || null })) } : null;
for (const f of FINAL_COPY?.files ?? []) if (!f.sha256 || sha(fs.readFileSync(f.file)) !== f.sha256) problems.push(`final-copy file ${f.file} does not hash to ${f.sha256}`);
if (!FINAL_COPY && (!a["founder-words"] || !a["founder-approved-at"] || Number.isNaN(Date.parse(a["founder-approved-at"])))) problems.push("approval needs the founder's verbatim words and the approval time (relayed by the PD)");
const LANE_LOGS = process.env.GTP_LANE_LOGS_DIR ?? path.join(process.env.HOME, "gtp-private", "challenge-lanes");
/** The card facts a caption may cite, each from the sealed record or the render, keyed by what it is. */
function cardClaims(p) {
  const dollars = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const out = [{ key: "date", display: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${p.date}T12:00:00Z`)) }, { key: "age", display: "21+" }];
  for (const m of p.media) {
    const L = m.lane;
    out.push({ key: `${m.laneId}.stake`, display: dollars(L.stakeCents) }, { key: `${m.laneId}.payout`, display: dollars(L.grossPayoutCents) }, { key: `${m.laneId}.profit`, display: dollars(L.profitCents) }, { key: `${m.laneId}.combined`, display: `${L.combinedAmerican > 0 ? "+" : ""}${L.combinedAmerican}` });
    for (const [i, l] of (L.legs ?? []).entries()) {
      if (l.line != null) out.push({ key: `${m.laneId}.leg${i + 1}.line`, display: String(l.line) });
      if (l.odds) out.push({ key: `${m.laneId}.leg${i + 1}.odds`, display: String(l.odds) });
    }
  }
  for (const [k, v] of Object.entries(p.extraClaims ?? {})) out.push({ key: k, display: v });
  return out;
}
const numbersIn = (t) => String(t ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
// Approved bytes may be a FINAL_CANDIDATE render (approved before run-2, Nov 4) or a FINAL render (step 2); either way
// every approved sha must match exactly.
const CANDIDATE_BYTES = APPROVED && render.status === "FINAL_CANDIDATE";
if (CANDIDATE_BYTES) {
  if (!fs.existsSync(render.source?.file ?? "") || sha(fs.readFileSync(render.source.file)) !== render.source.sha256) problems.push("the candidate source file changed since the render");
} else {
  if (render.status !== "FINAL" || render.final !== true) problems.push(`render status ${render.status}: only a FINAL render is packaged`);
  if (render.source?.sha256 !== sha(srcRaw)) problems.push("the render was not made from this source file");
}
if ((render.checker ?? []).length || (render.layout ?? []).length || (render.diversity?.repeats ?? []).length) problems.push("the render carries checker, layout or diversity problems");
// Founder override 2026-11-04 (odds snapshot): captured odds, may have changed, not a live offer.
// The Nov 4 override applies to Nov 4 only; a later date cites its own (--override-id, --override-commits a,b) or none.
// --override-file must hash to --override-sha (fail-closed); receipts are cited as given ("<commit> (<what>)").
if (a["override-file"] && sha(fs.readFileSync(a["override-file"])) !== a["override-sha"]) throw new Error(`override file ${a["override-file"]} does not hash to ${a["override-sha"]}`);
const OVERRIDE = a["override-id"] ? { id: a["override-id"], commits: String(a["override-commits"] ?? "").split(",").filter(Boolean), ...(a["override-file"] ? { approvalFile: a["override-file"], sha256: a["override-sha"] } : {}), ...(a["override-receipts"] ? { receipts: String(a["override-receipts"]).split("|") } : {}), ...(a["override-scope"] ? { scope: a["override-scope"] } : {}) } : (a.road && a.road !== "0") ? null : { id: "2026-11-04-founder-odds-snapshot-override", commits: ["f529fa44fa", "41c421cf1d"], fetchedWindowUtc: "2026-11-04T21:05Z/2026-11-04T21:07Z" };
const packages = [];
// --road 1 (PD 2026-11-05): ONE card per product from the continuing lane in the source (bb-b / ms-b); the founder's
// caption comes from --caption-bb / --caption-ms (files) and its sha must be in --approved-shas once he approves it.
const ROAD = a.road != null && a.road !== "0";
const recKeys = Object.keys(src.records ?? {});
const plan = ROAD ? [["bb", recKeys.filter((k) => k.startsWith("bb-")).map((k) => k.split(":")[0])], ["ms", recKeys.filter((k) => k.startsWith("ms-")).map((k) => k.split(":")[0])]] : [["bb", ["bb-a", "bb-b"]], ["ms", ["ms-a", "ms-b"]]];
if (ROAD && plan.some(([, ls]) => ls.length !== 1)) problems.push(`road mode expects one card per product, got ${JSON.stringify(plan)}`);
for (const [pkg, lanes] of plan) {
  const rows = lanes.map((l) => render.parityRows.find((r) => r.laneId === l && !r.alternate));
  const media = []; let caption = null;
  for (const [i, r] of rows.entries()) {
    const lane = lanes[i];
    const rec0 = src.records?.[`${lane}:A`]?.record;
    // No money.stakeCents in the step 2 sealed file: gross - profit, asserted against --opening (as the render does).
    const OPEN = Object.fromEntries(String(a.opening ?? "").split(",").filter(Boolean).map((x) => x.split("=")).map(([k, v]) => [k, Number(v)]));
    const rec = rec0 && rec0.money.stakeCents == null ? { ...rec0, money: { ...rec0.money, stakeCents: rec0.money.grossPayoutCents - rec0.money.profitCents } } : rec0;
    if (rec && rec0.money.stakeCents == null && OPEN[lane] !== rec.money.stakeCents) problems.push(`${lane}: no stakeCents and gross - profit ${rec.money.stakeCents} is not --opening ${OPEN[lane]}`);
    if (!r || !rec) { problems.push(`${lane}: missing render row or source record`); continue; }
    if (rec.approvalStatus !== "FOUNDER_APPROVED") problems.push(`${lane}: approval ${rec.approvalStatus}`);
    for (const k of ["priceEventSha256", "payoutEventSha256", "cardEventSha256"]) if (!/^[0-9a-f]{64}$/.test(rec[k] ?? "")) problems.push(`${lane}: ${k} is not a run-2 event sha (${rec[k]})`);
    if ((!CANDIDATE_BYTES && r.recordSha256 !== rec.recordSha256) || r.candidateRecordSha256 !== rec.candidateRecordSha256) problems.push(`${lane}: the image was not rendered from this record`);
    if (APPROVED && (APPROVED[lane] || CANDIDATE_BYTES) && APPROVED[lane] !== r.imageSha256) problems.push(`${lane}: image sha ${r.imageSha256} is not the founder-approved ${APPROVED[lane]}`);
    if (!r.parity?.ok) problems.push(`${lane}: parity ${r.parity?.mismatches?.join("; ")}`);
    const png = fs.readFileSync(path.join(a.render, "full", `${lane}.png`));
    if (sha(png) !== r.imageSha256) problems.push(`${lane}: image bytes differ from the render manifest`);
    const cap = ROAD ? fs.readFileSync(a[`caption-${pkg}`], "utf8") : fs.readFileSync(path.join(a.render, "captions", `${pkg}-2026-11-04${{ compliant: "-compliant", final: "-final" }[a["caption-variant"]] ?? ""}.txt`), "utf8");
    if (a["caption-variant"] === "v3" && sha(Buffer.from(cap, "utf8")) !== r.captionSha256) problems.push(`${lane}: caption bytes differ from the render manifest`);
    // A caption the founder has not yet approved (no caption sha given) is packaged as PENDING: never socially authorized.
    if (APPROVED && APPROVED[`${pkg}-caption`] && APPROVED[`${pkg}-caption`] !== sha(Buffer.from(cap, "utf8"))) problems.push(`${pkg}: caption sha ${sha(Buffer.from(cap, "utf8"))} is not the founder-approved ${APPROVED[`${pkg}-caption`]}`);
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
  const T = { bb: { base: 10000, target: 1000000 }, ms: { base: 2500, target: 100000 } }[pkg];
  const recP = src.records?.[`${lanes[0]}:A`]?.record ?? {};
  const rec0 = recP.money && recP.money.stakeCents == null ? { ...recP, money: { ...recP.money, stakeCents: recP.money.grossPayoutCents - recP.money.profitCents } } : recP;
  const date = rec0.date ?? "2026-11-04"; const step = ROAD ? rec0.step : 1;
  // The post's sport: NFL when the card carries the required NFL leg (tonight's TNF), else NBA (CC to confirm for mixed cards).
  const sport = (rec0.legs ?? []).some((l) => l.sport === "nfl") ? "nfl" : "nba";
  packages.push({ pkg, packageId: `${pkg}-${date}`, date, step, sport, product: pkg === "bb" ? "bank-builder" : "moonshot", media, caption,
    extraClaims: { ...(step > 1 ? { "challenge.completed": `Step ${step - 1}`, "challenge.opening": `$${(rec0.money.stakeCents / 100).toLocaleString("en-US", { minimumFractionDigits: rec0.money.stakeCents % 100 ? 2 : 0 })}` } : {}), "challenge.stepTarget": `~$${(RULES_V2.milestonesCents[pkg === "bb" ? "bank-builder" : "moonshot"][step - 1] / 100).toLocaleString("en-US")}`, "challenge.step": `Step ${step} of 5`, "challenge.base": `$${(T.base / 100).toLocaleString("en-US")}`, "challenge.target": `$${(T.target / 100).toLocaleString("en-US")}` } });
}
if (problems.length) throw new Error(`packaging refused:\n  ${problems.join("\n  ")}`);
for (const p of packages) {
  const dir = path.join(out, p.packageId);
  fs.mkdirSync(dir, { recursive: true });
  for (const m of p.media) fs.writeFileSync(path.join(dir, m.file), m.png);
  fs.writeFileSync(path.join(dir, "caption.txt"), p.caption);
  const manifest = {
    schema: "gtp.bbm-challenge-post@1", kind: "BBM_CHALLENGE_POST", status: "FINAL", packageId: p.packageId, product: p.product, date: p.date,
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
    schema: "gtp-social-package@1", revision: 1, designVersion: "1", sport: p.sport, date: p.date, contentType: "BBM_CHALLENGE_POST", variant,
    dedupeId: `gtp-social:${p.sport}:${p.date}:BBM_CHALLENGE_POST:${variant}`, contentSha256, containsMarketData: true,
    approval: FINAL_COPY ? { status: "FINAL", socialAuthorized: true, socialAuthorizedMeaning: "final-copy marker only; the founder's console approval is the content approval", finalCopyAuthorization: FINAL_COPY, contentApproval: null, oddsSnapshotOverride: OVERRIDE, authorizationRef: OVERRIDE ? (OVERRIDE.commits.length ? OVERRIDE.commits : (OVERRIDE.receipts ?? []).map((r) => r.split(" ")[0])).join(" / ") : null } : { status: "FINAL", socialAuthorized: !APPROVED || Boolean(APPROVED[`${p.pkg}-caption`]), captionApproval: !APPROVED || APPROVED[`${p.pkg}-caption`] ? { status: "APPROVED", sha256: captionSha } : { status: "PENDING_FOUNDER", sha256: captionSha, note: "images approved 2026-11-04T22:30:09Z; this caption awaits the founder's approval" }, founderWords: a["founder-words"], founderApprovedAt: new Date(a["founder-approved-at"]).toISOString(), approvalSourceRef: approvalSource, approvedShas: APPROVED, oddsSnapshotOverride: OVERRIDE, authorizationRef: OVERRIDE ? (OVERRIDE.commits.length ? OVERRIDE.commits : (OVERRIDE.receipts ?? []).map((r) => r.split(" ")[0])).join(" / ") : null },
    verification: { passed: true, checks: ["render FINAL from this source", "records FOUNDER_APPROVED with run-2 event shas", "run-2 lane log holds the card and last VERIFIED payout", "image and caption bytes match the render", "record parity", "money reconciliation", "diversity@2", "layout and checker clean"] },
    window: { opensAt: new Date(FINAL_COPY ? Date.now() : a["founder-approved-at"]).toISOString(), closesAt: firstStartUtc },
    provenance: { source: manifest.source, render: manifest.render, packageId: p.packageId },
    images: p.media.map((m) => ({ path: path.join(dir, m.file), sha256: m.sha256, width: 1080, height: 1350, scale: 1, laneId: m.laneId })),
    content: { bbm: { product: variant, preliminary: false, superseded: false, doNotPost: false, template: false, lanes } },
    commandCenter: {
      postId: `${p.date}:${p.sport.toUpperCase()}:bbm:${variant}`, title: `${variant === "bank-builder" ? "Bank Builder" : "Moonshot"} · ${ROAD ? `step ${p.step} of 5` : "lanes A + B"}`, sport: p.sport.toUpperCase(), date: p.date, firstStartUtc,
      suggestedPublishAt: a[`publish-${p.pkg}`] ?? null,
      // PD 2026-11-05: claims come from the card data (money, odds, lines, records, step, date, 21+), never from the
      // caption's own numbers, so the console's number check can refuse a caption number the card does not carry.
      claims: cardClaims(p).map((c) => ({ ...c, evidenceRef: `${p.packageId}/manifest.json` })),
      captions: [{ id: "A", text: p.caption, tone: "factual" }],
    },
  };
  fs.writeFileSync(path.join(out, `${p.sport}-${p.date}-bbm-${variant}.json`), `${JSON.stringify(social, null, 2)}\n`);
  console.log(`${p.packageId}: ${p.media.map((m) => `${m.file} ${m.sha256.slice(0, 16)}`).join(", ")} caption ${manifest.caption.sha256.slice(0, 16)}`);
}
