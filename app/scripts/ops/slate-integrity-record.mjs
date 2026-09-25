#!/usr/bin/env node
/**
 * WEEKEND SLATE INTEGRITY RECORD — one row per game, across every sport with events.
 *
 *   node app/scripts/ops/slate-integrity-record.mjs --now <ISO> --json <path>
 *
 * WHAT IT IS FOR. A refresh is only auditable if the state BEFORE and AFTER it can be compared
 * field by field. This captures, per game, the things that decide whether a forecast can be trusted:
 * which snapshot it came from, which model made it, what it says, which availability evidence it
 * consumed, who was excluded, what is still uncertain, and when each of those was generated.
 *
 * ⚠ IT READS AND NEVER WRITES A FORECAST. Every value comes from a committed artifact produced by
 * that sport's canonical producer. Nothing here regenerates, adjusts or repairs anything.
 *
 * ⚠ AND A SPORT WITH NO EVENTS SAYS SO. An empty sport is reported as NO_EVENTS with the reason,
 * never omitted and never padded — "nothing to refresh" and "we did not look" must not render the
 * same way.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const nowMs = Date.parse(NOW);

/* ── NFL ──────────────────────────────────────────────────────────────────────────────────────── */
function nfl() {
  const f = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
  if (!f?.forecasts) return { state: "NO_ARTIFACT", games: [] };
  const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
  const partDir = path.join(ROOT, "data/internal/nfl/participation");
  const partByEvent = new Map();
  if (fs.existsSync(partDir)) {
    for (const day of fs.readdirSync(partDir)) {
      const dd = path.join(partDir, day);
      if (!fs.statSync(dd).isDirectory()) continue;
      for (const x of fs.readdirSync(dd)) {
        if (!/^\d+\.json$/.test(x)) continue;
        const a = read(path.join(dd, x));
        if (a?.providerEventId) partByEvent.set(a.providerEventId, a);
      }
    }
  }
  const games = [];
  for (const g of f.forecasts) {
    if (Date.parse(g.kickoffUtc) <= nowMs) continue;
    const p = partByEvent.get(g.providerEventId);
    const board = read(path.join(APP, `public/data/nfl/player-board/${g.providerEventId}.json`));
    const excl = [];
    const seen = new Set();
    for (const e of p?.excludedIneligible ?? []) {
      if (seen.has(e.playerId)) continue;
      seen.add(e.playerId);
      excl.push({ playerId: e.playerId, name: e.name, team: e.team, state: e.status, statedAt: e.statedAt });
    }
    let uncertain = 0;
    for (const t of Object.values(p?.teams ?? {})) for (const m of Object.values(t.markets ?? {})) for (const pl of m.players ?? []) if (pl.state === "AVAILABLE_ROLE_UNCERTAIN") uncertain += 1;
    const priced = (board?.players ?? []).reduce((n, pl) => n + Object.values(pl.markets ?? {}).filter((s) => s?.market).length, 0);
    games.push({
      sport: "nfl", eventId: g.providerEventId, matchup: g.matchup, startUtc: g.kickoffUtc,
      forecastSnapshot: { model: g.model?.id ?? null, version: g.model?.version ?? null, inputHash: g.model?.inputHash ?? null, simulations: g.model?.simulations ?? null, generatedAt: g.generatedAt ?? f.generatedAt, state: g.state ?? null },
      expected: { score: g.forecastSummary?.projectedScore ?? null, winProbability: g.forecastSummary?.winProbability ?? null, total: g.forecastSummary?.total ?? null },
      availability: {
        consumedByTeamForecast: false,
        note: "the team heads are availability-blind by validated design; the player layer below is not",
        snapshotAsOf: p?.injuriesAsOf ?? null, participationInputHash: p?.inputHash ?? null,
        hardExclusions: excl, unresolvedUncertainSlots: uncertain,
      },
      expectedStarters: { supported: false, reason: "no registered actives/inactives source covers the pregame window" },
      playerProjectionSnapshot: { generatedAt: board?.generatedAt ?? null, players: (board?.players ?? []).length, pricedSlots: priced },
      sportsbook: { capturedAt: markets?.propPrices?.capturedAt ?? null, propState: markets?.propMarkets?.state ?? null, referenceBook: markets?.propPrices?.referenceBook ?? null },
    });
  }
  games.sort((a, b) => (a.startUtc < b.startUtc ? -1 : 1));
  return { state: games.length ? "ACTIVE" : "NO_EVENTS", generatedAt: f.generatedAt, games };
}

