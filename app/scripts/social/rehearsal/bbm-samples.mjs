// BANK BUILDER & MOONSHOT V2 SAMPLES (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §4), from the engine's public lane projections
// (gtp.challenge-lane.public@1; betting-engine replay of the real Nov 2 frozen file and the Nov 3 reconcile). Writes:
//   staging/<date>/   the real packages for each date (bb-<date>, ms-a-<date>, ms-b-<date>) through the production path
//   samples/          every real lane graphic, plus labelled fixtures: a priced variant (our own fixture price, SAMPLE PRICE
//                     ribbon), BUSTED, mid-ladder cards and a no-card day on step 2 (fixture projections, TEST ribbon)
//
//   GTP_DATA_COMMIT=<sha holding the lane> npx tsx scripts/social/rehearsal/bbm-samples.mjs --projections <dir> [--private-root <dir>] \
//       --suggested-cards <file> --roster <unified roster.json> --as-of <ISO> --out <dir outside the repo>
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { planPackages, prepareLane, slateReader, writeSamples, writeStaging } from "../render-bbm.mjs";
import { BBM_LANES, sealProjection } from "../../../src/lib/social/bbm-lane.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const asOf = a["as-of"];
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
const docs = Object.fromEntries(Object.keys(BBM_LANES).map((id) => [id, JSON.parse(fs.readFileSync(path.join(a.projections, `${id}.json`), "utf8"))]));
const put = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const slate = slateReader([file]);
const dates = [...new Set(Object.values(docs).flatMap((d) => d.runs.flatMap((r) => r.days.map((x) => x.date))))].sort();

const real = {};
for (const date of dates) {
  real[date] = Object.keys(BBM_LANES).map((id) => prepareLane({ doc: docs[id], date, slate, roster, asOf: date === file.productDay ? asOf : `${date}T22:00:00Z` }));
  for (const p of real[date]) if (p.refused) throw new Error(`${p.laneId} ${date} refused: ${p.refused}`);
}

// Fixture projections (TEST): the real lane file with its history edited, resealed. Never a package.
const edit = (id, fn) => { const d = structuredClone(docs[id]); fn(d, d.runs.at(-1)); return sealProjection(d); };
const D = file.productDay;
const prev = new Date(Date.parse(`${D}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const next = new Date(Date.parse(`${D}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
const won = (step) => ({ date: prev, step, status: "READY", reason: "TEST", staked: true, card: null, cardEventSha256: null, legResults: [], modelCardResult: "WIN", stepOutcome: "WIN", receipts: [] });
const fx = {
  "bb-b-step2": edit("bb-b", (d, r) => { r.days = [won(1), { ...r.days.find((x) => x.date === D), step: 2 }]; r.trackedBankrollCents = 46413; r.trackedBankrollWithheld = null; }),
  "ms-b-step3": edit("ms-b", (d, r) => { r.days = [won(1), { ...won(2), date: prev }, { ...r.days.find((x) => x.date === D), step: 3 }]; r.trackedBankrollCents = 10920; r.trackedBankrollWithheld = null; }),
  "bb-a-busted": edit("bb-a", (d, r) => { r.days = [won(1), { ...r.days.find((x) => x.date === D), step: 2, staked: true, stepOutcome: "LOSS" }, { date: next, step: 2, status: "BUSTED", reason: "LANE A — BUSTED AT STEP 2 OF 3", staked: false, card: null, cardEventSha256: null, legResults: [], modelCardResult: null, stepOutcome: null, receipts: [] }]; }),
  "ms-a-nocard-step2": edit("ms-a", (d, r) => { r.days = [won(1), { ...r.days.find((x) => x.date === next), step: 2 }]; r.trackedBankrollCents = 5225; r.trackedBankrollWithheld = null; }),
};
for (const [id, d] of Object.entries(fx)) put(`lanes/test/${id}.json`, `${JSON.stringify(d, null, 2)}\n`);

const sample = (name, doc, date, o = {}) => { const p = prepareLane({ doc, date, slate, roster, asOf, ...o }); if (p.refused) throw new Error(`${name} refused: ${p.refused}`); return { name, card: p.card, p }; };
const items = [
  ...dates.flatMap((date) => real[date].map((p) => ({ name: `${p.laneId}-${date}-real`, card: p.card }))),
  sample(`bb-a-${D}-priced-SAMPLE`, docs["bb-a"], D, { samplePayout: { grossCents: 47500, profitCents: 37500, fixture: true } }),
  sample(`bb-b-${D}-step2-TEST`, fx["bb-b-step2"], D, { testData: true }),
  sample(`ms-b-${D}-step3-TEST`, fx["ms-b-step3"], D, { testData: true }),
  sample(`bb-a-${next}-busted-TEST`, fx["bb-a-busted"], next, { testData: true }),
  sample(`ms-a-${next}-nocard-step2-TEST`, fx["ms-a-nocard-step2"], next, { testData: true }),
];

const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  if (a.preview) { await writeSamples(items, { outDir: a.preview, browser, preview: true }); } else {
    const pngs = await writeSamples(items, { outDir: path.join(out, "samples"), browser, scales: [1, 2] });
    // The console checks sources against the engine's private run log; the projection sha rides beside it.
    const lanesRef = Object.fromEntries(Object.keys(BBM_LANES).map((id) => [id, a["private-root"] ? path.join(a["private-root"], id, `${docs[id].runs.at(-1).runId}.jsonl`) : path.join(a.projections, `${id}.json`)]));
    const staged = [];
    for (const date of dates) staged.push(...await writeStaging(planPackages(real[date], date), { outRoot: path.join(out, "staging"), browser, lanesRef }));
    // The production path must refuse the fixture price and every TEST history.
    const refusals = [];
    for (const it of items.filter((i) => i.p)) {
      const d = it.p.view.date;
      const partner = it.p.laneId.startsWith("bb") ? (real[d] ?? real[D]).filter((p) => p.laneId.startsWith("bb") && p.laneId !== it.p.laneId) : [];
      try { await writeStaging(planPackages([it.p, ...partner], d), { outRoot: path.join(out, "staging-must-refuse"), browser }); refusals.push({ sample: it.name, refused: false }); } catch (e) { refusals.push({ sample: it.name, refused: true, reason: e.message.split("\n").slice(1).join(" ").trim() }); }
    }
    fs.rmSync(path.join(out, "staging-must-refuse"), { recursive: true, force: true });
    const index = { projections: Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, d.contentSha256])), suggestedCards: file.contentSha256, asOf, pngs, staged: staged.map((s) => ({ dir: s.dir, packageId: s.manifest.packageId, laneStatus: s.manifest.laneStatus, needsFounderReview: s.manifest.needsFounderReview, media: s.manifest.media.map((m) => `${m.order}:${m.file}:${m.sha256.slice(0, 12)}`) })), fixtureRefusals: refusals };
    put("samples-index.json", `${JSON.stringify(index, null, 2)}\n`);
    console.log(JSON.stringify(index, null, 1));
  }
} finally { await browser.close(); }
