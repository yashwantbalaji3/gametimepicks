/**
 * REPLAY_NOT_PUBLISHED — the v0.7 candidate on the exact as-of inputs of frozen slates, against frozen v0.1 and v0.3.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Rules, constants and bars: docs/nba/NBA_V07_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md. Output is never a receipt, a
 * ledger row, a lane or a sample toward any preregistered count. Writes ONLY to --out-dir, which must be outside the repo.
 *
 *   npx tsx scripts/nba/research/replay-nba-v07-candidate.mjs --mode <mode> --out-dir <dir outside the repo> [--bootstrap 2000] [--simulations 10000]
 *
 * Modes:
 *   projections-only  joins NO outcome. Proves v0.1 and v0.3 re-derive and every v0.7 side reconciles. The only mode to use
 *                     before the preregistration commit is pushed.
 *   seen-regression   the one permitted replay on seen games, 10-22 to 10-31. REGRESSION CHECK ONLY, never forward evidence.
 *                     It cannot select a variant: this module has no variants, and buildV07Context takes no overrides.
 *   forward           slates dated 2026-11-03 and later. Below 30 games it reports the count and scores nothing.
 */
import fs from "node:fs";
import path from "node:path";

import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { gatePool } from "../../../src/lib/sports/nba/roster-gated-pool.mjs";
import { prepareRoster, mulberry32 } from "../../../src/lib/sports/nba/game-sim.mjs";
import { prepareRosterV03 } from "../../../src/lib/sports/nba/game-sim-v03.mjs";
import { gatePoolV03, indexRoleHistory } from "../../../src/lib/sports/nba/minutes-model-v03.mjs";
import { buildV07Context, gatePoolV07, prepareRosterV07, REMOVAL_EVIDENCE } from "../../../src/lib/sports/nba/minutes-model-v07.mjs";
import { simulatePreparedV07 } from "../../../src/lib/sports/nba/game-sim-v07.mjs";
import { LANES, NBA, outDirOrRefuse, readBoxDir, readJson, receiptInputs } from "./nba-v07-inputs.mjs";

const FORWARD_FIRST_SLATE = "2026-11-03";
const FIRST_REVIEW_GAMES = 30;
const SEEN = Object.freeze({ from: "2026-10-22", to: "2026-10-31" });
const MIN_CLUSTERS = 10;

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
const MODE = arg("--mode");
if (!["projections-only", "seen-regression", "forward"].includes(MODE)) refuse("--mode projections-only | seen-regression | forward is required");
let OUT;
try { OUT = outDirOrRefuse(arg("--out-dir")); } catch (e) { refuse(e.message); }
const B = Number(arg("--bootstrap") ?? 2000);
const SIMS = Number(arg("--simulations") ?? 10000);
const JOIN_OUTCOMES = MODE !== "projections-only";

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(1)));
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/* ---------- load ---------- */
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const docById = JOIN_OUTCOMES ? new Map(foldBoxscores(corpusBox, fetchedBox, { now: "2099-01-01T00:00:00Z" }).docs.map((d) => [String(d.providerEventId), d])) : new Map();
const lastGrade = new Map();
if (JOIN_OUTCOMES) for (const e of readJson(path.join(NBA, "experimental-v0.1", "ledger.json")).gradeEntries ?? []) lastGrade.set(String(e.providerEventId), e);

