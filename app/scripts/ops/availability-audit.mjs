#!/usr/bin/env node
/**
 * FOUR-SPORT AVAILABILITY AUDIT — who was included in a forecast, who was excluded, and why.
 *
 *   node app/scripts/ops/availability-audit.mjs --now <ISO> [--json <path>]
 *
 * WHAT THIS IS FOR. A forecast is only as good as its participants, and until now each sport
 * answered "who is playing" in its own vocabulary, in its own artifact, with its own silences. That
 * made the important question — CAN A PLAYER WHO CANNOT PLAY STILL ENTER THE SIMULATION? — one that
 * had to be re-derived by reading four producers. This reads all four and answers it in one place.
 *
 * ⚠ IT REPORTS, IT NEVER REPAIRS. Every number comes from a committed artifact written by that
 * sport's canonical producer. Where a sport has no availability evidence this says so, as a named
 * GAP with the consequence spelled out, rather than defaulting the players to active — because
 * "nobody is excluded" and "we cannot tell who should be" are different facts and only one of them
 * is good news.
 *
 * UNKNOWN IS PRESERVED. A participant whose state cannot be established is counted as unknown, not
 * folded into included. That number is the honest measure of how much of a slate is being simulated
 * on assumption.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — an audit is never stamped with a guessed clock"); process.exit(2); }

/* ── NFL ─────────────────────────────────────────────────────────────────────────────────────────
 * Owner: build-nfl-participation.mjs, which reads the ESPN injuries capture in ONE direction — it
 * can remove a player, never promote one — and filters BEFORE depth ranking, so an excluded starter
 * moves the backup up rather than leaving a phantom row beside an unchanged share.
 */
function auditNfl() {
  const dir = path.join(ROOT, "data/internal/nfl/participation");
  if (!fs.existsSync(dir)) return { owner: "build-nfl-participation.mjs", state: "NO_ARTIFACT", events: [] };
  const events = [];
  for (const day of fs.readdirSync(dir).sort()) {
    const dayDir = path.join(dir, day);
    if (!fs.statSync(dayDir).isDirectory()) continue;
    for (const f of fs.readdirSync(dayDir)) {
      if (!/^\d+\.json$/.test(f)) continue;            // skip superseded snapshots
      const a = read(path.join(dayDir, f));
      if (!a || Date.parse(a.kickoffUtc ?? "") <= Date.parse(NOW)) continue;
      let included = 0, unknown = 0;
      const states = {};
      for (const team of Object.values(a.teams ?? {})) {
        for (const mkt of Object.values(team.markets ?? {})) {
          for (const p of mkt.players ?? []) {
            states[p.state] = (states[p.state] ?? 0) + 1;
            if (p.state === "UNKNOWN" || p.state === "SOURCE_STALE") unknown += 1; else included += 1;
          }
        }
      }
      events.push({
        eventId: a.providerEventId, matchup: a.matchup, startUtc: a.kickoffUtc,
        evidenceAsOf: a.injuriesAsOf ?? null, cutoffSafe: a.cutoffSafe ?? null,
        includedSlots: included, unknownSlots: unknown, stateCounts: states,
        excluded: (a.excludedIneligible ?? []).map((e) => ({ id: e.playerId, name: e.name, team: e.team, family: e.market, state: e.status, statedAt: e.statedAt, reason: e.reason })),
      });
    }
  }
  events.sort((a, b) => (a.startUtc < b.startUtc ? -1 : 1));
  return {
    owner: "build-nfl-participation.mjs · ESPN injuries capture (remove-only) → role shares → boards",
    hardExclusionReachable: true,
    state: events.length ? "ACTIVE" : "NO_UPCOMING_EVENTS",
    events,
    gaps: [
      "Game-day actives/inactives publish ~90 minutes before kickoff and no registered source covers them, so CONFIRMED_OUT, EXPECTED_STARTER, EXPECTED_ROTATION and LIMITED stay unreachable. Every named player therefore carries AVAILABLE_ROLE_UNCERTAIN, which is a refusal with a cause rather than an estimate.",
    ],
  };
}

/* ── MLB ─────────────────────────────────────────────────────────────────────────────────────────
 * Owner: the confirmed batting order captured from StatsAPI eight times a day. When it is present
 * the nine named batters ARE the population, so a scratch or an IL move is excluded by construction.
 * When it is not, the engine falls back to a prop-derived lineup and SAYS SO on the artifact.
 */
function auditMlb() {
  const dir = path.join(APP, "public/data/mlb/full-game-simulations");
  const day = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()[0];
  if (!day) return { owner: "capture-mlb-pregame-lineup.mjs", state: "NO_ARTIFACT", events: [] };
  const a = read(path.join(dir, day));
  const events = [];
  for (const g of a?.games ?? []) {
    if (!g?.runs) continue;
    const c = g.completeness ?? {};
    events.push({
      eventId: String(g.gamePk), matchup: `${g.awayTeam} @ ${g.homeTeam}`, startUtc: g.firstPitch ?? null,
      lineupSource: { away: c.awayLineupSource ?? null, home: c.homeLineupSource ?? null },
      confirmed: c.awayLineupSource === "confirmed" && c.homeLineupSource === "confirmed",
      includedBatters: (c.awayLineupCount ?? 0) + (c.homeLineupCount ?? 0),
      startersKnown: Boolean(c.hasAwayStarter) && Boolean(c.hasHomeStarter),
      level: c.level ?? null, missingFamilies: c.missingFamilies ?? [], notes: c.notes ?? [],
    });
  }
  const confirmed = events.filter((e) => e.confirmed).length;
  return {
    owner: "capture-mlb-pregame-lineup.mjs (StatsAPI, 8x/day) → selectConfirmedLineup → full-game sim",
    hardExclusionReachable: true,
    state: events.length ? "ACTIVE" : "NO_SIMULATED_EVENTS",
    slate: day, confirmedLineups: confirmed, totalSimulated: events.length, events,
    gaps: confirmed < events.length ? [
      `${events.length - confirmed} of ${events.length} simulated games ran on a PROP-DERIVED lineup because no batting order had been posted yet. A batter enters that lineup because a sportsbook posted a line for him, so a player scratched AFTER the lines were posted can still be simulated. The artifact records this as level "degraded" with lineupSource "prop-derived" and the hourly lineup refresh replaces it once the order lands — it is a labelled weaker state, not a silent one.`,
    ] : [],
  };
}

