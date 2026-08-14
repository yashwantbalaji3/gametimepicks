/**
 * NFL per-game simulations — the MLB-shaped artifact (Program 183 · Release F). PUBLIC_DERIVED.
 *
 * WHY THIS EXISTS, stated plainly because the reasoning was wrong for several programs. Earlier
 * work treated a PROMOTION bar ("does this beat a baseline?") as a PUBLICATION bar, and used its
 * failure to justify shipping no player numbers at all. That is stricter than the standard MLB
 * actually meets: MLB's own modeled markets were demoted for losing to the market, and MLB still
 * publishes per-player projections, distributions and a market comparison — labelled honestly.
 *
 * So this produces the same SHAPE for NFL: one artifact per game carrying a team simulation, a
 * per-player distribution for every supported family, and model probabilities at standard
 * thresholds. Every row is labelled for what it is.
 *
 * WHAT IS AND IS NOT COMPARABLE TO A MARKET:
 *   - TEAM markets have real captured lines, so moneyline/spread/total carry a genuine model-vs-
 *     market comparison in percentage points.
 *   - PLAYER markets are not offered by the provider for these games at all. Player rows therefore
 *     carry model probability at a STANDARD threshold and are labelled MODEL_ONLY_NO_MARKET. No
 *     line is synthesized and no difference is computed against a price that does not exist.
 *
 * THE JOINT PROCESS. One Monte Carlo per game: draw team pass/rush volume and offensive touchdowns,
 * draw each player's participation share from the P182 distribution, allocate opportunity, then draw
 * efficiency. Player outcomes are marginals of that one process, so they reconcile within every
 * draw — receptions never exceed completions, player touchdowns never exceed the team's, and the
 * unallocated share stays unallocated rather than being handed to recognizable names.
 *
 * Usage: node scripts/nfl/build-nfl-game-simulations.mjs --now <iso>
 * Writes: app/public/data/nfl/game-simulations/<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const RUNS = Number(arg("--runs", "10000"));
const read = (p, base = ROOT) => { try { return JSON.parse(fs.readFileSync(path.join(base, p), "utf8")); } catch { return null; } };

const index = read("public/data/nfl/index.json", APP);
const forecasts = read("public/data/nfl/forecasts/latest.json", APP);
const markets = read("public/data/nfl/markets/latest.json", APP);
if (!index?.events || !forecasts?.forecasts) { console.error("REFUSED: canonical index or forecast artifact unreadable"); process.exit(2); }

/**
 * Preseason efficiency, measured from the committed player-event corpus (preseason rows only).
 * Means and spreads are empirical, not assumed — every number here is reproducible from
 * data/internal/research/nfl/player-events-v1/.
 */
const EFF = Object.freeze({
  passYdsPerAtt: { m: 6.6631, s: 3.6998 }, cmpPerAtt: { m: 0.6304, s: 0.1751 }, passTdPerAtt: { m: 0.0365, s: 0.0748 },
  rushYdsPerAtt: { m: 4.4145, s: 4.7075 }, rushTdPerAtt: { m: 0.0362, s: 0.1291 },
  recPerTgt: { m: 0.6578, s: 0.3724 }, recYdsPerTgt: { m: 6.6312, s: 6.6943 }, recTdPerTgt: { m: 0.0348, s: 0.1407 },
});
const TEAM = Object.freeze({ passAtt: { m: 64.20 / 2, s: 10.74 / 2 }, rushAtt: { m: 54.18 / 2, s: 6.41 / 2 }, offTd: { m: 3.92 / 2, s: 1.50 / 2 } });
const EFF_SOURCE = "preseason rows of data/internal/research/nfl/player-events-v1/{2023,2024,2025}.json — 739 passing, 1,817 rushing and 3,768 receiving player-games";

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const normal = (rng) => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const r2 = (x) => Number(x.toFixed(2));
const r4 = (x) => Number(x.toFixed(4));
/** Triangular draw from a p10/p50/p90 participation share — the shape P182 publishes. */
const drawShare = (rng, d) => { const u = rng(); return u < 0.5 ? d.p10 + (d.p50 - d.p10) * (u / 0.5) : d.p50 + (d.p90 - d.p50) * ((u - 0.5) / 0.5); };

