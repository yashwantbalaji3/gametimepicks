// BANK BUILDER & MOONSHOT V2 SAMPLES (SPEC ~/gtp-evidence/bbm-v2/SPEC.md rev. 2). Every lane state comes from the
// engine's own code: its run logs (betting-engine replay of the real Nov 2 frozen file and the Nov 3 reconcile), cut at
// the posting instant and projected with its laneProjection, then shown through its laneDisplay. Writes:
//   staging/<date>/   the real packages per date (bb-<date>, ms-<date>; A then B) through the production path
//   samples/          every real lane graphic, plus labelled fixtures built as engine event logs: step 2 active after
//                     step 1 won, behind pace, LOST, and SAMPLE-priced moneyline and prop cards (TEST / SAMPLE ribbons)
// A fixture whose history includes a won step is shown as it would read once prices are approved (the engine withholds
// that bankroll until then); that is part of why it is TEST.
//
//   GTP_DATA_COMMIT=<sha holding the lane> npx tsx scripts/social/rehearsal/bbm-samples.mjs --private-root <dir> \
//       --suggested-cards <file> --roster <unified roster.json> --as-of <ISO> --out <dir outside the repo>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { planPackages, prepareLane, slateReader, writeSamples, writeStaging } from "../render-bbm.mjs";
import { BBM_LANES, sealProjection } from "../../../src/lib/social/bbm-lane.mjs";
import { parseEvents } from "../../../src/lib/challenge-lanes/chain.mjs";
import { append, MILESTONES } from "../../../src/lib/challenge-lanes/lanes.mjs";
import { laneProjection } from "../../../src/lib/challenge-lanes/projection.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const asOf = a["as-of"];
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
const ids = Object.keys(BBM_LANES);
const logRef = (id) => path.join(a["private-root"], id, "run-1.jsonl");
const logs = Object.fromEntries(ids.map((id) => [id, parseEvents(fs.readFileSync(logRef(id), "utf8"))]));
const put = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const ms = (iso) => Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const D = file.productDay;
const prev = new Date(Date.parse(`${D}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const next = new Date(Date.parse(`${D}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);

// Real lane state at each posting instant: the engine's log cut at that instant, projected by the engine.
const POST_AT = { [D]: asOf, [next]: `${next}T22:00:00Z` };
const cut = (id, at) => laneProjection(id, [logs[id].filter((e) => ms(e.at) <= ms(at))]);
const slate = slateReader([file]);
const real = {};
for (const [date, at] of Object.entries(POST_AT)) {
  real[date] = ids.map((id) => prepareLane({ doc: cut(id, at), date, slate, roster, asOf: at }));
  for (const p of real[date]) if (p.refused) throw new Error(`${p.laneId} ${date} refused: ${p.refused}`);
}

// Fixtures: engine event logs (append), projected by the engine. TEST only, never a package.
const body = (e) => { const { schema: _s, seq: _q, prevSha256: _p, sha256: _h, ...b } = e; return b; };
const frozenOf = (id) => body(logs[id].find((e) => e.type === "CARD_FROZEN"));
const ev = (type, date, step, extra) => ({ type, date, step, at: `${date}T${type === "CARD_FROZEN" ? "06:00" : "23:00"}:00Z`, source: "TEST", ...extra });
const prev2 = new Date(Date.parse(`${D}T12:00:00Z`) - 2 * 864e5).toISOString().slice(0, 10);
const settled = (step, before, after, date = prev) => ev("STEP_SETTLED", date, step, { outcome: "WIN", bankrollBeforeCents: before, bankrollAfterCents: after });
const payout = (date, step, stake) => ev("PAYOUT_COMPUTED", date, step, { result: "VERIFIED", fixture: true, stakeCents: stake, grossPayoutCents: stake * 3, profitCents: stake * 2 });
const build = (id, events) => events.reduce((acc, e) => append(acc, e), [logs[id][0]]);
/** Shown as it would read once prices are approved: the run's bankroll and pace unwithheld (the engine withholds both until then). */
function postP1(id, events, bankrollCents) {
  const d = laneProjection(id, [events]);
  const r = d.runs.at(-1);
  const due = r.stepsWon ? MILESTONES[d.product][r.stepsWon - 1] : d.baseCents;
  Object.assign(r, { trackedBankrollCents: bankrollCents, trackedBankrollWithheld: null, pace: { withheld: null, milestoneCents: due, onPace: bankrollCents >= due, behindByCents: Math.max(0, due - bankrollCents), requiredMultiplier: null } });
  Object.assign(d.current, { trackedBankrollCents: bankrollCents, trackedBankrollWithheld: null, pace: r.pace });
  return sealProjection(d);
}
const fx = {
  // Step 1 won ($100 → $300, on its milestone); step 2 is today's real lane B card, staked.
  "bb-b-step2-active": postP1("bb-b", build("bb-b", [settled(1, 10000, 30000), { ...frozenOf("bb-b"), step: 2 }, payout(D, 2, 30000)]), 30000),
  // Two steps won below the milestones ($25 → $52.25 → $109.20 vs $180): behind pace, today's real card held (unpriced).
  "ms-b-step3": postP1("ms-b", build("ms-b", [settled(1, 2500, 5225, prev2), settled(2, 5225, 10920), { ...frozenOf("ms-b"), step: 3 }, ev("STATUS", D, 3, { status: "UNPRICED", reason: "TEST" })]), 10920),
  // LOST: step 1 won, step 2 is the real Nov 2 bb-a card, staked, settled on the real finals (NY won, DEN lost).
  "bb-a-lost": postP1("bb-a", build("bb-a", [settled(1, 10000, 30000), { ...frozenOf("bb-a"), step: 2 }, payout(D, 2, 30000),
    ...logs["bb-a"].filter((e) => e.type === "LEG_SETTLED").map((e) => ({ ...body(e), step: 2 })),
    ev("STEP_SETTLED", next, 2, { outcome: "LOSS", bankrollBeforeCents: 30000, bankrollAfterCents: 0 }), ev("STATUS", next, 2, { status: "BUSTED", reason: "LANE A — BUSTED AT STEP 2 OF 5" })]), 30000),
};

// A TEST prop card (engine shape, market "player-prop"): four cleared scorers in four games, each with a made-up
// probability and line, added to a resealed TEST copy of the frozen file. Props carry no probability in real files yet.
const lane = slate(D).lane;
const props = [];
for (const g of lane.games) {
  if (props.length === 4) break;
  for (const side of ["away", "home"]) {
    const p = [...(g.players?.[side] ?? [])].sort((x, y) => (y.medians?.pts ?? 0) - (x.medians?.pts ?? 0)).find((x) => !x.injuryStatus && x.medians?.pts >= 10 && !roster.__guard?.[String(x.providerAthleteId)]?.length && !(roster.__cells?.[String(x.providerAthleteId)] ?? []).includes("pts") && !(roster[g[side].abbr] ?? []).some((e) => e?.review && String(e.id) === String(x.providerAthleteId)));
    if (p) { props.push({ legId: `nba:${g.providerEventId}:pts:${p.providerAthleteId}`, sport: "nba", eventId: String(g.providerEventId), gameId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "player-prop", prop: { playerId: String(p.providerAthleteId), playerName: p.name, stat: "pts", side: "over", line: Math.max(0.5, Math.round(p.medians.pts) - 2.5) }, selection: { code: side, teamAbbr: g[side].abbr }, probability: 0.55, probabilityShown: "55%", guard: { state: "pass", flags: [], flagText: [] } }); break; }
  }
}
const tf = structuredClone(file);
delete tf.contentSha256;
tf.label = "TEST FIXTURE: prop legs added by bb-social for layout samples";
tf.legs = [...tf.legs, ...props];
tf.contentSha256 = crypto.createHash("sha256").update(JSON.stringify(tf)).digest("hex");
put("lanes/test/suggested-cards-props-TEST.json", `${JSON.stringify(tf, null, 2)}\n`);
const propFrozen = { ...frozenOf("ms-a"), card: { ...frozenOf("ms-a").card, cardId: "test-props", sourceCardId: null, suggestedCardsSha256: tf.contentSha256, legs: props.map(({ sport: _s, eventId: _e, ...l }) => l) } };
fx["ms-a-props"] = laneProjection("ms-a", [build("ms-a", [propFrozen, payout(D, 1, 2500)])]);
for (const [id, d] of Object.entries(fx)) put(`lanes/test/${id}.json`, `${JSON.stringify(d, null, 2)}\n`);

const sample = (name, doc, date, o = {}) => { const p = prepareLane({ doc, date, slate, roster, asOf, ...o }); if (p.refused) throw new Error(`${name} refused: ${p.refused}`); return { name, card: p.card, p }; };
const items = [
  ...Object.entries(real).flatMap(([date, ps]) => ps.map((p) => ({ name: `${p.laneId}-${date}-real`, card: p.card }))),
  sample(`bb-a-${D}-priced-SAMPLE`, cut("bb-a", asOf), D, { samplePayout: { grossCents: 32800, profitCents: 22800, fixture: true } }),
  sample(`bb-b-${D}-step2-active-TEST`, fx["bb-b-step2-active"], D, { testData: true, samplePayout: { grossCents: 90000, profitCents: 60000, fixture: true } }),
  sample(`ms-b-${D}-step3-behind-pace-TEST`, fx["ms-b-step3"], D, { testData: true }),
  sample(`bb-a-${next}-lost-TEST`, fx["bb-a-lost"], next, { testData: true }),
  sample(`ms-a-${D}-props-priced-SAMPLE-TEST`, fx["ms-a-props"], D, { testData: true, slate: slateReader([tf]), samplePayout: { grossCents: 32500, profitCents: 30000, fixture: true } }),
];

const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  if (a.preview) { await writeSamples(items, { outDir: a.preview, browser, preview: true }); } else {
    const pngs = await writeSamples(items, { outDir: path.join(out, "samples"), browser, scales: [1, 2] });
    const lanesRef = Object.fromEntries(ids.map((id) => [id, logRef(id)]));
    const staged = [];
    for (const [date, ps] of Object.entries(real)) staged.push(...await writeStaging(planPackages(ps, date), { outRoot: path.join(out, "staging"), browser, lanesRef }));
    // The production path must refuse the fixture price and every TEST history, in a full two-image package attempt.
    const refusals = [];
    for (const it of items.filter((i) => i.p)) {
      const d = it.p.view.date;
      const partner = (real[d] ?? real[D]).filter((p) => p.laneId.slice(0, 2) === it.p.laneId.slice(0, 2) && p.laneId !== it.p.laneId);
      try { await writeStaging(planPackages([it.p, ...partner], d), { outRoot: path.join(out, "staging-must-refuse"), browser }); refusals.push({ sample: it.name, refused: false }); } catch (e) { refusals.push({ sample: it.name, refused: true, reason: e.message.split("\n").slice(1).join(" ").trim() }); }
    }
    fs.rmSync(path.join(out, "staging-must-refuse"), { recursive: true, force: true });
    const index = { source: "engine run logs cut at the posting instant, projected by laneProjection, shown by laneDisplay", logs: Object.fromEntries(ids.map((id) => [id, { ref: logRef(id), head: logs[id].at(-1).sha256 }])), postAt: POST_AT, suggestedCards: file.contentSha256, pngs, staged: staged.map((s) => ({ dir: s.dir, packageId: s.manifest.packageId, laneStatus: s.manifest.laneStatus, needsFounderReview: s.manifest.needsFounderReview, media: s.manifest.media.map((m) => `${m.order}:${m.file}:${m.sha256.slice(0, 12)}`) })), fixtureRefusals: refusals };
    put("samples-index.json", `${JSON.stringify(index, null, 2)}\n`);
    console.log(JSON.stringify(index.staged, null, 1), JSON.stringify(refusals.map((r) => [r.sample, r.refused])));
  }
} finally { await browser.close(); }
