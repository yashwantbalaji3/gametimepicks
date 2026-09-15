#!/usr/bin/env node
/**
 * P331 — MLB venue run environment, walk-forward. DEV ONLY · SECOND LOOK (the 2026 record is SEEN).
 *
 * A pregame, non-market feature: for each game, the trailing mean total at its venue over games completed STRICTLY
 * before its date this season (committed StatsAPI linescores, venue from the committed boards), shrunk toward the
 * league mean to date with a prior of K games, expressed as a factor f = shrunkVenueMean / leagueMean. Nothing
 * from the target game or later enters its factor. This prints the raw signal only — how f relates to realised
 * totals and to the posted line on the seen 2026 record — so a candidate can be registered (or not) BEFORE any
 * engine scoring. No metric here is a bar.
 *
 * Usage: node scripts/research/mlb/venue-run-environment.mjs [--k 20] [--out data/internal/research/mlb/reports/venue-run-environment-dev.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const K = Number(argOf("--k") ?? 20);
const OUT = argOf("--out") ?? "data/internal/research/mlb/reports/venue-run-environment-dev.json";
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const corr = (xs, ys) => { const mx = meanOf(xs), my = meanOf(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; };
const slope = (xs, ys) => { const mx = meanOf(xs), my = meanOf(ys); let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxx ? sxy / sxx : null; };

/* venue by gamePk from every committed board (boards carry the venue string per game) */
const venueOf = new Map();
for (const f of fs.readdirSync(rel("app/public/data/mlb/boards")).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
  const b = JSON.parse(fs.readFileSync(rel(`app/public/data/mlb/boards/${f}`), "utf8"));
  for (const g of b.games ?? []) if (g.venue && g.gamePk != null) venueOf.set(String(g.gamePk), g.venue.trim());
}
/* finals in date order */
const games = [];
for (const f of fs.readdirSync(rel("data/internal/mlb/linescores")).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
  const j = JSON.parse(fs.readFileSync(rel(`data/internal/mlb/linescores/${f}`), "utf8"));
  for (const g of j.games ?? []) {
    if (!g.isFinal || !Number.isFinite(g.homeRuns) || !Number.isFinite(g.awayRuns)) continue;
    games.push({ gamePk: String(g.gamePk), date: f.slice(0, 10), total: g.homeRuns + g.awayRuns, venue: venueOf.get(String(g.gamePk)) ?? null });
  }
}
games.sort((a, b) => a.date.localeCompare(b.date) || a.gamePk.localeCompare(b.gamePk));

/* walk-forward: factors use games dated STRICTLY before the target date */
const byVenue = new Map(); let leagueSum = 0, leagueN = 0;
let cursor = 0;
const rows = [];
const dates = [...new Set(games.map((g) => g.date))];
for (const d of dates) {
  const todays = games.filter((g) => g.date === d);
  const leagueMean = leagueN ? leagueSum / leagueN : null;
  for (const g of todays) {
    const v = g.venue ? byVenue.get(g.venue) ?? { n: 0, sum: 0 } : null;
    const factor = leagueMean && v ? ((v.sum + K * leagueMean) / (v.n + K)) / leagueMean : null;
    rows.push({ ...g, leagueMeanBefore: leagueMean, venueN: v?.n ?? 0, factor });
  }
  for (const g of todays) { leagueSum += g.total; leagueN += 1; if (g.venue) { const v = byVenue.get(g.venue) ?? { n: 0, sum: 0 }; v.n += 1; v.sum += g.total; byVenue.set(g.venue, v); } }
  cursor += todays.length;
}

