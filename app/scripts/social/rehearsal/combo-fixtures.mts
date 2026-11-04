// BANK BUILDER / MOONSHOT SOCIAL FIXTURES. Writes, under --out (outside the repo):
//   real/<date>/<product>.json   the daily-candidates engine's verdict for that slate as a social-combo@1 document
//                                (today every NBA leg lacks a calibrated probability, so these are NO_QUALIFYING_COMBINATION)
//   test/<date>/<product>.json   TEST combos (testData: true) whose legs are real lane rows: real players, games and
//                                projections, guard-cleared, with made-up model targets. They exist to exercise the card,
//                                checks and package path; the card prints a TEST ribbon and the package is variant "test".
//
//   GTP_DATA_COMMIT=<sha holding the lanes> npx tsx scripts/social/rehearsal/combo-fixtures.mts \
//       --dates 2026-11-02,2026-11-03,2026-11-04 --as-of-hour 15 --roster-2026-11-02 <roster.json> --out <dir>
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { laneBytes } from "../render-combo-cards.mjs";
import { assertPrivateOutDir } from "../nba-line-graphics-io.mjs";
import { COMBO_STATE, SOCIAL_COMBO_SCHEMA, comboFromDailyCandidate, laneValueOf, sealCombo } from "../../../src/lib/social/combo-social.mjs";
import { POLICY } from "../../../src/lib/products/daily-candidates/policy.mjs";
import { REASON_COPY, buildDailyCandidate } from "../../../src/lib/products/daily-candidates/engine.mjs";
import { nbaInputs } from "../../../src/lib/products/daily-candidates/load.mjs";
import { eloWinProbabilityOf } from "../../../src/lib/sports/nba/elo-win-probability.mjs";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const out = assertPrivateOutDir(arg("out") ?? "");
const dates = String(arg("dates") ?? "").split(",").filter(Boolean);
const hour = Number(arg("as-of-hour") ?? 15);
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const put = (rel: string, o: unknown) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`); return f; };

/** Pure: guard-cleared player rows of one lane, most expected minutes first. */
function clearedPlayers(lane: any, roster: any, market: string) {
  const rows = [];
  for (const g of lane.games) for (const side of ["away", "home"]) for (const p of g.players?.[side] ?? []) {
    const id = String(p.providerAthleteId); const team = g[side].abbr;
    if (p.injuryStatus || roster.__guard?.[id]?.length || (roster.__cells?.[id] ?? []).includes(market)) continue;
    if ((roster[team] ?? []).some((e: any) => e?.review && String(e.id) === id)) continue;
    if (typeof laneValueOf(p, market) !== "number") continue;
    rows.push({ g, side, p, team, opp: g[side === "home" ? "away" : "home"].abbr });
  }
  return rows.sort((a, b) => b.p.expectedMinutes - a.p.expectedMinutes || String(a.p.providerAthleteId).localeCompare(String(b.p.providerAthleteId)));
}
const playerLeg = (r: any, market: string, target: any) => ({
  legId: `nba:${r.g.providerEventId}:${market}:${r.p.providerAthleteId}`, eventId: String(r.g.providerEventId), tipUtc: r.g.tipUtc, kind: "PLAYER_PROJECTION",
  team: r.team, opponent: r.opp, player: { id: String(r.p.providerAthleteId), name: r.p.name }, market, projection: laneValueOf(r.p, market),
  target, modelProbability: null, probabilityBasis: null, availability: { status: null, guard: [] },
});

function testCombos(date: string, lane: any, laneRef: any, roster: any, rosterRef: any, asOf: string) {
  const base = { schema: SOCIAL_COMBO_SCHEMA, sport: "nba", slateDate: date, asOf, testData: true, source: { lane: laneRef, roster: rosterRef }, state: COMBO_STATE.CARD, reasons: [] };
  // Bank Builder: the biggest-minutes cleared scorer at a target a quarter under his median, plus the slate's most one-sided favourite in another game.
  const pts = clearedPlayers(lane, roster, "pts");
  const fav = lane.games.map((g: any) => ({ g, wp: eloWinProbabilityOf(g) })).filter((x: any) => x.wp && x.g.elo.state === "FAVOURED")
    .map((x: any) => ({ ...x, side: x.g.elo.favoured === x.g.home.abbr ? "home" : "away" })).sort((a: any, b: any) => b.wp[b.side] - a.wp[a.side]);
  const w = fav[0];
  const p1 = pts.find((r) => r.g !== w.g)!;
  const bb = sealCombo({ ...base, product: "bank-builder", policyId: POLICY["bank-builder"].id, combination: {
    legs: [playerLeg(p1, "pts", { direction: "AT_LEAST", value: Math.floor(laneValueOf(p1.p, "pts") * 0.75), source: "MODEL" }),
      { legId: `nba:${w.g.providerEventId}:winner:${w.g[w.side].abbr}`, eventId: String(w.g.providerEventId), tipUtc: w.g.tipUtc, kind: "GAME_WINNER", team: w.g[w.side].abbr, opponent: w.g[w.side === "home" ? "away" : "home"].abbr, player: null, market: "winner", projection: w.wp[w.side], target: null, modelProbability: null, probabilityBasis: null, availability: { status: null, guard: [] } }],
    risk: { tier: "CONSERVATIVE", jointModelProbability: null, basis: null }, pricing: { state: "MODEL_ONLY" } } });
  // Moonshot: four cleared players from four different games, mixed markets, each at a target a quarter above his median.
  const used = new Set<string>(); const legs = [];
  for (const market of ["pts", "reb", "ast", "pra"]) {
    const r = clearedPlayers(lane, roster, market).find((x) => !used.has(String(x.g.providerEventId)));
    if (!r) break;
    used.add(String(r.g.providerEventId));
    legs.push(playerLeg(r, market, { direction: "AT_LEAST", value: Math.ceil(laneValueOf(r.p, market) * 1.25), source: "MODEL" }));
  }
  const ms = sealCombo({ ...base, product: "moonshot", policyId: POLICY.moonshot.id, combination: { legs, risk: { tier: "LONGSHOT", jointModelProbability: null, basis: null }, pricing: { state: "MODEL_ONLY" } } });
  return { bb, ms };
}

const index: any[] = [];
for (const date of dates) {
  let l: any = null;
  try { l = laneBytes(date); } catch (e: any) { index.push({ date, lane: "NONE", note: e.message.split("\n")[0] }); }
  const asOf = `${date}T${String(hour + 5).padStart(2, "0")}:00:00Z`; // hour ET (EST, after Nov 2 DST end)
  if (!l) {
    for (const product of ["bank-builder", "moonshot"]) put(`real/${date}/${product}.json`, sealCombo({ schema: SOCIAL_COMBO_SCHEMA, product, sport: "nba", slateDate: date, asOf, testData: false, policyId: POLICY[product as "moonshot"].id, source: {}, state: COMBO_STATE.NONE, reasons: [{ code: "NO_LANE", text: `no committed NBA lane for ${date} at the data commit` }], combination: null }));
    continue;
  }
  const lane = JSON.parse(l.bytes.toString("utf8"));
  const laneRef = { ref: l.rel, sha256: sha(l.bytes) };
  // The real engine on a scratch app root that holds just this lane (it reads <appRoot>/public/data/nba/...).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "combo-root-"));
  fs.mkdirSync(path.join(root, "public/data/nba/experimental-public"), { recursive: true });
  fs.writeFileSync(path.join(root, "public/data/nba/experimental-public", `${date}.json`), l.bytes);
  const { legs, notes } = nbaInputs({ appRoot: root, productDay: date, env: {} });
  for (const product of ["bank-builder", "moonshot"]) {
    const r = buildDailyCandidate({ product, productDay: date, asOf, inputs: legs, sourceNotes: notes });
    const f = put(`real/${date}/${product}.json`, comboFromDailyCandidate(r, { reasonCopy: REASON_COPY, laneRef }));
    index.push({ date, product, real: f, engineStatus: r.status, considered: r.counts.considered, eligible: r.counts.eligible, cardReasons: r.cardReasons, legFailures: Object.fromEntries(Object.entries(r.legTypes).map(([k, v]: any) => [k, v.failureCounts])) });
  }
  fs.rmSync(root, { recursive: true, force: true });
  const rp = arg(`roster-${date}`);
  if (!rp) { index.push({ date, test: "SKIPPED", note: "no roster for the guard" }); continue; }
  const rb = fs.readFileSync(rp);
  const { bb, ms } = testCombos(date, lane, laneRef, JSON.parse(rb.toString("utf8")), { ref: path.basename(rp), sha256: sha(rb) }, asOf);
  index.push({ date, test: [put(`test/${date}/bank-builder.json`, bb), put(`test/${date}/moonshot.json`, ms)] });
}
put("fixtures-index.json", index);
console.log(JSON.stringify(index, null, 1));
