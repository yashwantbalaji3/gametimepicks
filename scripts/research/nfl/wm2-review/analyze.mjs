/**
 * World Model V2 game review (docs/research/nfl/world-model-v2-reviews/). PRIVATE research; reads only frozen records.
 *
 * Usage: node scripts/research/nfl/wm2-review/analyze.mjs <work-dir> [<repo-checkout>]
 *   <work-dir> holds: worlds-<eventId>.json (the run's 10,000 worlds, dumped by re-running the builder at the producing
 *   commit with WM2_DUMP=<file> — the run reproduces exactly; the write-once guard refuses to overwrite the run file),
 *   frozen-<eventId>.json (the committed artifact), summary.json (ESPN game summary), grades-scratch.json (grade.mjs output).
 *   <repo-checkout>: a checkout of main for the market capture. Written for TB @ DAL (401872980); event id is fixed below.
 */
import fs from "node:fs";
const P = process.argv[2], W = process.argv[3];
const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const dump = J(`${P}/worlds-401872980.json`), A = J(`${P}/frozen-401872980.json`), S = J(`${P}/summary.json`);
const grades = J(`${P}/grades-scratch.json`).rows.filter((r) => r.providerEventId === "401872980");
const V = (o) => Float64Array.from(Object.values(o));
const sim = dump.sim, N = 10000;
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const share = (xs, f) => xs.filter(f).length / xs.length;
const out = { reproduction: {}, game: {}, team: {}, players: [], markets: [] };
// ── reproduction check against the frozen artifact
const home = V(sim.game.home), away = V(sim.game.away);
const margin = home.map((h, i) => h - away[i]), total = home.map((h, i) => h + away[i]);
const repro = { pHome: share(margin, (m) => m > 0), pAway: share(margin, (m) => m < 0), homeMed: q(home, .5), awayMed: q(away, .5), homeMean: +mean(home).toFixed(2), awayMean: +mean(away).toFixed(2), marginMean: +mean(margin).toFixed(2), totalMean: +mean(total).toFixed(2) };
const frozenG = { pHome: A.game.winProbability.home, pAway: A.game.winProbability.away, homeMed: A.game.home.median, awayMed: A.game.away.median, homeMean: A.game.home.mean, awayMean: A.game.away.mean, marginMean: A.game.margin.mean, totalMean: A.game.total.mean };
let famChecks = 0, famMismatch = [];
const team = [0, 1], abbr = ["TB", "DAL"];
for (const si of team) dump.members[si].forEach((m, i) => {
  const pl = A.players.find((p) => p.playerId === `nfl-athlete-${m.espn}`); if (!pl) return;
  const w = sim.team[si].players[i];
  for (const [fam, key] of [["receivingYards", "recYds"], ["receptions", "rec"], ["rushingYards", "rushYds"], ["passingYards", "passYds"]]) {
    const e = pl.families[fam]; if (!e) continue; famChecks++;
    const xs = V(w[key]); const mu = +mean(xs).toFixed(2);
    if (Math.abs(mu - e.mean) > 0.011) famMismatch.push(`${m.name} ${fam} ${mu} vs ${e.mean}`);
  }
});
out.reproduction = { frozen: frozenG, recomputed: repro, playerFamiliesChecked: famChecks, mismatches: famMismatch };
// ── game evaluation
const act = { TB: 24, DAL: 16 }; const aM = act.DAL - act.TB, aT = 40;
const pct = (xs, v) => +(share(xs, (x) => x < v) + 0.5 * share(xs, (x) => x === v)).toFixed(4); // mid-rank PIT
const inc = A.forecastOfRecord.winProbability;
const ll = (p) => +(-Math.log(p)).toFixed(4);
out.game = {
  wm2: { pDAL: frozenG.pHome, pTB: frozenG.pAway, pTie: A.game.winProbability.tie, brierBinaryDAL: +((frozenG.pHome - 0) ** 2).toFixed(4), brier3: +(frozenG.pHome ** 2 + (1 - frozenG.pAway) ** 2 + A.game.winProbability.tie ** 2).toFixed(4), logLossTB: ll(frozenG.pAway) },
  incumbent: { pDAL: inc.home, pTB: inc.away, pTie: inc.tie, brierBinaryDAL: +(inc.home ** 2).toFixed(4), brier3: +(inc.home ** 2 + (1 - inc.away) ** 2 + inc.tie ** 2).toFixed(4), logLossTB: ll(inc.away) },
  coinFlip: { brierBinary: 0.25, logLoss: 0.6931 },
  pit: { tbPoints: pct(away, act.TB), dalPoints: pct(home, act.DAL), marginHome: pct(margin, aM), total: pct(total, aT) },
  intervals: { tbPoints: [A.game.away.p10, A.game.away.p90], dalPoints: [A.game.home.p10, A.game.home.p90], marginHome: [A.game.margin.p10, A.game.margin.p90], total: [A.game.total.p10, A.game.total.p90] },
  tails: { pTBwinBy8plus: +share(margin, (m) => m <= -8).toFixed(4), pDAL16orFewer: +share(home, (h) => h <= 16).toFixed(4), pTB24plus: +share(away, (a) => a >= 24).toFixed(4), pTotal40orFewer: +share(total, (t) => t <= 40).toFixed(4), pExact24_16: +share(margin.map((_, i) => i), (i) => away[i] === 24 && home[i] === 16).toFixed(4) },
  errors: { marginMeanErr: +(aM - frozenG.marginMean).toFixed(2), marginMedianErr: aM - A.game.margin.median, totalMeanErr: +(aT - frozenG.totalMean).toFixed(2), totalMedianErr: aT - A.game.total.median },
};
// ── team volume diagnostics
const box = Object.fromEntries(S.boxscore.teams.map((t) => [t.team.abbreviation, Object.fromEntries(t.statistics.map((s) => [s.name, s.displayValue]))]));
for (const si of team) {
  const t = sim.team[si], a = abbr[si], bx = box[a];
  const actual = { carries: +bx.rushingAttempts, rushYds: +bx.rushingYards, passAtt: +bx.completionAttempts.split("/")[1], completions: +bx.completionAttempts.split("/")[0], passYds: +bx.netPassingYards, offTd: a === "TB" ? 3 : 2, fg: a === "TB" ? 1 : 1 };
  const rows = {};
  for (const [k, v] of Object.entries(actual)) { const xs = V(t[k]); rows[k] = { actual: v, mean: +mean(xs).toFixed(1), p10: q(xs, .1), p50: q(xs, .5), p90: q(xs, .9), pit: pct(xs, v), pAtLeast: +share(xs, (x) => x >= v).toFixed(4) }; }
  out.team[a] = rows;
}
// note: ESPN netPassingYards is net of sacks; the sim's passYds is the passers' gross yards — compare passers below.
// ── players
const props = J(`${W}/app/public/data/nfl/markets/capture-20261008T2217.json`).propPrices;
const propRows = (Array.isArray(props) ? props : Object.values(props)).flat().filter((r) => r && r.canonicalEventId === "nfl-401872980");
const FAMKEY = { passingYards: ["passYds", "player_pass_yds"], rushingYards: ["rushYds", "player_rush_yds"], receivingYards: ["recYds", "player_reception_yds"], receptions: ["rec", "player_receptions"] };
for (const si of team) dump.members[si].forEach((m, i) => {
  const pid = `nfl-athlete-${m.espn}`; const pl = A.players.find((p) => p.playerId === pid); if (!pl) return;
  for (const fam of Object.keys(FAMKEY)) {
    const e = pl.families[fam]; if (!e) continue;
    const g = grades.find((r) => r.playerId === pid && r.family === fam);
    const xs = V(sim.team[si].players[i][FAMKEY[fam][0]]);
    const line = propRows.find((r) => r.playerId === pid && r.family === FAMKEY[fam][1]);
    const row = { player: pl.name, team: abbr[si], availability: pl.availability, family: fam, median: e.median, mean: e.mean, p10: e.p10, p90: e.p90, state: g?.state ?? "MISSING", actual: g?.actual ?? null };
    if (row.state === "GRADED") Object.assign(row, { absErrMedian: +Math.abs(row.actual - e.median).toFixed(1), signedErrMedian: +(row.actual - e.median).toFixed(1), absErrMean: +Math.abs(row.actual - e.mean).toFixed(1), in80: row.actual >= e.p10 && row.actual <= e.p90, pit: pct(xs, row.actual), ladderBrier: g.ladderBrier });
    if (line) { const pOver = share(xs, (x) => x > line.line); Object.assign(row, { line: line.line, book: line.sportsbook, lineCapturedAt: line.capturedAt, overOdds: line.overOdds, underOdds: line.underOdds, pOverModel: +pOver.toFixed(4), modelLean: pOver > 0.5 ? "OVER" : "UNDER", outcome: row.state === "GRADED" ? (row.actual > line.line ? "OVER" : row.actual < line.line ? "UNDER" : "PUSH") : "PENDING" }); if (row.outcome && row.outcome !== "PENDING") { row.leanMatched = row.modelLean === row.outcome; row.brierAtLine = +((pOver - (row.outcome === "OVER" ? 1 : 0)) ** 2).toFixed(4); } }
    out.players.push(row);
  }
});
// per-family summaries
const fams = {};
for (const r of out.players) {
  const f = (fams[r.family] ??= { eligible: 0, graded: 0, noLine: 0, pending: 0, absErr: [], signed: [], in80: 0, withLine: 0, lineGraded: 0, leanMatched: 0, pushes: 0, brierAtLine: [] });
  f.eligible++; if (r.state === "GRADED") { f.graded++; f.absErr.push(r.absErrMedian); f.signed.push(r.signedErrMedian); if (r.in80) f.in80++; } else if (r.state === "NO_LINE") f.noLine++; else f.pending++;
  if (r.line != null) { f.withLine++; if (r.outcome === "PUSH") f.pushes++; else if (r.outcome && r.outcome !== "PENDING") { f.lineGraded++; if (r.leanMatched) f.leanMatched++; f.brierAtLine.push(r.brierAtLine); } }
}
for (const f of Object.values(fams)) { f.mae = f.absErr.length ? +mean(f.absErr).toFixed(2) : null; f.meanSigned = f.signed.length ? +mean(f.signed).toFixed(2) : null; f.coverage80 = f.graded ? +(f.in80 / f.graded).toFixed(3) : null; f.meanBrierAtLine = f.brierAtLine.length ? +mean(f.brierAtLine).toFixed(4) : null; delete f.absErr; delete f.signed; delete f.brierAtLine; }
out.familySummary = fams;
// market game lines (pregame capture) for context
const mk = J(`${W}/app/public/data/nfl/markets/capture-20261008T2217.json`).rows.find((r) => r.providerEventId === "401872980");
out.marketGame = { capturedAt: "2026-10-08T22:17:03Z", books: mk.books.map((b) => ({ book: b.book, noVigDAL: b.noVigWinProb?.home, spreadDAL: b.spread?.line, total: b.total?.line })) };
const nv = out.marketGame.books.map((b) => b.noVigDAL).filter(Number.isFinite); out.marketGame.medianNoVigDAL = q(nv, .5); out.marketGame.logLossTB = ll(1 - q(nv, .5));
const sp = out.marketGame.books.map((b) => b.spreadDAL).filter(Number.isFinite), tl = out.marketGame.books.map((b) => b.total).filter(Number.isFinite);
out.marketGame.medianSpreadDAL = q(sp, .5); out.marketGame.medianTotal = q(tl, .5);
out.marketGame.wm2_pDALcover = +share(margin, (m) => m > -out.marketGame.medianSpreadDAL).toFixed(4); out.marketGame.wm2_pOverTotal = +share(total, (t) => t > out.marketGame.medianTotal).toFixed(4);
fs.writeFileSync(`${P}/analysis.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ reproduction: out.reproduction, game: out.game, marketGame: { ...out.marketGame, books: out.marketGame.books.length }, team: out.team, familySummary: out.familySummary }, null, 1));