const allDates = fs.readdirSync(LANES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= "2026-10-20").sort();
const dates = MODE === "seen-regression" ? allDates.filter((d) => d >= SEEN.from && d <= SEEN.to) : MODE === "forward" ? allDates.filter((d) => d >= FORWARD_FIRST_SLATE) : allDates;
const v01Docs = new Map(), v03Docs = new Map();
const receipts = [];
for (const date of dates) {
  const f1 = path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`);
  const f3 = path.join(NBA, "experimental-v0.3", "forecasts", `${date}.json`);
  if (fs.existsSync(f1)) { const d = readJson(f1); v01Docs.set(date, d); for (const g of d.games) receipts.push(g.receipt); }
  if (fs.existsSync(f3)) v03Docs.set(date, readJson(f3));
}
if (MODE === "forward") {
  const scored = [...v01Docs.values()].flatMap((d) => d.games).filter((g) => docById.get(String(g.providerEventId))?.boxscoreAvailable && lastGrade.get(String(g.providerEventId))?.status === "GRADED").length;
  if (scored < FIRST_REVIEW_GAMES) {
    fs.mkdirSync(OUT, { recursive: true });
    const note = `FIRST_REVIEW_NOT_REACHED: ${scored} forward games graded, ${FIRST_REVIEW_GAMES} needed. Nothing scored.`;
    fs.writeFileSync(path.join(OUT, "report.md"), `${note}\n`);
    console.log(note);
    process.exit(0);
  }
}
const inputsOf = receiptInputs(receipts);

/* ---------- replay ---------- */
const rows = [], sides = [], feedSkews = [];
const fidelity = { v01Sides: 0, v01Match: 0, v03Sides: 0, v03Match: 0, v01Mismatch: [], v03Mismatch: [] };

for (const date of dates) {
  const doc = v01Docs.get(date);
  if (!doc) continue;
  const v03ById = new Map((v03Docs.get(date)?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const byFreeze = new Map();
  for (const g of doc.games) { const k = g.receipt.generatedAt; if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
  for (const [now, games] of byFreeze) {
    const { rosters, injuries: injDoc } = inputsOf(games[0].receipt);
    if (!rosters || !injDoc) refuse(`${date} @ ${now}: no git blob for the receipt's ${!rosters ? "rosters" : "injuries"} sha256`);
    const injuries = injDoc.entries ?? null;
    const fold = foldBoxscores(corpusBox, fetchedBox, { now });
    const roleIdx = indexRoleHistory(fold.docs, { asOfDateUtc: now, population: "regular" });
    // The receipt hashed this feed, so it is the freeze's input even where its stamp ticks past the freeze. Counted, not
    // hidden. Entries stated after the instant still drop.
    const feedStamp = injDoc.sourceAsOf ?? injDoc.generatedAt ?? null;
    const skewSeconds = (Date.parse(feedStamp ?? now) - Date.parse(now)) / 1000;
    if (skewSeconds > 0) feedSkews.push({ date, now, feedStamp, skewSeconds });
    const context = buildV07Context({ boxscores: fold.docs, injuries, injuriesAsOf: null, asOfDateUtc: now });
    const cache = new Map();
    for (const g of games) {
      const gameId = String(g.providerEventId);
      const box = docById.get(gameId) ?? null;
      const graded = !!(box?.boxscoreAvailable && lastGrade.get(gameId)?.status === "GRADED");
      const v03G = v03ById.get(gameId) ?? null;
      const prepared = {};
      const gameRows = [];
      for (const sideKey of ["home", "away"]) {
        const s = g[sideKey];
        const teamId = String(s.providerTeamId);
        const frozenPlayers = g.forecast.players[sideKey];
        const frozenMin = g.forecast.assumptions.minutes[sideKey];
        const gV01 = gatePool({ rosters, providerTeamId: teamId, boxscores: corpusBox, asOfDateUtc: now, injuries, population: "regular", teamMinutesCache: cache });
        if (gV01.state !== "GATED") refuse(`${date} ${gameId} ${sideKey}: v0.1 gate ${gV01.reason}`);
        const pV01 = prepareRoster(gV01);
        const f1 = new Map(frozenPlayers.map((p) => [String(p.providerAthleteId), p]));
        fidelity.v01Sides += 1;
        if (pV01.players.length === frozenPlayers.length && pV01.assumptions.minutes.rescaleFactor === frozenMin.rescaleFactor && pV01.players.every((p) => f1.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes)) fidelity.v01Match += 1;
        else fidelity.v01Mismatch.push(`${date}:${gameId}:${sideKey}`);
        const gV03 = gatePoolV03({ rosters, providerTeamId: teamId, boxscores: fold.docs, asOfDateUtc: now, injuries, population: "regular", roleIndex: roleIdx });
        const pV03 = prepareRosterV03(gV03);
        const replay3 = new Map(pV03.players.map((p) => [String(p.providerAthleteId), p]));
        let f3 = null;
        if (v03G) {
          f3 = new Map(v03G.forecast.players[sideKey].map((p) => [String(p.providerAthleteId), p]));
          fidelity.v03Sides += 1;
          if (pV03.players.length === f3.size && pV03.players.every((p) => f3.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes)) fidelity.v03Match += 1;
          else fidelity.v03Mismatch.push(`${date}:${gameId}:${sideKey}`);
        }
        const gV07 = gatePoolV07({ rosters, providerTeamId: teamId, context });
        if (gV07.state !== "GATED") refuse(`${date} ${gameId} ${sideKey}: v0.7 gate ${gV07.reason}`);
        const pV07 = prepareRosterV07(gV07);
        prepared[sideKey] = pV07;
        const v07Rows = new Map(gV07.rows.map((r) => [r.providerAthleteId, r]));
        const v07Live = new Map(pV07.players.map((p) => [p.providerAthleteId, p]));

        const boxPlayers = (box?.players ?? []).filter((p) => String(p.providerTeamId) === teamId);
        const ids = new Map();
        for (const r of gV01.rows) ids.set(String(r.providerAthleteId), r.name);
        for (const r of gV07.rows) ids.set(r.providerAthleteId, r.name);
        for (const a of boxPlayers) if (a.providerAthleteId != null && !ids.has(String(a.providerAthleteId))) ids.set(String(a.providerAthleteId), a.name);
        const prepV01 = new Map(pV01.players.map((p) => [String(p.providerAthleteId), p]));
        for (const [id, name] of ids) {
          const a = boxPlayers.find((x) => String(x.providerAthleteId) === id) ?? null;
          const played = !!(a && !a.didNotPlay && Number.isInteger(a.minutes) && a.minutes > 0);
          const r7 = v07Rows.get(id) ?? null;
          const l7 = v07Live.get(id) ?? null;
          const row = {
            date, gameId, teamId, team: s.abbr, sideKey, id, name, graded, played, actual: played ? a.minutes : 0, starter: played && a.starter === true,
            pts: played ? a.pts : null, reb: played ? a.reb : null, ast: played ? a.ast : null, hasV03Frozen: !!f3,
            v01: prepV01.get(id)?.expectedMinutes ?? null, v01P50: f1.get(id) ? { pts: f1.get(id).pts?.p50, reb: f1.get(id).reb?.p50, ast: f1.get(id).ast?.p50 } : null,
            v03: f3 ? (f3.get(id)?.expectedMinutes ?? null) : null, v03Q: replay3.get(id)?.playRate ?? null,
            v03P50: f3?.get(id) ? { pts: f3.get(id).pts?.p50, reb: f3.get(id).reb?.p50, ast: f3.get(id).ast?.p50 } : null,
            v07: l7?.expectedMinutes ?? null, v07Q: r7?.projectedPlayProbability ?? null, v07NoProjection: r7?.noProjectionReason ?? null, v07Removal: r7?.removalEvidence ?? null,
            v07State: r7?.eligibilityState ?? null, injuryStatus: r7?.injuryStatus ?? null, onRoster: !!r7, v07Q10Q90: null,
          };
          rows.push(row); gameRows.push(row);
        }
        const rc = pV07.reconciliation;
        sides.push({ date, gameId, team: s.abbr, teamId, sideKey, graded, now, hasV03Frozen: !!v03G, unallocated: rc.unallocatedMinutes, expectedOnProjected: rc.expectedOnProjected, lift: rc.liftPlaced, cut: rc.cut, S: rc.rawPlayRateWeighted, coverage: pV07.coverage, noProjection: pV07.noProjection.length });
      }
      const sim = simulatePreparedV07({ providerEventId: gameId, home: prepared.home, away: prepared.away, simulations: SIMS });
      const q = new Map();
      for (const k of ["home", "away"]) for (const p of sim.players[k]) q.set(`${g[k].providerTeamId}|${p.providerAthleteId}`, { minutes: p.minutes, pts: p.pts, reb: p.reb, ast: p.ast });
      for (const r of gameRows) r.v07Q10Q90 = q.get(`${r.teamId}|${r.id}`) ?? null;
    }
  }
  console.error(`${date}: rows ${rows.length}`);
}
if (fidelity.v01Mismatch.length) refuse(`v0.1 does not re-derive: ${fidelity.v01Mismatch.slice(0, 8).join(" ")}`);
if (fidelity.v03Mismatch.length) refuse(`v0.3 does not re-derive: ${fidelity.v03Mismatch.slice(0, 8).join(" ")}`);
fs.mkdirSync(OUT, { recursive: true });

