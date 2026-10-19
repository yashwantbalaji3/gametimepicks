#!/usr/bin/env node
/**
 * Generates nba-sim-v1-fixture.json — a TEST FIXTURE for the NBA Simulation Theater, NOT model output.
 *
 * It exists only so the theater can be built and reviewed before the nba-sim-v1-coherent engine lands. It follows the
 * engine's OUTPUT CONTRACT (shape and every per-draw invariant) but the numbers come from a toy generator below (normal
 * team scores, a random quarter split, OT until untied, a random but coherent player allocation). It says nothing about
 * these games. The artifact is marked `fixture: true`; the theater renders it only under its TEST FIXTURE banner.
 *
 * Deterministic: same script → byte-identical file. Player names and ids come from the committed roster capture
 * (data/internal/research/nba/rosters/latest.json), so the layout sees realistic name lengths.
 *
 * Run (from app/): node src/lib/simulation-theater/nba/__fixtures__/generate-nba-fixture.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../../..");
const OUT = path.join(HERE, "nba-sim-v1-fixture.json");
const N = 4000;

// opening night 2026-27 (schedule capture app/public/data/nba/schedule/latest.json); mu = the toy generator's mean scores
const GAMES = [
  { id: "401909088", dateUtc: "2026-10-20T19:00Z", venue: "Little Caesars Arena", home: ["DET", "Detroit Pistons", "8"], away: ["BOS", "Boston Celtics", "2"], mu: [115, 112], upset: true },
  { id: "401909089", dateUtc: "2026-10-20T23:00Z", venue: "Madison Square Garden", home: ["NYK", "New York Knicks", "18"], away: ["PHI", "Philadelphia 76ers", "20"], mu: [117, 109], upset: false },
  { id: "401909090", dateUtc: "2026-10-21T01:30Z", venue: "Frost Bank Center", home: ["SAS", "San Antonio Spurs", "24"], away: ["OKC", "Oklahoma City Thunder", "25"], mu: [113, 116], upset: true },
];

function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (r) => { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

/** Integer split of `total` by weights (largest remainder; deterministic). */
function split(total, weights, cap = Infinity) {
  const w = weights.map((x) => Math.max(0, x));
  const W = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (total * x) / W);
  const out = raw.map((x) => Math.min(cap, Math.floor(x)));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
  while (left > 0) { let moved = false; for (const i of order) { if (left > 0 && out[i] < cap && w[i] > 0) { out[i]++; left--; moved = true; } } if (!moved) break; }
  return out;
}

function draw(r, mu) {
  const shared = normal(r) * 6;
  const team = mu.map((m) => Math.max(70, Math.round(m + shared + normal(r) * 10)));
  const qs = team.map((pts) => split(pts, [0, 0, 0, 0].map(() => 1 + normal(r) * 0.12)));
  const periods = [0, 1, 2, 3].map((i) => ({ home: qs[0][i], away: qs[1][i] }));
  let [h, a] = team;
  let guard = 0;
  while (h === a && guard < 8) {
    let oh = Math.max(0, Math.round(10 + normal(r) * 3));
    let oa = Math.max(0, Math.round(10 + normal(r) * 3));
    if (guard === 7 && oh === oa) oh += 1; // cap: the 8th OT is forced untied (recorded rule)
    periods.push({ home: oh, away: oa });
    h += oh; a += oa; guard++;
  }
  return { home: h, away: a, periods };
}

const quant = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const summary = (xs) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const r1 = (v) => Math.round(v * 10) / 10;
  return { p10: quant(xs, 0.1), p25: quant(xs, 0.25), p50: quant(xs, 0.5), p75: quant(xs, 0.75), p90: quant(xs, 0.9), mean: r1(mean), sd: r1(sd) };
};
const histogram = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([value, c]) => ({ value, probability: Math.round((c / xs.length) * 1e6) / 1e6 }));
};

function rosterFor(roster, abbr) {
  const t = roster.teams.find((x) => x.canonicalTricode === abbr);
  return (t?.players ?? []).filter((p) => p.rosterStatusType === "active" || p.rosterStatus === "Active").slice(0, 12)
    .map((p) => ({ providerAthleteId: p.providerAthleteId, name: p.displayName }));
}