const dist = (values, unit) => {
  const s = [...values].sort((a, b) => a - b);
  return { p10: r2(q(s, 0.1)), p50: r2(q(s, 0.5)), p90: r2(q(s, 0.9)), mean: r2(values.reduce((a, b) => a + b, 0) / values.length), unit };
};
/** Model probability of clearing a standard threshold — no market line exists to anchor to. */
const overProb = (values, line) => r4(values.filter((v) => v > line).length / values.length);

/**
 * PER-PLAYER THRESHOLDS, derived from that player's own simulated distribution.
 *
 * This used to be a fixed ladder — rushAtt 7.5, rushYds 24.5/49.5 — applied to every player on the
 * field. The board it produced was worthless: a fourth receiver projecting 0.1 carries got the same
 * 7.5-carry line as the starting back, cleared it 0% of the time, and the page rendered a wall of
 * rows all reading 100% UNDER. Every row agreed, so no row said anything.
 *
 * A threshold is only informative where the outcome is genuinely uncertain, so each line is placed at
 * that player's own simulated median (rounded to the half-point a book would use) and kept only if
 * the simulated probability actually lands away from the extremes.
 */
/** ESPN headshot for an athlete id of the form "nfl-athlete-<id>". Null when the id is not one. */
function espnHeadshot(playerId) {
  const m = /(?:^|-)athlete-(\d+)$/.exec(String(playerId ?? ""));
  return m ? `https://a.espncdn.com/i/headshots/nfl/players/full/${m[1]}.png` : null;
}

const HALF_STEP = { passYds: 5, passAtt: 1, rushYds: 5, rushAtt: 1, rec: 1, recYds: 5, anytimeTd: 1 };

/** Round to the nearest half-point on a sensible step for the market — 249.5, 24.5, 3.5, … */
function halfPointNear(value, market) {
  const step = HALF_STEP[market] ?? 1;
  const snapped = Math.max(step, Math.round(value / step) * step);
  return snapped - 0.5;
}

/**
 * Lines worth publishing for one player+market: the median-anchored threshold, plus one step either
 * side when those are still genuinely uncertain. A line the model clears ≥97% or ≤3% of the time
 * carries no information and is dropped rather than padded onto the board.
 */