/* ── EPL ─────────────────────────────────────────────────────────────────────────────────────────
 * The producer already states this gap in its own artifact, which is why it is quoted rather than
 * paraphrased: there is no injury or suspension feed, and the rows are conditional by construction.
 */
function auditEpl() {
  const a = read(path.join(APP, "public/data/soccer/epl/player-projections/latest.json"));
  if (!a) return { owner: "epl player-projections", state: "NO_ARTIFACT", events: [] };
  const events = (a.fixtures ?? []).map((f) => {
    const players = f.players ?? [];
    return {
      eventId: f.eventId, matchup: f.matchup, startUtc: f.kickoffUtc,
      lineupState: f.lineupState ?? null,
      projectedPlayers: players.length,
      conditionalPlayers: players.filter((p) => p.conditional).length,
      excluded: [],
    };
  });
  return {
    owner: "epl player-projections (ESPN squads + per-player rates) — TEAM forecasts are a separate owner",
    hardExclusionReachable: false,
    state: events.length ? "ACTIVE" : "NO_UPCOMING_FIXTURES",
    withLineup: a.counts?.withLineup ?? null, awaitingLineup: a.counts?.awaitingLineup ?? null,
    events,
    gaps: [
      ...(a.limitations ?? []).filter((l) => /injur|suspen|unavailab|participation/i.test(l)),
      "Every published row is conditional — P(scores | he starts) — and the artifact says so, so no participation percentage is fabricated. What is missing is the feed that would let an unavailable player be REMOVED from the list in the first place.",
      "⚠ MEASURED 2026-09-25, and the free path does NOT close it. ESPN serves /soccer/eng.1/injuries (HTTP 200, injuries: []) and its EPL roster endpoint carries per-athlete `injuries` and `status` fields — but across 149 athletes on five clubs there were ZERO non-active statuses and ZERO populated injury arrays. The shape exists; the data does not. Wiring an always-empty feed in would be worse than leaving the gap open, because an empty blocked set is indistinguishable from a week in which nobody is hurt — the exact failure the NFL builder refuses by name. Closing this needs a different provider, which is a founder decision.",
    ],
  };
}

/* ── UFC ─────────────────────────────────────────────────────────────────────────────────────────
 * Owner: classifyUfcLineage over consecutive schedule captures. Its rule is the one this audit
 * exists to protect — removal is the observation, cancellation is never inferred from absence.
 */
function auditUfc() {
  const dir = path.join(ROOT, "data/internal/research/ufc/lineage");
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith(".json")).sort().reverse();
  if (!files.length) return { owner: "track-ufc-card-lineage.mjs", state: "NO_ARTIFACT", events: [] };
  const a = read(path.join(dir, files[0]));
  const changes = a?.changes ?? [];
  const byClass = {};
  for (const c of changes) byClass[c.class] = (byClass[c.class] ?? 0) + 1;
  return {
    owner: "track-ufc-card-lineage.mjs · classifyUfcLineage over consecutive schedule captures",
    hardExclusionReachable: true,
    state: a?.state ?? "UNKNOWN",
    receipt: files[0], generatedAt: a?.generatedAt ?? null,
    boutClasses: byClass,
    excluded: changes.filter((c) => c.class === "REMOVED" || c.class === "REPLACED").map((c) => ({ id: c.providerBoutId, state: c.class })),
    events: [],
    gaps: [
      "Weigh-in and medical status are not ingested; a bout that will be cancelled at the scale is indistinguishable from one that will not until the provider drops it from the card.",
      "A quiet week writes a NO_CHANGE receipt on purpose — during fight week 'nothing changed' must be a recorded observation rather than an assumption.",
    ],
  };
}

const report = {
  schemaVersion: 1,
  artifact: "availability-audit",
  dataClass: "INTERNAL_RESEARCH",
  generatedAt: NOW,
  question: "Can a participant who cannot or is not expected to play still enter the active simulation population?",
  sports: { nfl: auditNfl(), mlb: auditMlb(), epl: auditEpl(), ufc: auditUfc() },
};

for (const [sport, r] of Object.entries(report.sports)) {
  const excl = (r.events ?? []).reduce((n, e) => n + (e.excluded?.length ?? 0), 0) + (r.excluded?.length ?? 0);
  console.log(`${sport.padEnd(4)} ${String(r.state).padEnd(20)} events=${String((r.events ?? []).length).padStart(3)}  excluded=${String(excl).padStart(3)}  hardExclusion=${r.hardExclusionReachable === true ? "REACHABLE" : "NOT REACHABLE"}`);
  for (const g of r.gaps ?? []) console.log(`       gap: ${g.slice(0, 150)}${g.length > 150 ? "…" : ""}`);
}

const out = arg("json");
if (out) { fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true }); fs.writeFileSync(path.join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`); console.log(`\nwrote ${out}`); }