function allocate(r, pts, ot, roster) {
  // team box: 3PM ≈ 13, FTM ≈ 17 % of points, the rest in twos (parity fixed through FTM)
  let threePm = Math.max(4, Math.round(pts * 0.115 + normal(r) * 2));
  let ftm = Math.max(4, Math.round(pts * 0.16 + normal(r) * 3));
  if ((pts - 3 * threePm - ftm) % 2 !== 0) ftm += 1;
  const twoPm = (pts - 3 * threePm - ftm) / 2;
  const threePa = threePm + Math.max(threePm, Math.round(threePm * 1.65 + normal(r) * 3));
  const fgm = threePm + twoPm;
  const reb = Math.max(30, Math.round(44 + normal(r) * 5));
  const ast = Math.min(fgm, Math.max(10, Math.round(fgm * 0.62 + normal(r) * 3)));
  // minutes: 10-man rotation in tenths of a minute (Σ = 2400 + 250·OT exactly, cap 480 + 50·OT), last two DNP
  const rot = roster.slice(0, 10);
  const dnp = roster.slice(10, 12);
  const base = [34, 33, 32, 30, 28, 24, 20, 16, 13, 10].map((m) => m * (1 + normal(r) * 0.08));
  const tenths = split(2400 + 250 * ot, base, 480 + 50 * ot);
  const wPts = base.map((m, i) => m * (1.6 - i * 0.1) * (1 + normal(r) * 0.25));
  const s3 = split(threePm, wPts.map((w, i) => w * (i % 3 === 0 ? 1.3 : 1)));
  const s3x = split(threePa - threePm, wPts.map((w, i) => w * (i % 3 === 0 ? 1.3 : 1)));
  const s2 = split(twoPm, wPts.map((w, i) => w * (i % 4 === 1 ? 1.4 : 1)));
  const sft = split(ftm, wPts);
  const sreb = split(reb, base.map((m, i) => m * (i % 5 === 4 || i === 1 ? 1.8 : 1)));
  const sast = split(ast, base.map((m, i) => m * (i === 0 || i === 2 ? 2.2 : 1)));
  const players = rot.map((p, i) => ({
    providerAthleteId: p.providerAthleteId, name: p.name, minutes: tenths[i] / 10,
    pts: 3 * s3[i] + 2 * s2[i] + sft[i], reb: sreb[i], ast: sast[i], threePa: s3[i] + s3x[i], threePm: s3[i], twoPm: s2[i], ftm: sft[i],
  }));
  for (const p of dnp) players.push({ providerAthleteId: p.providerAthleteId, name: p.name, minutes: 0, pts: 0, reb: 0, ast: 0, threePa: 0, threePm: 0, twoPm: 0, ftm: 0 });
  return { team: { pts, reb, ast, threePa, threePm, twoPm, ftm, fgm }, players };
}