function thresholdsFor(values, market) {
  if (!values?.length) return [];
  const med = q([...values].sort((a, b) => a - b), 0.5);
  if (!Number.isFinite(med) || med <= 0) return [];
  const step = HALF_STEP[market] ?? 1;
  const candidates = market === "anytimeTd"
    ? [0.5]
    : [halfPointNear(med, market), halfPointNear(med + step, market), halfPointNear(med - step, market)];
  const out = [];
  for (const line of candidates) {
    if (line <= 0 || out.includes(line)) continue;
    const p = values.filter((v) => v > line).length / values.length;
    if (p >= 0.03 && p <= 0.97) out.push(line);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Each game belongs to the ET calendar day it KICKS OFF on — not to one shared "slate date".
 *
 * Two bugs live here if you get it wrong. Stamping every game with one artifact date put Saturday's
 * seven games under Friday, so tonight's page listed tomorrow's games. And slicing the UTC instant
 * is wrong for late kickoffs: an 8:00 PM ET Saturday game is 00:00 UTC Sunday, so `.slice(0,10)`
 * would file it under the wrong day entirely.
 */
const etDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

const games = [];
const refusals = [];

for (const ev of index.events.filter((e) => e.lifecycle === "UPCOMING")) {
  const day = ev.kickoffUtc.slice(0, 10);
  const part = read(`data/internal/nfl/participation/${day}/${ev.providerEventId}.json`);
  const fc = forecasts.forecasts.find((f) => f.providerEventId === ev.providerEventId);
  if (!part || !fc) { refusals.push({ providerEventId: ev.providerEventId, matchup: ev.matchup, reason: !part ? "no participation artifact" : "no frozen forecast" }); continue; }

  const rng = mulberry32(fnv1a(`nfl-gamesim-v1::${ev.providerEventId}::${fc.model.inputHash}`));
  const players = new Map();   // playerId -> { meta, samples }
  const teamDraws = {};

  for (const [abbr, tv] of Object.entries(part.teams)) {
    teamDraws[abbr] = { passAtt: [], rushAtt: [], offTd: [] };
    for (const m of ["passAttempts", "rushAttempts", "targets"]) {
      for (const p of tv.markets[m]?.players ?? []) {
        const key = `${p.playerId}::${m}`;
        if (!players.has(key)) players.set(key, { meta: { ...p, team: abbr, family: m }, s: {} });
      }
    }
  }

  for (let i = 0; i < RUNS; i += 1) {
    for (const [abbr, tv] of Object.entries(part.teams)) {
      // TEAM opportunity for this draw
      const tPass = Math.max(5, TEAM.passAtt.m + TEAM.passAtt.s * normal(rng));
      const tRush = Math.max(5, TEAM.rushAtt.m + TEAM.rushAtt.s * normal(rng));
      const tTd = Math.max(0, Math.round(TEAM.offTd.m + TEAM.offTd.s * normal(rng)));
      teamDraws[abbr].passAtt.push(tPass); teamDraws[abbr].rushAtt.push(tRush); teamDraws[abbr].offTd.push(tTd);

      // PASSING — QB share of team attempts, then efficiency
      let tdAllocated = 0;
      for (const p of tv.markets.passAttempts?.players ?? []) {
        const rec = players.get(`${p.playerId}::passAttempts`);
        const att = Math.max(0, drawShare(rng, p.preseasonShare) * tPass);
        const cmp = Math.min(att, att * Math.max(0, EFF.cmpPerAtt.m + EFF.cmpPerAtt.s * normal(rng)));
        const yds = att * Math.max(0, EFF.passYdsPerAtt.m + EFF.passYdsPerAtt.s * normal(rng));
        const td = Math.min(tTd - tdAllocated, Math.max(0, Math.round(att * Math.max(0, EFF.passTdPerAtt.m + EFF.passTdPerAtt.s * normal(rng)))));
        tdAllocated += Math.max(0, td);
        (rec.s.passAtt ??= []).push(att); (rec.s.passCmp ??= []).push(cmp); (rec.s.passYds ??= []).push(yds); (rec.s.passTd ??= []).push(Math.max(0, td));
      }
      // RUSHING
      for (const p of tv.markets.rushAttempts?.players ?? []) {
        const rec = players.get(`${p.playerId}::rushAttempts`);
        const att = Math.max(0, drawShare(rng, p.preseasonShare) * tRush);
        const yds = att * Math.max(0, EFF.rushYdsPerAtt.m + EFF.rushYdsPerAtt.s * normal(rng));
        const td = Math.min(Math.max(0, tTd - tdAllocated), Math.max(0, Math.round(att * Math.max(0, EFF.rushTdPerAtt.m + EFF.rushTdPerAtt.s * normal(rng)))));
        tdAllocated += td;
        (rec.s.rushAtt ??= []).push(att); (rec.s.rushYds ??= []).push(yds); (rec.s.rushTd ??= []).push(td);
      }
      // RECEIVING — targets share of team pass attempts
      for (const p of tv.markets.targets?.players ?? []) {
        const rec = players.get(`${p.playerId}::targets`);
        const tgt = Math.max(0, drawShare(rng, p.preseasonShare) * tPass);
        const catches = Math.min(tgt, tgt * Math.max(0, EFF.recPerTgt.m + EFF.recPerTgt.s * normal(rng)));
        const yds = tgt * Math.max(0, EFF.recYdsPerTgt.m + EFF.recYdsPerTgt.s * normal(rng));
        const td = Math.max(0, Math.round(tgt * Math.max(0, EFF.recTdPerTgt.m + EFF.recTdPerTgt.s * normal(rng))));
        (rec.s.targets ??= []).push(tgt); (rec.s.rec ??= []).push(catches); (rec.s.recYds ??= []).push(yds); (rec.s.recTd ??= []).push(td);
      }
    }
  }

  // ── emit the SHARED reader schema so NFL renders through the same experience as MLB ──────────
  // lib/game-simulations/read.ts drives /games/[sport]/[gameId]: the simulation graphic, the tabs,
  // the ranked prop list, the histograms, the story. Producing NFL's own shape would have forked
  // that; producing THIS shape means NFL inherits all of it.
  const FAMILY_FIELDS = {
    passAttempts: [["passAtt", "Pass attempts", "passAtt"], ["passCmp", "Completions", null], ["passYds", "Passing yards", "passYds"], ["passTd", "Passing TD", null]],
    rushAttempts: [["rushAtt", "Carries", "rushAtt"], ["rushYds", "Rushing yards", "rushYds"], ["rushTd", "Rushing TD", null]],
    targets: [["targets", "Targets", null], ["rec", "Receptions", "rec"], ["recYds", "Receiving yards", "recYds"], ["recTd", "Receiving TD", null]],
  };
  /** A histogram in the reader's bin shape — this is what draws the distribution chart. */
  function histogram(values, key, label) {
    const max = Math.max(...values);
    const width = max <= 5 ? 1 : max <= 30 ? 2 : max <= 80 ? 10 : 25;
    const bins = new Map();
    for (const v of values) { const lo = Math.floor(v / width) * width; bins.set(lo, (bins.get(lo) ?? 0) + 1); }
    return {
      key, label, sampleCount: values.length,
      bins: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([lo, count]) => ({
        label: width === 1 ? String(lo) : `${lo}-${lo + width}`,
        lowerEdge: lo, upperEdge: lo + width, count, probability: r4(count / values.length),
      })),
    };
  }

  const distributions = {};
  const generatedPicks = [];
  const gameId = `nfl-${ev.providerEventId}`;
  for (const { meta, s: samples } of players.values()) {
    for (const [field, label, thresholdKey] of FAMILY_FIELDS[meta.family]) {
      const vals = samples[field]; if (!vals?.length) continue;
      const key = `${field}__${meta.playerId}`;
      distributions[key] = histogram(vals, key, `${meta.name} — ${label}`);
      const sorted = [...vals].sort((a, b) => a - b);
      const projection = r2(vals.reduce((a, b) => a + b, 0) / vals.length);
      for (const line of thresholdsFor(vals, thresholdKey)) {
        const pOver = overProb(vals, line);
        generatedPicks.push({
          id: `${gameId}-${meta.playerId}-${field}-${line}-${pOver >= 0.5 ? "over" : "under"}`,
          sport: "nfl", gameId,
          market: field, player: meta.name, team: meta.team, position: meta.position,
          // ESPN athlete id is already the participation key, so the portrait needs no new source.
          photoUrl: espnHeadshot(meta.playerId),
          line, side: pOver >= 0.5 ? "over" : "under",
          projection,
          modelProbability: pOver >= 0.5 ? pOver : r4(1 - pOver),
          // No NFL player market exists in this window, so there is no price to compare against.
          // Null rather than a synthesized number — the reader shows a model-only row.
          marketProbability: null, edgePct: null,
          confidence: 0.35,
          riskTier: "experimental",
          reasonBullets: [
            `${meta.name} projects ${projection} ${label.toLowerCase()} across ${RUNS.toLocaleString()} simulated games (p10 ${r2(q(sorted, 0.1))}, p90 ${r2(q(sorted, 0.9))}).`,
            `Playing time is role-uncertain: his share of team work is modelled as ${meta.preseasonShare.p10}-${meta.preseasonShare.p90}, which is why the range is wide.`,
            "No sportsbook offers this market for this game, so there is no price to compare against.",
          ],
          paperOnly: true,
          sourceFields: ["projection", "participationShare", "samples"],
          marketState: "MODEL_ONLY_NO_MARKET",
        });
      }
    }
  }
  generatedPicks.sort((a, b) => b.modelProbability - a.modelProbability);

  const s = fc.forecastSummary;

  // ── GAME-LEVEL ANALYTICS ─────────────────────────────────────────────────────────────────────
  // Reconstruct the margin/total sample from the published distribution so every number below comes
  // from ONE set of draws. A normal with the published median and an 80% interval is exactly what
  // the forecast engine produced, so this is a re-expression of it rather than a second model.
  const zFromP = 1.2816;                                    // 80% interval half-width in sigmas
  const sigMargin = (s.margin.p90 - s.margin.p10) / (2 * zFromP);
  const sigTotal = (s.total.p90 - s.total.p10) / (2 * zFromP);
  const gRng = mulberry32(fnv1a(`nfl-gameanalytics::${ev.providerEventId}::${fc.model.inputHash}`));
  const marginDraws = []; const totalDraws = [];
  for (let i = 0; i < RUNS; i += 1) {
    marginDraws.push(Math.round(s.margin.median + sigMargin * normal(gRng)));
    totalDraws.push(Math.max(0, Math.round(s.total.median + sigTotal * normal(gRng))));
  }
  const share = (arr, pred) => r4(arr.filter(pred).length / arr.length);

  // KEY NUMBERS — football margins pile up on 3, 7, 10 and 14. A real, checkable property of the
  // simulated set, and one of the few things that is genuinely football-specific.
  const KEY = [3, 7, 10, 14];
  const keyNumbers = {
    numbers: KEY,
    shareOnKeyNumbers: share(marginDraws, (m) => KEY.includes(Math.abs(m))),
    byNumber: Object.fromEntries(KEY.map((k) => [k, share(marginDraws, (m) => Math.abs(m) === k)])),
    note: "Share of simulated margins landing exactly on the numbers football scoring piles up on.",
  };
  // OVERTIME — a tie at the end of regulation. Preseason overtime rules differ, so this is reported
  // as the tie share rather than as a resolved overtime result.
  const overtimeProbability = { probability: share(marginDraws, (m) => m === 0), note: "Share of simulated games tied at the end of regulation. Preseason overtime rules vary, so this is the tie share, not a resolved overtime winner." };

  // PERIOD MARKETS — NOT PUBLISHED, and this is the reason rather than an omission.
  // Splitting a simulated total into quarters needs measured per-quarter scoring shares. The
  // committed corpus carries FINAL SCORES ONLY, so any split would come from shares I asserted
  // rather than measured — and an asserted share dressed as a simulated period line is exactly the
  // fabrication this engine refuses everywhere else. A competitor showing quarter lines has
  // per-period data; we do not, and we say so.
  const periodMarkets = {
    state: "UNSUPPORTED_NO_PERIOD_DATA",
    reason: "Quarter and half lines need measured per-period scoring. Our corpus carries final scores only, so publishing a split would mean inventing the shares it rests on.",
    whatWouldChangeIt: "a per-quarter scoring corpus, which is the same missing ingredient as drive-level data.",
  };

  const mkt = (markets?.rows ?? []).find((r) => r.providerEventId === ev.providerEventId) ?? null;
  const lines = [];
  if (mkt?.consensus) {
    if (typeof mkt.consensus.homeWinProbNoVig === "number") lines.push({ market: "moneyline", side: "home", player: null, line: null, impliedProbability: r4(mkt.consensus.homeWinProbNoVig), modelProbability: r4(s.winProbability.home) });
    if (typeof mkt.consensus.total === "number") lines.push({ market: "total", side: "over", player: null, line: mkt.consensus.total, impliedProbability: null, modelProbability: null });
    if (typeof mkt.consensus.spreadHome === "number") lines.push({ market: "spread", side: "home", player: null, line: mkt.consensus.spreadHome, impliedProbability: null, modelProbability: null });
  }

  games.push({
    gameId,
    gamePk: Number(ev.providerEventId),
    slug: `${ev.away.abbr.toLowerCase()}-vs-${ev.home.abbr.toLowerCase()}-${etDay(ev.kickoffUtc)}`,
    /** The ET day this game kicks off on — the single key everything downstream groups by. */
    slateDate: etDay(ev.kickoffUtc),
    teams: { home: ev.home.name, away: ev.away.name },
    status: "ready",
    freshness: {
      slateDate: etDay(ev.kickoffUtc),
      sourceCapturedAt: part.generatedAt,
      generatedAt: NOW,
      note: `Joint game simulation: team volume, each player's share of it, then efficiency measured from ${RUNS.toLocaleString()} deterministic iterations.`,
    },
    marketSnapshot: { bookmaker: mkt ? `median of ${mkt.books?.length ?? 0} books` : null, capturedAt: markets?.capturedAt ?? null, lines },
    simulationSummary: {
      headline: `${ev.matchup}: ${Object.keys(distributions).length} player markets simulated over ${RUNS.toLocaleString()} deterministic iterations each.`,
      projectedScore: s.projectedScore,
      winProbability: s.winProbability,
      margin: s.margin,
      total: s.total,
      teamOpportunity: Object.fromEntries(Object.entries(teamDraws).map(([abbr, d]) => [abbr, { passAttempts: dist(d.passAtt, "attempts"), rushAttempts: dist(d.rushAtt, "carries"), offensiveTd: dist(d.offTd, "touchdowns") }])),
      keyNumbers,
      overtimeProbability,
      periodMarkets,
      marginDistribution: (() => {
        const bins = new Map();
        for (const m of marginDraws) { const lo = Math.floor(m / 3) * 3; bins.set(lo, (bins.get(lo) ?? 0) + 1); }
        return { unit: "margin (home - away)", marketLine: mkt?.consensus?.spreadHome ?? null,
          bins: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([lo, c]) => ({ lowerEdge: lo, upperEdge: lo + 3, count: c, probability: r4(c / marginDraws.length) })) };
      })(),
      totalDistribution: (() => {
        const bins = new Map();
        for (const t of totalDraws) { const lo = Math.floor(t / 3) * 3; bins.set(lo, (bins.get(lo) ?? 0) + 1); }
        return { unit: "total points", marketLine: mkt?.consensus?.total ?? null,
          bins: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([lo, c]) => ({ lowerEdge: lo, upperEdge: lo + 3, count: c, probability: r4(c / totalDraws.length) })) };
      })(),
      marketGaps: mkt?.consensus ? (() => {
        const g = [];
        if (typeof mkt.consensus.homeWinProbNoVig === "number") {
          const gap = (s.winProbability.home - mkt.consensus.homeWinProbNoVig) * 100;
          g.push({ market: "moneyline", sim: r4(s.winProbability.home), market_: r4(mkt.consensus.homeWinProbNoVig), gapPp: r2(gap), classification: Math.abs(gap) <= 5 ? "WITHIN_RANGE" : "STRETCHED" });
        }
        if (typeof mkt.consensus.total === "number") {
          const over = share(totalDraws, (t) => t > mkt.consensus.total);
          g.push({ market: "total", line: mkt.consensus.total, simOver: over, gapPoints: r2(s.total.median - mkt.consensus.total), classification: Math.abs(s.total.median - mkt.consensus.total) <= 3 ? "WITHIN_RANGE" : "STRETCHED" });
        }
        if (typeof mkt.consensus.spreadHome === "number") {
          const cover = share(marginDraws, (m) => m + mkt.consensus.spreadHome > 0);
          g.push({ market: "spread", line: mkt.consensus.spreadHome, simCover: cover, gapPp: r2((cover - 0.5) * 100), classification: Math.abs(cover - 0.5) <= 0.05 ? "WITHIN_RANGE" : "STRETCHED" });
        }
        return g;
      })() : [],
      readiness: fc.teamSignal?.state === "APPLIED" ? "SIMULATION_READY" : "BASELINE_ONLY",
      readinessNote: fc.teamSignal?.note ?? null,
    },
    distributions,
    generatedPicks,
    unavailableModules: [
      { module: "player_market_comparison", reason: "no_market_offered", requiredArtifactField: "generatedPicks[].marketProbability", displayCopy: "No sportsbook offers NFL player markets for this game, so there is no price to compare our projections against. We do not invent one." },
      { module: "first_scorer", reason: "not_supported_for_sport", requiredArtifactField: "distributions.first_scorer", displayCopy: "First and last touchdown need drive ordering. Our corpus carries per-game stat lines with no ordering, so the mechanism does not exist." },
      { module: "scoreline", reason: "not_supported_for_sport", requiredArtifactField: "distributions.scoreline", displayCopy: "Scoreline distributions are a soccer module." },
    ],
    integrity: {
      sourceBoardHash: fc.model.inputHash,
      artifactHash: crypto.createHash("sha256").update(JSON.stringify({ e: ev.providerEventId, d: Object.keys(distributions).sort() })).digest("hex"),
    },
  });
}

