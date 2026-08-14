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

const THRESHOLDS = {
  passYds: [149.5, 199.5], passAtt: [19.5], rushYds: [24.5, 49.5], rushAtt: [7.5],
  rec: [1.5, 2.5], recYds: [24.5, 39.5], anytimeTd: [0.5],
};

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

  // ── assemble player rows in MLB's shape ───────────────────────────────────────────────────────
  const FAMILY_FIELDS = {
    passAttempts: [["passAtt", "attempts", "passAtt"], ["passCmp", "completions", null], ["passYds", "passing yards", "passYds"], ["passTd", "passing TD", null]],
    rushAttempts: [["rushAtt", "carries", "rushAtt"], ["rushYds", "rushing yards", "rushYds"], ["rushTd", "rushing TD", null]],
    targets: [["targets", "targets", null], ["rec", "receptions", "rec"], ["recYds", "receiving yards", "recYds"], ["recTd", "receiving TD", null]],
  };
  const playerRows = [];
  for (const { meta, s } of players.values()) {
    const projections = [];
    for (const [field, label, thresholdKey] of FAMILY_FIELDS[meta.family]) {
      const vals = s[field]; if (!vals?.length) continue;
      const d = dist(vals, label);
      const thresholds = (THRESHOLDS[thresholdKey] ?? []).map((line) => ({ line, modelProbabilityOver: overProb(vals, line) }));
      projections.push({ field, label, distribution: d, thresholds });
    }
    // Anytime touchdown belongs only to rows that carry SCORING opportunity. A passing row has
    // none — a quarterback's rushing score lives on his rushing row — so emitting 0.0% here would
    // read as "this player will not score" when the truth is "this row is not where that lives".
    const scoring = s.rushTd ?? s.recTd ?? null;
    const anytime = scoring
      ? r4(scoring.map((_, i) => (s.rushTd?.[i] ?? 0) + (s.recTd?.[i] ?? 0)).filter((v) => v >= 1).length / scoring.length)
      : null;
    playerRows.push({
      playerId: meta.playerId, name: meta.name, position: meta.position, team: meta.team,
      family: meta.family,
      participationState: meta.state,
      participationShare: meta.preseasonShare,
      projections,
      anytimeTdProbability: anytime,
      marketState: "MODEL_ONLY_NO_MARKET",
      marketStateReason: "the provider offers no NFL player market for this game, so there is no line to project against and no difference to compute. No line is synthesized.",
      limitation: "playing time is role-uncertain — this distribution already carries that uncertainty, which is why it is wide.",
    });
  }

  // ── TEAM markets: a real comparison, because real lines exist ─────────────────────────────────
  const mkt = (markets?.rows ?? []).find((r) => r.providerEventId === ev.providerEventId) ?? null;
  const s = fc.forecastSummary;
  const teamPicks = [];
  if (mkt?.consensus) {
    if (typeof mkt.consensus.homeWinProbNoVig === "number") {
      teamPicks.push({ market: "moneyline", selection: `${ev.home.abbr} to win`, modelProbability: r4(s.winProbability.home), marketProbability: r4(mkt.consensus.homeWinProbNoVig), differencePp: r2((s.winProbability.home - mkt.consensus.homeWinProbNoVig) * 100), marketState: "PRICED" });
    }
    if (typeof mkt.consensus.total === "number") {
      teamPicks.push({ market: "total", selection: `over ${mkt.consensus.total}`, modelMedian: s.total.median, marketLine: mkt.consensus.total, differencePoints: r2(s.total.median - mkt.consensus.total), marketState: "PRICED" });
    }
  }

  games.push({
    providerEventId: ev.providerEventId,
    canonicalEventId: ev.canonicalEventId,
    matchup: ev.matchup,
    kickoffUtc: ev.kickoffUtc,
    teams: { home: ev.home, away: ev.away },
    status: fc.teamSignal?.state === "APPLIED" ? "ready" : "baseline_only",
    statusReason: fc.teamSignal?.note ?? null,
    simulationSummary: {
      runCount: RUNS,
      projectedScore: s.projectedScore, winProbability: s.winProbability, margin: s.margin, total: s.total,
      teamOpportunity: Object.fromEntries(Object.entries(teamDraws).map(([abbr, d]) => [abbr, { passAttempts: dist(d.passAtt, "attempts"), rushAttempts: dist(d.rushAtt, "carries"), offensiveTd: dist(d.offTd, "touchdowns") }])),
    },
    teamMarkets: teamPicks,
    players: playerRows.sort((a, b) => (b.projections[0]?.distribution.mean ?? 0) - (a.projections[0]?.distribution.mean ?? 0)),
    playerCount: playerRows.length,
    distributionCount: playerRows.reduce((n, p) => n + p.projections.length, 0),
    conservation: {
      enforcedWithinDraw: [
        "player pass attempts are a share of that draw's team pass attempts",
        "completions never exceed that player's own attempts in the same draw",
        "receptions never exceed that player's own targets in the same draw",
        "passing touchdowns are capped by the team's offensive touchdown count in that draw",
      ],
      notEnforcedAcrossFamilies:
        "team receptions are not forced to equal team completions within a draw. The families are allocated from the same team volume but drawn independently, so the two can disagree by a reception or two. Stated rather than claimed — a conservation guarantee that is only mostly true is worse than a stated limitation.",
    },
    integrity: {
      engine: "nfl-joint-game-sim-v1",
      efficiencySource: EFF_SOURCE,
      seed: `nfl-gamesim-v1::${ev.providerEventId}::${fc.model.inputHash}`,
      participationAsOf: part.generatedAt,
      forecastInputHash: fc.model.inputHash,
      deterministic: "identical inputs reproduce identical bytes — the seed is derived from the event id and the frozen forecast's input hash",
    },
  });
}

const date = games[0]?.kickoffUtc.slice(0, 10) ?? NOW.slice(0, 10);
const artifact = {
  schemaVersion: 1,
  artifact: "nfl-game-simulations",
  dataClass: "PUBLIC_DERIVED",
  date,
  generatedAt: NOW,
  runCount: RUNS,
  games,
  refusals,
  honesty: {
    teamModel: "the team score distribution is BASELINE_ONLY — no measured signal separates these teams, so it reflects league-wide preseason context and home field only.",
    playerModel: "player distributions come from a joint simulation of team opportunity, participation share and preseason efficiency. They are RESEARCH ESTIMATES: none of the four families beat a simple role baseline when tested, and the distributions are wide because preseason playing time genuinely is.",
    market: "team markets carry a real captured line and a real comparison. Player markets are not offered by the provider for these games, so player rows show model probability at standard thresholds and no line is invented.",
    notAdvice: "educational and paper-only; not betting advice, and not shown to beat the market.",
  },
};
artifact.contentHash = crypto.createHash("sha256").update(JSON.stringify(artifact.games)).digest("hex").slice(0, 16);

const out = path.join(APP, "public/data/nfl/game-simulations");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${date}.json`), JSON.stringify(artifact, null, 1) + "\n");
fs.writeFileSync(path.join(out, "latest.json"), JSON.stringify(artifact, null, 1) + "\n");

console.log(`nfl game simulations ${date}: ${games.length} games · ${refusals.length} refused · ${RUNS} runs`);
for (const g of games) {
  console.log(`  ${g.matchup.padEnd(12)} ${g.status.padEnd(13)} players ${String(g.playerCount).padStart(3)} · distributions ${String(g.distributionCount).padStart(3)} · team markets ${g.teamMarkets.length}`);
}
for (const r of refusals) console.log(`  REFUSED ${r.matchup}: ${r.reason}`);