/* ---------- output helpers ---------- */
const LABEL = { "projections-only": "PROJECTIONS ONLY. No outcome joined.", "seen-regression": "SEEN-DATA REPLAY. REGRESSION CHECK ONLY. NOT FORWARD EVIDENCE.", forward: "FORWARD WINDOW. Code-frozen replay with no receipt." }[MODE];
const L = [];
const say = (s = "") => L.push(s);
const table = (head, lines) => { say(`| ${head.join(" | ")} |`); say(`|${head.map(() => "---").join("|")}|`); for (const l of lines) say(`| ${l.join(" | ")} |`); say(); };
const summary = { marker: "REPLAY_NOT_PUBLISHED", mode: MODE, label: LABEL, dataClass: "PRIVATE_RESEARCH", productEligible: false, fidelity: { v01: `${fidelity.v01Match}/${fidelity.v01Sides}`, v03: `${fidelity.v03Match}/${fidelity.v03Sides}` } };
say(`# v0.7 replay output: ${MODE}`); say(LABEL);
say(`fidelity: v0.1 sides ${fidelity.v01Match}/${fidelity.v01Sides}, v0.3 sides ${fidelity.v03Match}/${fidelity.v03Sides}`);
say(`feeds stamped after their freeze: ${JSON.stringify(feedSkews)}`); say();

