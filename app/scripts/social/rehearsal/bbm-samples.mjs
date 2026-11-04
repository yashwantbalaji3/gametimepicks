// BANK BUILDER & MOONSHOT V2 SAMPLES (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §4), from the engine's public lane projections
// (gtp.challenge-lane.public@1; betting-engine replay of the real Nov 2 frozen file and the Nov 3 reconcile). Writes:
//   staging/<date>/   the real packages for each date (bb-<date>, ms-a-<date>, ms-b-<date>) through the production path
//   samples/          every real lane graphic, plus labelled fixtures: a priced variant (our own fixture price, SAMPLE PRICE
//                     ribbon), BUSTED, mid-ladder cards and a no-card day on step 2 (fixture projections, TEST ribbon)
//
//   GTP_DATA_COMMIT=<sha holding the lane> npx tsx scripts/social/rehearsal/bbm-samples.mjs --projections <dir> [--private-root <dir>] \
//       --suggested-cards <file> --roster <unified roster.json> --as-of <ISO> --out <dir outside the repo>
import crypto from "node:crypto";
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
const raw = Object.fromEntries(Object.keys(BBM_LANES).map((id) => [id, JSON.parse(fs.readFileSync(path.join(a.projections, `${id}.json`), "utf8"))]));
// SPEC rev. 2 gives every lane five steps. A revision-1 projection (Bank Builder at 3) with no settled step is the same
// record on a five-step ladder; it is resealed as such and listed in the index. A settled history is never re-laddered.
const upgraded = [];
const docs = Object.fromEntries(Object.entries(raw).map(([id, d]) => {
  if (d.steps === BBM_LANES[id].steps) return [id, d];
  if (d.runs.some((r) => r.days.some((x) => x.stepOutcome))) throw new Error(`${id}: a ${d.steps}-step history cannot be shown on a ${BBM_LANES[id].steps}-step ladder`);
  upgraded.push(id);
  const c = structuredClone(d); c.steps = BBM_LANES[id].steps;
  for (const r of [c.current, ...c.runs]) { r.steps &&= c.steps; if (r.stepText) r.stepText = `STEP ${r.step} OF ${c.steps}`; }
  return [id, sealProjection(c)];
}));
const put = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const slate = slateReader([file]);
const dates = [...new Set(Object.values(docs).flatMap((d) => d.runs.flatMap((r) => r.days.map((x) => x.date))))].sort();

const real = {};
for (const date of dates) {
  real[date] = Object.keys(BBM_LANES).map((id) => prepareLane({ doc: docs[id], date, slate, roster, asOf: date === file.productDay ? asOf : `${date}T22:00:00Z` }));
  for (const p of real[date]) if (p.refused) throw new Error(`${p.laneId} ${date} refused: ${p.refused}`);
}

