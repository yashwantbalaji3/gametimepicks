// BBM V3 STATE MATRIX (founder design directive 2026-11-04): the V3 ladder in every lane state, both products, built as
// engine event logs (append) from the real Nov 4 lane runs and projected by the engine. TEST-ribboned; never a package.
// States: step 1 active, step 3 active (two won), step 2 won, lost at step 2, held (no card), held (unpriced card),
// completed, finished short. A won bankroll is shown as it would read once prices are approved (unwithheld), so TEST.
//
//   GTP_DATA_COMMIT=<main sha with the lane> npx tsx scripts/social/rehearsal/bbm-v3-matrix.mjs --private-root <dir> \
//       --suggested-cards <file> --roster <roster.json> --as-of <ISO> --out <dir outside the repo>
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../render-social-pack.mjs";
import { prepareLane, slateReader, writeSamples } from "../render-bbm.mjs";
import { sealProjection } from "../../../src/lib/social/bbm-lane.mjs";
import { parseEvents } from "../../../src/lib/challenge-lanes/chain.mjs";
import { append, MILESTONES } from "../../../src/lib/challenge-lanes/lanes.mjs";
import { laneProjection } from "../../../src/lib/challenge-lanes/projection.mjs";

const a = parseArgs(process.argv.slice(2));
const file = JSON.parse(fs.readFileSync(a["suggested-cards"], "utf8"));
const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
const D = file.productDay;
const day = (n) => new Date(Date.parse(`${D}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const log = (id) => parseEvents(fs.readFileSync(path.join(a["private-root"], id, "run-1.jsonl"), "utf8"));
const body = (e) => { const { schema: _s, seq: _q, prevSha256: _p, sha256: _h, ...b } = e; return b; };
const ev = (type, date, step, extra) => ({ type, date, step, at: `${date}T${type === "CARD_FROZEN" ? "06:00" : "23:00"}:00Z`, source: "TEST", ...extra });
const won = (step, date, before, after) => ev("STEP_SETTLED", date, step, { outcome: "WIN", bankrollBeforeCents: before, bankrollAfterCents: after });
const build = (id, events) => events.reduce((acc, e) => append(acc, e), [log(id)[0]]);
const frozen = (id, step) => ({ ...body(log(id).find((e) => e.type === "CARD_FROZEN")), step });
const cardLegs = (id) => log(id).find((e) => e.type === "CARD_FROZEN").card.legs;
/** As it reads once prices are approved: the run's bankroll and pace unwithheld (the engine withholds both until then). */
function shown(id, events, bankrollCents) {
  const d = laneProjection(id, [events]);
  const r = d.runs.at(-1);
  const due = r.stepsWon ? MILESTONES[d.product][Math.min(r.stepsWon, 5) - 1] : d.baseCents;
  const pace = { withheld: null, milestoneCents: due, nextMilestoneCents: MILESTONES[d.product][Math.min(r.stepsWon, 4)], onPace: bankrollCents >= due, behindByCents: Math.max(0, due - bankrollCents), requiredMultiplier: null };
  Object.assign(r, { trackedBankrollCents: bankrollCents, trackedBankrollWithheld: null, pace });
  Object.assign(d.current, { trackedBankrollCents: bankrollCents, trackedBankrollWithheld: null, pace });
  return sealProjection(d);
}
const M = (id) => MILESTONES[id.startsWith("bb") ? "bank-builder" : "moonshot"];

const states = [];
for (const id of ["bb-a", "ms-a"]) {
  const base = id.startsWith("bb") ? 10000 : 2500; const m = M(id);
  const wins = (n) => Array.from({ length: n }, (_, i) => won(i + 1, day(i - n), i ? m[i - 1] : base, m[i]));
  states.push(
    [`${id}-step1-active`, laneProjection(id, [build(id, [frozen(id, 1)])]), D],
    [`${id}-step3-active`, shown(id, build(id, [...wins(2), frozen(id, 3)]), m[1]), D],
    [`${id}-step2-won`, shown(id, build(id, [...wins(1), frozen(id, 2), ev("PAYOUT_COMPUTED", D, 2, { result: "VERIFIED", fixture: true, inputs: { stakeCents: m[0] } }), ...cardLegs(id).map((l) => ev("LEG_SETTLED", D, 2, { legId: l.legId, gameId: l.gameId, outcome: "WIN", final: null })), won(2, D, m[0], m[1])]), m[1]), D],
    [`${id}-lost-step2`, shown(id, build(id, [...wins(1), frozen(id, 2), ev("PAYOUT_COMPUTED", D, 2, { result: "VERIFIED", fixture: true, inputs: { stakeCents: m[0] } }), ...cardLegs(id).map((l, i) => ev("LEG_SETTLED", D, 2, { legId: l.legId, gameId: l.gameId, outcome: i ? "WIN" : "LOSS", final: null })), ev("STEP_SETTLED", D, 2, { outcome: "LOSS", bankrollBeforeCents: m[0], bankrollAfterCents: 0 }), ev("STATUS", day(1), 2, { status: "BUSTED", reason: "TEST" })]), m[0]), day(1)],
    [`${id}-held-no-card`, shown(id, build(id, [...wins(1), ev("STATUS", D, 2, { status: "NO_ELIGIBLE_CARD", reason: "TEST" })]), m[0]), D],
    [`${id}-held-unpriced`, laneProjection(id, [build(id, [frozen(id, 1), ev("STATUS", D, 1, { status: "UNPRICED", reason: "TEST" })])]), D],
    [`${id}-completed`, shown(id, build(id, [...wins(5), ev("STATUS", day(1), 5, { status: "COMPLETE", reason: "TEST" })]), m[4] + 50000), day(1)],
    [`${id}-finished-short`, shown(id, build(id, [...wins(4), won(5, day(0), m[3], m[3] + 1000), ev("STATUS", day(1), 5, { status: "FINISHED_SHORT", reason: "TEST" })]), m[3] + 1000), day(1)],
  );
}
const slate = slateReader([file]);
const items = []; const report = [];
for (const [name, doc, date] of states) {
  const p = prepareLane({ doc, date, slate, roster, asOf: a["as-of"], testData: true, design: "v3" });
  report.push({ name, refused: p.refused ?? null, view: p.view?.view, badge: p.view?.badge, step: p.view?.step, rungs: p.view?.rungs?.map((r) => r.state) });
  if (!p.refused) items.push({ name, card: p.card });
}
const { chromium } = await import("playwright");
const browser = await chromium.launch();
try { await writeSamples(items, { outDir: a.out, browser }); } finally { await browser.close(); }
fs.writeFileSync(path.join(a.out, "matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const r of report) console.log(`${r.name}: ${r.refused ? `REFUSED ${r.refused}` : `${r.view} ${r.badge} step ${r.step} [${r.rungs.join(" ")}]`}`);