const recon = sides.map((s) => s.expectedOnProjected + s.unallocated);
const unalloc = sides.map((s) => s.unallocated).sort((a, b) => a - b);
say("## reconciliation (all sides, no outcomes)");
say(`sides ${sides.length}; Σ q·minutes + unallocated: min ${Math.min(...recon)}, max ${Math.max(...recon)}; under-full sides ${sides.filter((s) => s.unallocated > 0).length}; unallocated median ${unalloc[unalloc.length >> 1]}, mean ${r1(mean(unalloc))}, max ${unalloc.at(-1)}; mean lift placed ${r2(mean(sides.map((s) => s.lift)))}; mean cut ${r2(mean(sides.map((s) => s.cut)))}`);
const lanePool = rows.filter((r) => r.v07 != null);
say(`v0.7 rows ${lanePool.length}; max projected ${Math.max(...lanePool.map((r) => r.v07))}; rows ≥ 41: ${lanePool.filter((r) => r.v07 >= 41).length}; rows with no projection ${rows.filter((r) => r.v07NoProjection).length}; rows Out in feed ${rows.filter((r) => r.v07Removal === REMOVAL_EVIDENCE.OUT_IN_FEED).length}`);
{
  const c = sides.flatMap((s) => s.coverage.roles);
  const count = (role) => { const m = {}; for (const x of c.filter((y) => y.role === role)) { const k = x.reason ?? x.status; m[k] = (m[k] ?? 0) + 1; } return m; };
  say(`last-lineup proxy, all sides: starters ${JSON.stringify(count("STARTER"))}; sixth men ${JSON.stringify(count("SIXTH_MAN"))}; rotation ${JSON.stringify(count("ROTATION"))}`);
}
say();

if (!JOIN_OUTCOMES) {
  fs.writeFileSync(path.join(OUT, "projections-report.md"), L.join("\n"));
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(L.join("\n"));
  process.exit(0);
}

/* ---------- evaluation ---------- */
function bootStat(rs, fn, { seed = 7 } = {}) {
  const by = new Map();
  for (const r of rs) { if (!by.has(r.gameId)) by.set(r.gameId, []); by.get(r.gameId).push(r); }
  const cl = [...by.values()];
  const est = fn(rs);
  if (cl.length === 0 || est == null) return { n: rs.length, clusters: cl.length, mean: null, lo: null, hi: null, label: "NO_DATA" };
  const rng = mulberry32(seed);
  const reps = [];
  for (let b = 0; b < B; b += 1) { const s = []; for (let i = 0; i < cl.length; i += 1) { const c = cl[Math.floor(rng() * cl.length)]; for (const x of c) s.push(x); } const v = fn(s); if (v != null && Number.isFinite(v)) reps.push(v); }
  reps.sort((a, b) => a - b);
  const lo = reps[Math.floor(0.025 * reps.length)], hi = reps[Math.min(reps.length - 1, Math.floor(0.975 * reps.length))];
  return { n: rs.length, clusters: cl.length, mean: r3(est), lo: r3(lo), hi: r3(hi), label: cl.length < MIN_CLUSTERS ? "FEW_CLUSTERS" : (lo > 0 || hi < 0) ? "EXCLUDES_0" : "INCLUDES_0" };
}
const ci = (c) => (c.mean == null ? "n/a" : c.label === "FEW_CLUSTERS" ? `${c.mean} FEW_CLUSTERS` : `${c.mean} (${c.lo}, ${c.hi})`);
const games = (rs) => new Set(rs.map((r) => r.gameId)).size;
const err = (r, k) => Math.abs(r[k] - r.actual);
const pairDelta = (rs, a, b) => bootStat(rs, (s) => mean(s.map((r) => err(r, a) - err(r, b))));

