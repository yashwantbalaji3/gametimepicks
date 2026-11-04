// BANK BUILDER & MOONSHOT V2 SAMPLES (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §4). No engine lane log exists yet, so this
// writes lane logs itself from the frozen rule B suggested-cards file, then renders:
//   staging/<date>/   the three real packages (bb-<date>, ms-a-<date>, ms-b-<date>) through the production path
//   samples/          every lane, plus labelled fixtures: a priced variant (SAMPLE PRICE ribbon), BUSTED, mid-ladder B
//                     cards (TEST ribbon), and the no-card status
// Real: the A lanes take the file's own card at step 1 of a not-yet-approved run-1. The file holds one card per product,
// so the B lanes are NO_ELIGIBLE_CARD (no game-disjoint second card was frozen). Everything else is a labelled fixture.
//
//   GTP_DATA_COMMIT=<sha holding the lane> npx tsx scripts/social/rehearsal/bbm-samples.mjs --suggested-cards <file> \
//       --roster <unified roster.json> --as-of <ISO> --out <dir outside the repo>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { planPackages, prepareLane, slateReader, writeSamples, writeStaging } from "../render-bbm.mjs";
import { BBM_LANES, appendEvent, newLaneLog } from "../../../src/lib/social/bbm-lane.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const asOf = a["as-of"];
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
const date = file.productDay;
const next = new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
const prev = new Date(Date.parse(`${date}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const put = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const jsonl = (log) => `${[log.header, ...log.events].map((e) => JSON.stringify(e)).join("\n")}\n`;
const at = file.evaluatedAt;
const src = "bb-social sample builder (no engine lane log yet)";
const header = (laneId, extra = {}) => { const L = BBM_LANES[laneId]; return newLaneLog({ laneId, runId: "run-1", product: L.product, base: L.base, target: L.target, steps: L.steps, startedAt: at, approvedBy: null, ...extra }); };
const frozen = (card, step, d = date) => ({ type: "CARD_FROZEN", date: d, step, at, source: src, engineCardId: card.id, suggestedCardsSha256: card.fileSha ?? file.contentSha256, legs: card.legs.map((l) => ({ legId: l.legId, gameId: l.eventId, market: l.market, selection: l.selection.teamAbbr, projection: l.probability, snapshotId: l.forecast?.ref ?? null, contentSha256: l.forecast?.receiptSha256 ?? null })) });
const stake = (s, step, d = date) => ({ type: "STAKE_SET", date: d, step, at, source: src, stake: s, placedWager: false });

// Real A lanes (step 1) and B lanes (no second card in the file).
const bbA = file.bankBuilder.nba.card; const msA = file.moonshot.nba.card;
const logs = {};
logs["bb-a"] = appendEvent(appendEvent(header("bb-a"), frozen(bbA, 1)), stake(100, 1));
logs["ms-a"] = appendEvent(appendEvent(header("ms-a"), frozen(msA, 1)), stake(25, 1));
for (const id of ["bb-b", "ms-b"]) logs[id] = appendEvent(header(id), { type: "STATUS", date, step: 1, at, source: src, status: "NO_ELIGIBLE_CARD", reason: "the frozen suggested-cards file holds one card per product; no game-disjoint second card" });
for (const [id, log] of Object.entries(logs)) put(`lanes/${date}/${id}.jsonl`, jsonl(log));

const slate = slateReader([file]);
const real = Object.entries(logs).map(([id, log]) => ({ id, p: prepareLane({ log, date, slate, roster, asOf }) }));
for (const r of real) if (r.p.refused) throw new Error(`${r.id} refused: ${r.p.refused}`);

// TEST file copy with a lane B card per product (legs from the file's own pool, game-disjoint from A), resealed.
const games = (c) => new Set(c.legs.map((l) => l.eventId));
const pool = (avoid, n, allowFlag) => file.legs.filter((l) => !avoid.has(l.eventId) && (l.guard.state === "pass" || (allowFlag && l.guard.flags.every((f) => f === "FAVOURED_ROTATION_R1")))).sort((x, y) => y.probability - x.probability).slice(0, n);
const testCard = (id, tier, legs) => ({ id, policy: "test-fixture", scope: "nba", tier, legs, status: "MODEL_ONLY", priced: false, price: null, payout: null });
const tf = structuredClone(file);
delete tf.contentSha256;
tf.label = "TEST FIXTURE: lane B cards added by bb-social for layout samples";
tf.bankBuilder.nba.cards = [testCard("test-bb-b", "low", pool(games(bbA), 2, false))];
tf.moonshot.nba.cards = [testCard("test-ms-b", "longshot", pool(games(msA), 4, true))];
tf.contentSha256 = crypto.createHash("sha256").update(JSON.stringify(tf)).digest("hex");
const testFile = put(`lanes/test/suggested-cards-${date}-test.json`, `${JSON.stringify(tf, null, 2)}\n`);
const tslate = slateReader([tf]);
const withSha = (c) => ({ ...c, fileSha: tf.contentSha256 });

const fx = {};
// bb-b mid-ladder: step 1 settled on the previous day, step 2 is today's card.
fx["bb-b-step2"] = appendEvent(appendEvent(appendEvent(header("bb-b"), { type: "STEP_SETTLED", date: prev, step: 1, at, source: "TEST", outcome: "WIN", bankrollAfter: 464.13 }), frozen(withSha(tf.bankBuilder.nba.cards[0]), 2)), stake(464.13, 2));
// ms-b mid-ladder: two steps settled.
fx["ms-b-step3"] = appendEvent(appendEvent(appendEvent(appendEvent(header("ms-b"), { type: "STEP_SETTLED", date: prev, step: 1, at, source: "TEST", outcome: "WIN", bankrollAfter: 52.25 }), { type: "STEP_SETTLED", date: prev, step: 2, at, source: "TEST", outcome: "WIN", bankrollAfter: 109.2 }), frozen(withSha(tf.moonshot.nba.cards[0]), 3)), stake(109.2, 3));
// Priced: the real bb-a card with a FIXTURE price (SAMPLE PRICE ribbon).
const priced = structuredClone(logs["bb-a"]);
appendEvent(priced, { type: "PRICE_VERIFIED", date, step: 1, at, source: "FIXTURE", fixture: true, provider: "FIXTURE", legs: bbA.legs.map((l) => ({ legId: l.legId, price: "FIXTURE" })), parlayDecimal: 4.75, method: "FIXTURE", priceSnapshotSha: "0".repeat(64) });
appendEvent(priced, { type: "PAYOUT_COMPUTED", date, step: 1, at, source: "FIXTURE", fixture: true, stake: 100, decimalPrice: 4.75, grossPayout: 475, profit: 375, priceSnapshotSha: "0".repeat(64) });
fx["bb-a-priced"] = priced;
// BUSTED: step 1 settled before, today's card (step 2) lost one leg; drawn the next day.
const bust = appendEvent(appendEvent(appendEvent(header("bb-a"), { type: "STEP_SETTLED", date: prev, step: 1, at, source: "TEST", outcome: "WIN", bankrollAfter: 464.13 }), frozen(bbA, 2)), stake(464.13, 2));
appendEvent(bust, { type: "LEG_SETTLED", date: next, step: 2, at, source: "TEST", legId: bbA.legs[0].legId, outcome: "WIN" });
appendEvent(bust, { type: "LEG_SETTLED", date: next, step: 2, at, source: "TEST", legId: bbA.legs[1].legId, outcome: "LOSS" });
appendEvent(bust, { type: "STEP_SETTLED", date: next, step: 2, at, source: "TEST", outcome: "LOSS" });
fx["bb-a-busted"] = bust;
// No qualifying card while on step 2.
fx["ms-a-nocard-step2"] = appendEvent(appendEvent(header("ms-a"), { type: "STEP_SETTLED", date: prev, step: 1, at, source: "TEST", outcome: "WIN", bankrollAfter: 52.25 }), { type: "STATUS", date, step: 2, at, source: "TEST", status: "NO_ELIGIBLE_CARD", reason: "TEST" });
for (const [id, log] of Object.entries(fx)) put(`lanes/test/${id}.jsonl`, jsonl(log));

const sample = (name, log, d, opts) => { const p = prepareLane({ log, date: d, slate: opts.slate ?? slate, roster, asOf, testData: opts.test }); if (p.refused) throw new Error(`${name} refused: ${p.refused}`); return { name, card: p.card, p }; };
const items = [
  ...real.map((r) => ({ name: `${r.id}-${date}-real`, card: r.p.card })),
  sample(`bb-a-${date}-priced-SAMPLE`, fx["bb-a-priced"], date, { test: false }),
  sample(`bb-b-${date}-step2-TEST`, fx["bb-b-step2"], date, { test: true, slate: tslate }),
  sample(`ms-b-${date}-step3-TEST`, fx["ms-b-step3"], date, { test: true, slate: tslate }),
  sample(`bb-a-${next}-busted-TEST`, fx["bb-a-busted"], next, { test: true }),
  sample(`ms-a-${date}-nocard-step2-TEST`, fx["ms-a-nocard-step2"], date, { test: true }),
];

const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  if (a.preview) { await writeSamples(items, { outDir: a.preview, browser, preview: true }); process.exit(0); }
  const pngs = await writeSamples(items, { outDir: path.join(out, "samples"), browser, scales: [1, 2] });
  const staged = await writeStaging(planPackages(real.map((r) => r.p), date), { outRoot: path.join(out, "staging"), browser, lanesRef: Object.fromEntries(Object.keys(logs).map((id) => [id, path.join(out, "lanes", date, `${id}.jsonl`)])) });
  // The production path must refuse the fixture price and the TEST histories.
  const refusals = [];
  for (const it of items.filter((i) => i.p)) {
    try { await writeStaging(planPackages([it.p, ...(it.p.laneId.startsWith("bb") ? [real.find((r) => r.id === (it.p.laneId === "bb-a" ? "bb-b" : "bb-a")).p] : [])], it.p.view.date), { outRoot: path.join(out, "staging-must-refuse"), browser }); refusals.push({ sample: it.name, refused: false }); } catch (e) { refusals.push({ sample: it.name, refused: true, reason: e.message.split("\n").slice(1).join(" ") }); }
  }
  fs.rmSync(path.join(out, "staging-must-refuse"), { recursive: true, force: true });
  const index = { suggestedCards: { file: a["suggested-cards"], contentSha256: file.contentSha256 }, testFile, asOf, pngs, staged: staged.map((s) => ({ dir: s.dir, packageId: s.manifest.packageId, laneStatus: s.manifest.laneStatus, needsFounderReview: s.manifest.needsFounderReview, media: s.manifest.media.map((m) => `${m.order}:${m.file}:${m.sha256.slice(0, 12)}`) })), fixtureRefusals: refusals };
  put("samples-index.json", `${JSON.stringify(index, null, 2)}\n`);
  console.log(JSON.stringify(index, null, 1));
} finally { await browser.close(); }