/* the seen graded record's posted lines, by gamePk */
const lineOf = new Map();
for (const l of fs.readFileSync(rel("app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l); if (r.market === "total" && r.line != null) lineOf.set(String(r.gamePk), r.line);
}

const usable = rows.filter((r) => r.factor != null && r.venueN >= 1);
const withLine = usable.filter((r) => lineOf.has(r.gamePk)).map((r) => ({ ...r, line: lineOf.get(r.gamePk) }));
const byMonth = {};
for (const r of usable) { const m = r.date.slice(0, 7); (byMonth[m] ??= []).push(r); }
const block = (list) => ({
  n: list.length,
  corrFactorActual: r4(corr(list.map((r) => r.factor), list.map((r) => r.total))),
  slopeActualOnFactorRuns: r4(slope(list.map((r) => r.factor * r.leagueMeanBefore), list.map((r) => r.total))),
  meanFactor: r4(meanOf(list.map((r) => r.factor))), sdFactor: r4(Math.sqrt(meanOf(list.map((r) => (r.factor - meanOf(list.map((x) => x.factor))) ** 2)))),
  meanVenueN: r4(meanOf(list.map((r) => r.venueN))),
});
const lined = {
  n: withLine.length,
  corrFactorLine: r4(corr(withLine.map((r) => r.factor), withLine.map((r) => r.line))),
  corrFactorActual: r4(corr(withLine.map((r) => r.factor), withLine.map((r) => r.total))),
  corrLineActual: r4(corr(withLine.map((r) => r.line), withLine.map((r) => r.total))),
  slopeActualOnLine: r4(slope(withLine.map((r) => r.line), withLine.map((r) => r.total))),
  slopeActualOnFactorRuns: r4(slope(withLine.map((r) => r.factor * r.leagueMeanBefore), withLine.map((r) => r.total))),
  /* what the line knows beyond the venue: residual correlation of actual with line after removing the factor's linear part */
  partialCorrLineGivenFactor: (() => { const f = withLine.map((r) => r.factor), l = withLine.map((r) => r.line), a = withLine.map((r) => r.total); const bl = slope(f, l), ba = slope(f, a); const mf = meanOf(f), ml = meanOf(l), ma = meanOf(a); const rl = l.map((x, i) => x - ml - bl * (f[i] - mf)), ra = a.map((x, i) => x - ma - ba * (f[i] - mf)); return r4(corr(rl, ra)); })(),
};
const report = {
  schemaVersion: 1, artifact: "mlb-venue-run-environment-dev", dataClass: "PRIVATE_RESEARCH", program: "331", generatedAt: new Date().toISOString(),
  status: "DEV_ONLY · SECOND_LOOK — raw signal of a walk-forward venue factor on the seen 2026 record; no candidate, no bar, no engine scoring",
  method: `factor = ((Σ venue totals before the date) + K·league mean before the date) / (n + K) / league mean; K = ${K}; season 2026 only (linescores from 2026-07-04); venue from the committed boards`,
  population: { finals: games.length, withVenue: games.filter((g) => g.venue).length, usable: usable.length, venues: byVenue.size, withPostedLine: withLine.length },
  overall: block(usable), byMonth: Object.fromEntries(Object.entries(byMonth).map(([m, l]) => [m, block(l)])), lined,
  topVenues: [...byVenue.entries()].map(([v, s]) => ({ venue: v, n: s.n, meanTotal: r4(s.sum / s.n) })).sort((a, b) => b.meanTotal - a.meanTotal).slice(0, 6),
  bottomVenues: [...byVenue.entries()].map(([v, s]) => ({ venue: v, n: s.n, meanTotal: r4(s.sum / s.n) })).sort((a, b) => a.meanTotal - b.meanTotal).slice(0, 6),
  reading: "corr(factor, actual) is the walk-forward signal; slopeActualOnFactorRuns near 1 would mean the venue mean is calibrated; corr(factor, line) says how much of the venue the books already price; partialCorrLineGivenFactor says how much the line knows beyond the venue (pitchers, lineups, weather).",
};
fs.mkdirSync(path.dirname(rel(OUT)), { recursive: true });
fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ population: report.population, overall: report.overall, lined: report.lined, byMonth: report.byMonth }, null, 1));
console.log("top", report.topVenues.map((v) => `${v.venue} ${v.meanTotal} (n${v.n})`).join(" · "));
console.log("bottom", report.bottomVenues.map((v) => `${v.venue} ${v.meanTotal} (n${v.n})`).join(" · "));