const W = rows.filter((r) => r.graded && r.hasV03Frozen);
say(`## population\ngames ${games(W)}, rows ${W.length}`); say();

// A. minutes
const common = W.filter((r) => r.played && r.v01 != null && r.v03 != null && r.v07 != null);
const maeOf = (k) => bootStat(common, (s) => mean(s.map((r) => err(r, k))));
const biasOf = (rs, k) => bootStat(rs, (s) => mean(s.map((r) => r[k] - r.actual)));
const extOf = (k) => bootStat(common, (s) => 100 * mean(s.map((r) => (err(r, k) >= 15 ? 1 : 0))));
say(`## A minutes, played rows all three project: ${common.length} rows, ${games(common)} games`);
table(["Family", "MAE", "Bias", "Err ≥ 15 per 100"], [["v0.1 frozen", "v01"], ["v0.3 frozen", "v03"], ["v0.7 replay", "v07"]].map(([n, k]) => [n, ci(maeOf(k)), ci(biasOf(common, k)), ci(extOf(k))]));
const dMae = pairDelta(common, "v07", "v03");
const mae07 = maeOf("v07");
const bias07 = biasOf(common, "v07");
const dExt = bootStat(common, (s) => 100 * mean(s.map((r) => (err(r, "v07") >= 15 ? 1 : 0) - (err(r, "v03") >= 15 ? 1 : 0))));
say(`ΔMAE v0.7 − v0.3 ${ci(dMae)}; v0.7 − v0.1 ${ci(pairDelta(common, "v07", "v01"))}. Δ err ≥ 15 per 100, v0.7 − v0.3 ${ci(dExt)}`);
const pops = { starters: (r) => r.starter, bench: (r) => !r.starter, top34: (r) => r.v07 >= 34 };
const biasPop = {};
for (const [n, f] of Object.entries(pops)) { const rs = common.filter(f); biasPop[n] = biasOf(rs, "v07"); say(`${n}: rows ${rs.length}, bias v0.3 ${ci(biasOf(rs, "v03"))}, bias v0.7 ${ci(biasPop[n])}, ΔMAE ${ci(pairDelta(rs, "v07", "v03"))}`); }
say();

// B. unconditional
const uncond = (r, mu, q) => Math.abs((mu == null ? 0 : mu * (q ?? 1)) - r.actual);
const sideRows = [];
for (const [k, list] of Map.groupBy(W.filter((r) => r.onRoster || r.played || r.v01 != null), (r) => `${r.gameId}|${r.teamId}`)) {
  const o = { gameId: k.split("|")[0], v01: 0, v03: 0, v07: 0 };
  for (const r of list) { o.v01 += uncond(r, r.v01, 1); o.v03 += uncond(r, r.v03, r.v03Q); o.v07 += uncond(r, r.v07, r.v07Q); }
  sideRows.push(o);
}
const dUm = bootStat(sideRows, (s) => mean(s.map((r) => r.v07 - r.v03)));
say("## B unconditional minutes error per team-game");
table(["Family", "Per team-game"], ["v01", "v03", "v07"].map((k) => [k, ci(bootStat(sideRows, (s) => mean(s.map((r) => r[k]))))]));
say(`Δ v0.7 − v0.3 ${ci(dUm)}`); say();