/* ── MLB ──────────────────────────────────────────────────────────────────────────────────────── */
function mlb() {
  const dir = path.join(APP, "public/data/mlb/full-game-simulations");
  const day = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse()[0];
  if (!day) return { state: "NO_ARTIFACT", games: [] };
  const a = read(path.join(dir, day));
  const games = [];
  for (const g of a?.games ?? []) {
    if (!g?.runs) { games.push({ sport: "mlb", eventId: String(g.gamePk), matchup: `${g.awayTeam} @ ${g.homeTeam}`, startUtc: g.firstPitch ?? null, state: "NO_SIMULATION", reason: g.status ?? null }); continue; }
    const c = g.completeness ?? {};
    games.push({
      sport: "mlb", eventId: String(g.gamePk), matchup: `${g.awayTeam} @ ${g.homeTeam}`, startUtc: g.firstPitch ?? null,
      forecastSnapshot: { model: a.modelVersion, simulationVersion: a.simulationVersion, runCount: g.runCount ?? a.runCount, artifactHash: g.artifactHash ?? null, sourceBoardHash: a.sourceBoardHash ?? null, generatedAt: a.generatedAt },
      expected: {
        runs: { away: g.runs.away.mean, home: g.runs.home.mean },
        medianSimScore: { away: g.runs.away.median, home: g.runs.home.median },
        winProbability: g.winProbability, totalRuns: g.totalRuns?.mean ?? null,
      },
      availability: {
        lineupSource: { away: c.awayLineupSource ?? null, home: c.homeLineupSource ?? null },
        confirmed: c.awayLineupSource === "confirmed" && c.homeLineupSource === "confirmed",
        level: c.level ?? null, missingFamilies: c.missingFamilies ?? [], notes: c.notes ?? [],
      },
      expectedStarters: { supported: true, startingPitchersKnown: Boolean(c.hasAwayStarter) && Boolean(c.hasHomeStarter), battersAway: c.awayLineupCount ?? null, battersHome: c.homeLineupCount ?? null },
      playerProjectionSnapshot: { players: (g.players ?? []).length },
    });
  }
  return { state: games.length ? "ACTIVE" : "NO_EVENTS", slate: day, generatedAt: a?.generatedAt ?? null, games };
}

/* ── EPL ──────────────────────────────────────────────────────────────────────────────────────── */
function epl() {
  const f = read(path.join(APP, "public/data/soccer/epl/forecasts/latest.json"));
  if (!f?.rows) return { state: "NO_ARTIFACT", games: [] };
  const horizon = nowMs + 4 * 24 * 3600_000;
  const rows = f.rows.filter((r) => Date.parse(r.kickoffUtc) > nowMs && Date.parse(r.kickoffUtc) <= horizon);
  const proj = read(path.join(APP, "public/data/soccer/epl/player-projections/latest.json"));
  if (!rows.length) {
    const next = f.rows.map((r) => r.kickoffUtc).sort()[0] ?? null;
    return {
      state: "NO_EVENTS",
      reason: `no EPL fixture kicks off inside the weekend window; the next is ${next}`,
      availabilityLimitation: (proj?.limitations ?? []).find((l) => /injur|suspen/i.test(l)) ?? null,
      generatedAt: f.generatedAt, games: [],
    };
  }
  return { state: "ACTIVE", generatedAt: f.generatedAt, games: rows.map((r) => ({ sport: "epl", eventId: r.eventId, matchup: r.matchup, startUtc: r.kickoffUtc, forecastSnapshot: { model: r.modelId, generatedAt: f.generatedAt }, expected: { goals: r.expectedGoals ?? null, probabilities: r.probs ?? null }, availability: { hardExclusionReachable: false, limitation: (proj?.limitations ?? []).find((l) => /injur|suspen/i.test(l)) ?? null } })) };
}

/* ── UFC ──────────────────────────────────────────────────────────────────────────────────────── */
function ufc() {
  const c = read(path.join(APP, "public/data/ufc/card-latest.json"));
  if (!c?.bouts) return { state: "NO_ARTIFACT", games: [] };
  const lineDir = path.join(ROOT, "data/internal/research/ufc/lineage");
  const newest = (fs.existsSync(lineDir) ? fs.readdirSync(lineDir).filter((x) => x.endsWith(".json")).sort().reverse()[0] : null);
  const lineage = newest ? read(path.join(lineDir, newest)) : null;
  const byClass = {};
  for (const ch of lineage?.changes ?? []) byClass[ch.class] = (byClass[ch.class] ?? 0) + 1;
  return {
    state: c.state ?? "UNKNOWN",
    event: c.event ?? null, generatedAt: c.generatedAt,
    lineage: { receipt: newest, state: lineage?.state ?? null, classes: byClass, withdrawalsOrReplacements: (lineage?.changes ?? []).filter((x) => x.class === "REMOVED" || x.class === "REPLACED").length },
    games: c.bouts.map((b) => ({
      sport: "ufc", eventId: b.boutId, matchup: `${b.red?.name ?? "?"} vs ${b.blue?.name ?? "?"}`, startUtc: b.startUtc,
      forecastSnapshot: { model: c.model?.id ?? null, generatedAt: c.generatedAt },
      expected: b.prediction ?? null, unmodelledReason: b.unmodelledReason ?? null,
      availability: { boutStatus: "ON_CARD", lineageReceipt: newest, weighInOrMedical: { supported: false, reason: "not ingested" } },
    })),
  };
}

const report = {
  schemaVersion: 1, artifact: "slate-integrity-record", dataClass: "INTERNAL_RESEARCH",
  generatedAt: NOW,
  note: "A read-only field-by-field record of the active slate, for before/after comparison across a refresh. It regenerates nothing.",
  sports: { nfl: nfl(), mlb: mlb(), epl: epl(), ufc: ufc() },
};
for (const [s, r] of Object.entries(report.sports)) {
  console.log(`${s.padEnd(4)} ${String(r.state).padEnd(14)} games=${String(r.games.length).padStart(3)}${r.reason ? `  · ${r.reason.slice(0, 80)}` : ""}`);
}
const out = arg("json");
if (out) { fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true }); fs.writeFileSync(path.join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`); console.log(`wrote ${out}`); }