const D = file.productDay;
const prev = new Date(Date.parse(`${D}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const next = new Date(Date.parse(`${D}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
// A TEST prop card for a Moonshot lane: four cleared players from four games, each at the lane's own MODEL PROJECTION.
const lane = slate(D).lane;
const pick = [];
for (const g of lane.games) {
  if (pick.length === 4) break;
  for (const side of ["away", "home"]) {
    const p = [...(g.players?.[side] ?? [])].sort((x, y) => (y.medians?.pts ?? 0) - (x.medians?.pts ?? 0)).find((x) => !x.injuryStatus && !roster.__guard?.[String(x.providerAthleteId)]?.length && !(roster.__cells?.[String(x.providerAthleteId)] ?? []).includes("pts") && x.medians?.pts >= 10 && !(roster[g[side].abbr] ?? []).some((e) => e?.review && String(e.id) === String(x.providerAthleteId)));
    if (p) { pick.push({ g, side, p }); break; }
  }
}
const propLegs = pick.map(({ g, side, p }) => ({ legId: `nba:${g.providerEventId}:pts:${p.providerAthleteId}`, sport: "nba", eventId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "pts", player: { id: String(p.providerAthleteId), name: p.name }, selection: { code: side, teamAbbr: g[side].abbr }, projection: p.medians.pts, guard: { state: "pass", flags: [], flagText: [] } }));
const tf = structuredClone(file);
delete tf.contentSha256;
tf.label = "TEST FIXTURE: prop legs added by bb-social for layout samples";
tf.legs = [...tf.legs, ...propLegs];
tf.contentSha256 = crypto.createHash("sha256").update(JSON.stringify(tf)).digest("hex");
put("lanes/test/suggested-cards-props-TEST.json", `${JSON.stringify(tf, null, 2)}\n`);
const tslate = slateReader([tf]);
const propCard = { cardId: "test-props", product: "moonshot", productDay: D, scope: "nba", tier: "longshot", evaluatedAt: file.evaluatedAt, suggestedCardsSchema: "gtp.suggested-cards@1", suggestedCardsSha256: tf.contentSha256, legs: propLegs.map(({ sport: _s, eventId, ...l }) => ({ ...l, gameId: eventId })) };

// Fixture projections (TEST): the real lane file with its history edited, resealed. Never a package.
// The engine's pace describes the real history; an edited history gets its pace from the milestones instead.
const edit = (id, fn) => { const d = structuredClone(docs[id]); const r = d.runs.at(-1); fn(d, r); delete r.pace; return sealProjection(d); };
const won = (step) => ({ date: prev, step, status: "READY", reason: "TEST", staked: true, card: null, cardEventSha256: null, legResults: [], modelCardResult: "WIN", stepOutcome: "WIN", receipts: [] });
const fx = {
  // Step 1 won ($100 → $300, on the milestone), step 2 active: today's real lane B card, staked.
  "bb-b-step2-active": edit("bb-b", (d, r) => { r.days = [won(1), { ...r.days.find((x) => x.date === D), step: 2, status: "IN_PLAY", staked: true }]; r.trackedBankrollCents = 30000; r.trackedBankrollWithheld = null; }),
  // Two steps won below the milestones: behind pace, today's real card held (unpriced).
  "ms-b-step3": edit("ms-b", (d, r) => { r.days = [won(1), { ...won(2), date: prev }, { ...r.days.find((x) => x.date === D), step: 3 }]; r.trackedBankrollCents = 10920; r.trackedBankrollWithheld = null; }),
  // LOST: step 1 won, step 2 was the real Nov 2 card (NY landed, DEN missed: the real finals), staked.
  "bb-a-lost": edit("bb-a", (d, r) => { r.days = [won(1), { ...r.days.find((x) => x.date === D), step: 2, staked: true, stepOutcome: "LOSS" }, { date: next, step: 2, status: "BUSTED", reason: "LANE A — BUSTED AT STEP 2 OF 5", staked: false, card: null, cardEventSha256: null, legResults: [], modelCardResult: null, stepOutcome: null, receipts: [] }]; }),
  // A prop card on Moonshot A, step 1.
  "ms-a-props": edit("ms-a", (d, r) => { r.days = [{ ...r.days.find((x) => x.date === D), card: propCard, cardEventSha256: "f".repeat(64) }]; }),
};
for (const [id, d] of Object.entries(fx)) put(`lanes/test/${id}.json`, `${JSON.stringify(d, null, 2)}\n`);

const sample = (name, doc, date, o = {}) => { const p = prepareLane({ doc, date, slate, roster, asOf, ...o }); if (p.refused) throw new Error(`${name} refused: ${p.refused}`); return { name, card: p.card, p }; };
const items = [
  ...dates.flatMap((date) => real[date].map((p) => ({ name: `${p.laneId}-${date}-real`, card: p.card }))),
  sample(`bb-a-${D}-priced-SAMPLE`, docs["bb-a"], D, { samplePayout: { grossCents: 32800, profitCents: 22800, fixture: true } }),
  sample(`bb-b-${D}-step2-active-TEST`, fx["bb-b-step2-active"], D, { testData: true, samplePayout: { grossCents: 90000, profitCents: 60000, fixture: true } }),
  sample(`ms-b-${D}-step3-behind-pace-TEST`, fx["ms-b-step3"], D, { testData: true }),
  sample(`bb-a-${next}-lost-TEST`, fx["bb-a-lost"], next, { testData: true }),
  sample(`ms-a-${D}-props-priced-SAMPLE-TEST`, fx["ms-a-props"], D, { testData: true, slate: tslate, samplePayout: { grossCents: 32500, profitCents: 30000, fixture: true, lines: Object.fromEntries(propLegs.map((l) => [l.legId, `${Math.max(0.5, Math.round(l.projection) - 2.5)}+ PTS`])) } }),
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
      // Pair each fixture with the real other lane of its product, so a full two-image package is attempted.
      const partner = (real[d] ?? real[D]).filter((p) => p.laneId.slice(0, 2) === it.p.laneId.slice(0, 2) && p.laneId !== it.p.laneId);
      try { await writeStaging(planPackages([it.p, ...partner], d), { outRoot: path.join(out, "staging-must-refuse"), browser }); refusals.push({ sample: it.name, refused: false }); } catch (e) { refusals.push({ sample: it.name, refused: true, reason: e.message.split("\n").slice(1).join(" ").trim() }); }
    }
    fs.rmSync(path.join(out, "staging-must-refuse"), { recursive: true, force: true });
    const index = { upgradedFromRevision1: upgraded, projections: Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, d.contentSha256])), suggestedCards: file.contentSha256, asOf, pngs, staged: staged.map((s) => ({ dir: s.dir, packageId: s.manifest.packageId, laneStatus: s.manifest.laneStatus, needsFounderReview: s.manifest.needsFounderReview, media: s.manifest.media.map((m) => `${m.order}:${m.file}:${m.sha256.slice(0, 12)}`) })), fixtureRefusals: refusals };
    put("samples-index.json", `${JSON.stringify(index, null, 2)}\n`);
    console.log(JSON.stringify(index, null, 1));
  }
} finally { await browser.close(); }