// C. participation
const part = W.filter((r) => r.v03 != null);
const yy = (r) => (r.played ? 1 : 0);
const qs = { v03: (r) => r.v03Q, v07: (r) => r.v07Q ?? 0 };
const brier = (r, q) => (q - yy(r)) ** 2;
const dB = bootStat(part, (s) => mean(s.map((r) => brier(r, qs.v07(r)) - brier(r, qs.v03(r)))));
const ece = (rs, q) => { const bins = Array.from({ length: 10 }, () => ({ n: 0, q: 0, y: 0 })); for (const r of rs) { const b = bins[Math.min(9, Math.floor(q(r) * 10))]; b.n += 1; b.q += q(r); b.y += yy(r); } return bins.reduce((s, b) => s + (b.n ? (b.n / rs.length) * Math.abs(b.q / b.n - b.y / b.n) : 0), 0); };
const ece07 = ece(part, qs.v07);
say(`## C participation, rows in the frozen v0.3 pool: ${part.length}`);
table(["Family", "Brier", "ECE, 10 equal bins"], Object.entries(qs).map(([k, f]) => [k, ci(bootStat(part, (s) => mean(s.map((r) => brier(r, f(r)))))), r3(ece(part, f))]));
say(`Brier Δ v0.7 − v0.3 ${ci(dB)}`); say();

// D. coverage
const sixth = new Set();
for (const [, list] of Map.groupBy(W.filter((r) => r.played && !r.starter), (r) => `${r.gameId}|${r.teamId}`)) { const b = [...list].sort((a, c) => c.actual - a.actual)[0]; if (b) sixth.add(b); }
const covOf = (list, k) => list.filter((r) => r[k] != null).length;
const starters = W.filter((r) => r.starter), sixthRows = [...sixth], allPlayed = W.filter((r) => r.played);
say("## D coverage: played rows the family projected");
table(["Family", `Starters of ${starters.length}`, `Sixth men of ${sixthRows.length}`, `All who played of ${allPlayed.length}`], [["v0.1", "v01"], ["v0.3", "v03"], ["v0.7", "v07"]].map(([n, k]) => [n, covOf(starters, k), covOf(sixthRows, k), covOf(allPlayed, k)]));
const reasons = {};
for (const r of allPlayed.filter((x) => x.v07 == null)) { const c = r.v07NoProjection ?? r.v07Removal ?? (r.onRoster ? "UNEXPLAINED" : "NOT_ON_ROSTER_CAPTURE"); reasons[c] = (reasons[c] ?? 0) + 1; }
say(`played with no v0.7 projection, by reason: ${JSON.stringify(reasons)}`); say();

// E. dependent stats
const statRows = common.filter((r) => r.v01P50?.pts != null && r.v03P50?.pts != null && r.v07Q10Q90?.pts?.p50 != null);
say(`## E dependent stats, medians. ${statRows.length} rows, ${games(statRows)} games`);
const dV03 = {}, dV01 = {};
table(["Stat", "MAE v0.3", "MAE v0.7", "Δ v0.7 − v0.3", "Δ v0.7 − v0.1", "Bias v0.7"], ["pts", "reb", "ast"].map((k) => {
  const e7 = (r) => Math.abs(r.v07Q10Q90[k].p50 - r[k]);
  dV03[k] = bootStat(statRows, (s) => mean(s.map((r) => e7(r) - Math.abs(r.v03P50[k] - r[k]))));
  dV01[k] = bootStat(statRows, (s) => mean(s.map((r) => e7(r) - Math.abs(r.v01P50[k] - r[k]))));
  return [k, ci(bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r.v03P50[k] - r[k]))))), ci(bootStat(statRows, (s) => mean(s.map(e7)))), ci(dV03[k]), ci(dV01[k]), ci(bootStat(statRows, (s) => mean(s.map((r) => r.v07Q10Q90[k].p50 - r[k]))))];
}));

// F. interval calibration, conditional on playing
const covered = (k, actual) => { const rs = W.filter((r) => r.played && r.v07Q10Q90?.[k]?.p10 != null); return { n: rs.length, share: mean(rs.map((r) => (actual(r) >= r.v07Q10Q90[k].p10 && actual(r) <= r.v07Q10Q90[k].p90 ? 1 : 0))) }; };
const cal = { minutes: covered("minutes", (r) => r.actual), pts: covered("pts", (r) => r.pts), reb: covered("reb", (r) => r.reb), ast: covered("ast", (r) => r.ast) };
say("## F p10 to p90 coverage, played rows");
table(["Market", "Rows", "Share inside"], Object.entries(cal).map(([k, c]) => [k, c.n, r3(c.share)]));