const roster = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/rosters/latest.json"), "utf8"));
const games = GAMES.map((G) => {
  const seed = hash(`fixture:${G.id}`).toString(16).padStart(8, "0");
  const r = rng(parseInt(seed, 16));
  const draws = Array.from({ length: N }, () => draw(r, G.mu));
  const margins = draws.map((d) => d.home - d.away);
  const totals = draws.map((d) => d.home + d.away);
  const mM = quant(margins, 0.5), mT = quant(totals, 0.5);
  const sdM = summary(margins).sd || 1, sdT = summary(totals).sd || 1;
  const pHome = margins.filter((m) => m > 0).length / N;
  const nearest = (cands, key) => cands.reduce((best, i) => (best == null || key(i) < key(best) - 1e-12 ? i : best), null);
  const idx = draws.map((_, i) => i);
  const dist = (i, m, t) => ((margins[i] - m) / sdM) ** 2 + ((totals[i] - t) / sdT) ** 2;
  const regMargin = (i) => draws[i].periods.slice(0, 4).reduce((a, p) => a + p.home - p.away, 0);
  const pick = {
    typical: [nearest(idx, (i) => dist(i, mM, mT)), "draw whose (margin, total) is nearest the medians (standardised distance; lowest index on ties)"],
    close: [nearest(idx.filter((i) => Math.abs(regMargin(i)) === Math.min(...idx.map((j) => Math.abs(regMargin(j))))), (i) => Math.abs(totals[i] - mT)), "draw with the smallest |regulation margin| (an overtime draw counts as 0), then total nearest the median"],
    high: [nearest(idx, (i) => dist(i, mM, quant(totals, 0.9))), "draw nearest (median margin, 90th-percentile total)"],
    low: [nearest(idx, (i) => dist(i, mM, quant(totals, 0.1))), "draw nearest (median margin, 10th-percentile total)"],
  };
  const favHome = pHome >= 0.5;
  const upsetIdx = idx.filter((i) => (favHome ? margins[i] < 0 : margins[i] > 0));
  if (G.upset && upsetIdx.length) pick.upset = [nearest(upsetIdx, (i) => Math.abs(Math.abs(margins[i]) - Math.abs(mM)) + Math.abs(totals[i] - mT) / sdT), "among draws the pre-game underdog wins, the one nearest |median margin| and the median total"];
  const samples = Object.entries(pick).map(([label, [i, rule]]) => {
    const d = draws[i];
    const ot = d.periods.length - 4;
    const ar = rng(hash(`${seed}:${i}`));
    const H = allocate(ar, d.home, ot, rosterFor(roster, G.home[0]));
    const A = allocate(ar, d.away, ot, rosterFor(roster, G.away[0]));
    return {
      runIndex: i, label, selectionRule: rule, final: { home: d.home, away: d.away },
      periods: d.periods.map((p, k) => ({ period: k + 1, label: k < 4 ? `Q${k + 1}` : `OT${k - 3}`, home: p.home, away: p.away })),
      overtimePeriods: ot, team: { home: H.team, away: A.team }, players: { home: H.players, away: A.players },
    };
  });
  return {
    providerEventId: G.id, label: "NBA — TEST FIXTURE", seasonType: 2, dateUtc: G.dateUtc, venue: G.venue, neutralSite: false,
    home: { name: G.home[1], abbr: G.home[0], providerTeamId: G.home[2] },
    away: { name: G.away[1], abbr: G.away[0], providerTeamId: G.away[2] },
    forecast: {
      modelVersion: "nba-sim-v1-coherent", providerEventId: G.id, inputAsOf: "2026-10-19T12:00:00Z", simulations: N, seed,
      seedPolicy: "fixture: hash('fixture:' + providerEventId)",
      engine: { structure: "TEST FIXTURE toy generator (normal team scores → random quarter split → OT until untied → random coherent allocation); NOT the nba-sim-v1 engine", simulations: N, seed, seedPolicy: "fixture" },
      sim: {
        pHome: Math.round(pHome * 1e4) / 1e4, pAway: Math.round((1 - pHome) * 1e4) / 1e4, tieMass: 0,
        overtimeRate: Math.round((draws.filter((d) => d.periods.length > 4).length / N) * 1e4) / 1e4,
        home: summary(draws.map((d) => d.home)), away: summary(draws.map((d) => d.away)), margin: summary(margins), total: summary(totals),
        totalHistogram: histogram(totals), marginHistogram: histogram(margins),
      },
      representativeSamples: samples,
      players: { home: [], away: [] },
      invariants: { checkedDraws: N, violations: 0 },
    },
  };
});

const artifact = {
  schemaVersion: 1, artifact: "nba-experimental-forecasts", fixture: true,
  fixtureNote: "TEST FIXTURE — not model output. Generated by __fixtures__/generate-nba-fixture.mjs from a toy generator so the theater can be built before nba-sim-v1-coherent exists. The numbers say nothing about these games.",
  dataClass: "PRIVATE_RESEARCH", productEligible: false, modelVersion: "nba-sim-v1-coherent", family: "v1-fixture",
  generatedAt: "2026-10-19T12:00:00Z", inputAsOf: "2026-10-19T12:00:00Z", date: "2026-10-20", games,
};
fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 1)}\n`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${games.length} games, samples ${games.map((g) => g.forecast.representativeSamples.map((s) => `${s.label}#${s.runIndex}${s.overtimePeriods ? `(OT${s.overtimePeriods})` : ""}`).join(",")).join(" | ")}`);