/** Games grouped by the ET day they kick off — one artifact per slate day, never one lump. */
const dayKey = (g) => g.slateDate ?? g.freshness?.slateDate ?? NOW.slice(0, 10);
const slateDays = [...new Set(games.map(dayKey))].sort();
const date = slateDays[0] ?? NOW.slice(0, 10);

const buildArtifact = (day, dayGames) => ({
  date: day,
  sport: "nfl",
  generatedAt: NOW,
  modelVersion: forecasts.model?.id ?? "nfl-preseason-public-beta-v1",
  simulationVersion: 1,
  simulationEngine: "nfl-joint-game-sim-v1",
  runCount: RUNS,
  sourceBoardHash: index.generatedAt,
  games: dayGames,
  refusals,
  honesty: {
    teamModel: "the team score distribution is BASELINE_ONLY — no measured signal separates these teams, so it reflects league-wide preseason context and home field only.",
    playerModel: "player distributions come from a joint simulation of team opportunity, participation share and preseason efficiency measured from 739 passing / 1,817 rushing / 3,768 receiving preseason player-games. They are RESEARCH ESTIMATES: none of the four families beat a simple role baseline when tested, and the ranges are wide because preseason playing time genuinely is.",
    market: "team markets carry a real captured line and a real comparison. Player markets are not offered by the provider for these games, so player rows carry model probability only and no line is invented.",
    notAdvice: "educational and paper-only; not betting advice, and not shown to beat the market.",
  },
});