// G. bars
const high = { v03: W.filter((r) => r.v03 >= 41).length, v07: W.filter((r) => r.v07 >= 41).length };
const shareOf = (list) => (list.length ? covOf(list, "v07") / list.length : 0);
const inBand = (x, lo, hi) => x >= lo && x <= hi;
const bars = [
  ["B1", "Minutes: MAE ≤ 6.0 and ΔMAE v0.7 − v0.3 interval below 0", `${ci(mae07)}; ${ci(dMae)}`, mae07.mean <= 6 && dMae.hi < 0],
  ["B2", "Unconditional minutes Δ v0.7 − v0.3 interval below 0", ci(dUm), dUm.hi < 0],
  ["B3", "Bias: abs ≤ 1.0 with an interval covering 0", ci(bias07), Math.abs(bias07.mean) <= 1 && bias07.lo <= 0 && bias07.hi >= 0],
  ["B4", "Bias by population: starters, bench and rows ≥ 34 each abs ≤ 2.0", Object.entries(biasPop).map(([k, c]) => `${k} ${ci(c)}`).join("; "), Object.values(biasPop).every((c) => c.mean != null && Math.abs(c.mean) <= 2)],
  ["B5", "Starter coverage: no fewer than v0.3 and at least 0.97", `${covOf(starters, "v07")} vs ${covOf(starters, "v03")}, share ${r3(shareOf(starters))}`, covOf(starters, "v07") >= covOf(starters, "v03") && shareOf(starters) >= 0.97],
  ["B6", "Sixth-man coverage: no fewer than v0.3 and at least 0.97", `${covOf(sixthRows, "v07")} vs ${covOf(sixthRows, "v03")}, share ${r3(shareOf(sixthRows))}`, covOf(sixthRows, "v07") >= covOf(sixthRows, "v03") && shareOf(sixthRows) >= 0.97],
  ["B7", "Pts: vs v0.3 interval upper ≤ +0.05; vs v0.1 interval below 0", `${ci(dV03.pts)}; ${ci(dV01.pts)}`, dV03.pts.hi <= 0.05 && dV01.pts.hi < 0],
  ["B8", "Reb: vs v0.3 and v0.1 interval upper ≤ +0.05", `${ci(dV03.reb)}; ${ci(dV01.reb)}`, dV03.reb.hi <= 0.05 && dV01.reb.hi <= 0.05],
  ["B9", "Ast: vs v0.3 and v0.1 interval upper ≤ +0.05", `${ci(dV03.ast)}; ${ci(dV01.ast)}`, dV03.ast.hi <= 0.05 && dV01.ast.hi <= 0.05],
  ["B10", "Calibration: p10–p90 share in [0.76, 0.84] for minutes, pts, reb, ast; participation ECE ≤ 0.05; Brier Δ vs v0.3 interval upper ≤ 0", `${Object.entries(cal).map(([k, c]) => `${k} ${r3(c.share)}`).join(", ")}; ECE ${r3(ece07)}; ${ci(dB)}`, Object.values(cal).every((c) => inBand(c.share, 0.76, 0.84)) && ece07 <= 0.05 && dB.hi <= 0],
  ["B11", "Large errors: Δ err ≥ 15 per 100 vs v0.3 interval upper ≤ +0.5; rows ≥ 41 no more than v0.3", `${ci(dExt)}; ${high.v07} vs ${high.v03}`, dExt.hi <= 0.5 && high.v07 <= high.v03],
  ["B12", "Integrity: every side reconciles within 0.02; every played row with no projection has a reason code", `${r2(Math.min(...recon))} to ${r2(Math.max(...recon))}; unexplained ${reasons.UNEXPLAINED ?? 0}`, recon.every((x) => Math.abs(x - 240) <= 0.02) && !reasons.UNEXPLAINED],
];
say(`## G bars. ${LABEL}`);
if (MODE === "seen-regression") say("Passing a bar here validates nothing. These are the same bars the forward window uses, shown for a regression read.");
table(["Bar", "Rule", "Result", "Met"], bars.map(([a, b, c, d]) => [a, b, c, d ? "yes" : "NO"]));
summary.bars = bars.map(([a, b, c, d]) => ({ bar: a, rule: b, result: c, met: d }));
summary.games = games(W);
if (MODE === "forward") { summary.allBarsMet = bars.every((b) => b[3]); say(`All bars met: ${summary.allBarsMet ? "yes" : "NO"}. No single metric promotes. This permits a founder review and arms nothing.`); }

fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
console.log(L.join("\n"));