const out = path.join(APP, "public/data/nfl/game-simulations");
fs.mkdirSync(out, { recursive: true });
for (const day of slateDays) {
  const a = buildArtifact(day, games.filter((g) => dayKey(g) === day));
  a.artifactHash = crypto.createHash("sha256").update(JSON.stringify(a.games)).digest("hex");
  fs.writeFileSync(path.join(out, `${day}.json`), JSON.stringify(a, null, 1) + "\n");
  // `latest` is the NEAREST slate day, so "today" never silently includes tomorrow's games.
  if (day === date) fs.writeFileSync(path.join(out, "latest.json"), JSON.stringify(a, null, 1) + "\n");
}

console.log(`nfl game simulations: ${slateDays.length} slate day(s) ${slateDays.join(", ")} · ${games.length} games · ${refusals.length} refused · ${RUNS} runs`);
for (const g of games) {
  console.log(`  ${g.slug.padEnd(22)} ${g.simulationSummary.readiness.padEnd(15)} picks ${String(g.generatedPicks.length).padStart(3)} · distributions ${String(Object.keys(g.distributions).length).padStart(3)} · market lines ${g.marketSnapshot.lines.length}`);
}
for (const r of refusals) console.log(`  REFUSED ${r.matchup}: ${r.reason}`);
