/**
 * NFL event-bound player availability / role evidence (Program 175 · Release A).
 *
 * WHAT THIS RESOLVES. Every player family has been held at ROLE_UNCERTAIN with the same sentence
 * for three programs. That is the right answer, but it was asserted rather than evidenced. This
 * builds the actual artifact: for every eligible event, a per-player availability row joined by
 * DURABLE PROVIDER ID from the sources this repository already has rights to, with an explicit
 * state per player and a named next observation window when the evidence does not exist yet.
 *
 * SOURCES (registered, keyless, already in use for months — no new rights question):
 *   rosters   app/public/data/nfl/rosters/latest.json      espn_site_api_nfl, 168h freshness bound
 *   injuries  data/internal/research/injuries/nfl/latest.json  espn injuries feed, 24h bound
 * NOT AVAILABLE, and stated rather than faked: official game-day actives/inactives (published
 * ~90 minutes pre-kickoff and not carried by any source this repo is authorized to read), and
 * preseason snap/series scripting (not published at all). Both are why ACTIVE_EXPECTED is
 * unreachable in preseason no matter how much roster data exists.
 *
 * THE RULE THIS ENCODES: absence from an injury report is not evidence of health, and a roster
 * spot is not evidence of playing time. A player with no blocking status in preseason is
 * ROLE_UNCERTAIN — not active — because nobody has published how much he will play.
 *
 * Usage: node scripts/nfl/build-nfl-role-evidence.mjs --now <iso> [--lookahead-hours 30]
 * Writes: data/internal/nfl/role-evidence/<date>.json (PRIVATE) + a public summary in the index
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlayerRegistry } from "../../src/lib/sports/nfl/player-identity.mjs";
import { checkFreshness } from "../../src/lib/sports/nfl/season-context.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "30"));
const DATE = NOW.slice(0, 10);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The closed availability vocabulary. Each says exactly what evidence produced it. */
export const AVAILABILITY_STATES = Object.freeze([
  "ACTIVE_EXPECTED", "ACTIVE_UNCERTAIN", "QUESTIONABLE", "OUT", "NOT_ON_ROSTER", "SOURCE_STALE", "NOT_YET_PUBLISHED", "UNSUPPORTED",
]);

/** What each source can and cannot establish — committed so the limits are auditable. */
const SOURCE_CONTRACT = Object.freeze({
  rosters: { id: "espn_site_api_nfl", establishes: "team membership and position", cannotEstablish: "whether the player dresses, or how much he plays", freshnessBoundH: 168, rights: "keyless public JSON, point-in-time, attributed, facts only" },
  injuries: { id: "espn_injuries_nfl", establishes: "a published injury designation when one exists", cannotEstablish: "health in the absence of a designation — silence is not a clean bill", freshnessBoundH: 24, rights: "keyless public JSON, designations only; editorial prose is never stored" },
  gameDayActives: { id: null, establishes: null, cannotEstablish: "everything — no authorized source carries the official inactive list", status: "UNSUPPORTED", nextObservationWindow: "~90 minutes before kickoff, if a rights-cleared source is ever added" },
  snapScripting: { id: null, establishes: null, cannotEstablish: "preseason series/snap plans are not published by anyone", status: "UNSUPPORTED" },
});

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const rosters = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const injuries = read(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json"));
if (!schedule || !rosters) { console.error("REFUSED: no schedule or roster capture — cannot build role evidence"); process.exit(2); }

const rosterFresh = checkFreshness("rosters", { sourceAsOf: rosters.sourceAsOf ?? rosters.generatedAt, fetchedAt: rosters.generatedAt }, NOW);
const injuryFresh = injuries ? checkFreshness("injuries", { sourceAsOf: injuries.sourceAsOf ?? injuries.generatedAt, fetchedAt: injuries.generatedAt }, NOW) : { state: "UNDATED" };

const registry = buildPlayerRegistry([rosters]);
const injuryByPlayer = new Map();
for (const e of injuries?.entries ?? []) if (e?.athleteId != null) injuryByPlayer.set(`nfl-athlete-${e.athleteId}`, e);

const BLOCKING = /^(out|injured\s*reserve|ir|suspend|pup|nfi)/i;
const QUESTIONABLE = /^(questionable|doubtful)/i;

const nowMs = Date.parse(NOW);
const events = (schedule.rows ?? []).filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs && Date.parse(r.dateUtc) <= nowMs + LOOKAHEAD_H * 3.6e6);

const eventRows = [];
for (const ev of events) {
  const preseason = (ev.seasonType ?? 0) === 1;
  const teams = {};
  for (const side of ["home", "away"]) {
    const abbr = ev[side].abbr;
    const players = [...registry.players.values()].filter((p) => p.teamAbbr === abbr);
    const rows = players.map((p) => {
      const inj = injuryByPlayer.get(p.playerId) ?? null;
      const status = String(inj?.status ?? "");
      let state; let because;
      if (rosterFresh.state !== "FRESH") { state = "SOURCE_STALE"; because = `roster capture is ${rosterFresh.state.toLowerCase()}`; }
      else if (injuryFresh.state !== "FRESH") { state = "SOURCE_STALE"; because = `injury feed is ${injuryFresh.state.toLowerCase()} — silence from a stale feed proves nothing`; }
      else if (BLOCKING.test(status)) { state = "OUT"; because = `published designation: ${inj.status}`; }
      else if (QUESTIONABLE.test(status)) { state = "QUESTIONABLE"; because = `published designation: ${inj.status}`; }
      else if (preseason) {
        // THE HONEST PRESEASON ANSWER: rostered, no blocking designation, and nobody has said
        // whether he plays a series or a half. That is not "active" — it is unknown.
        state = "NOT_YET_PUBLISHED";
        because = "no source publishes preseason playing time; the official inactive list is not carried by any authorized source";
      } else { state = "ACTIVE_UNCERTAIN"; because = "on the roster with no blocking designation, but game-day actives are not carried by an authorized source"; }
      return { playerId: p.playerId, name: p.name, position: p.position ?? null, team: abbr, state, because, injuryStatus: inj?.status ?? null, injuryStatedAt: inj?.statedAt ?? null };
    });
    const counts = {};
    for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
    teams[abbr] = { teamAbbr: abbr, rosterSize: players.length, counts, players: rows, accounting: { input: players.length, classified: rows.length, exact: players.length === rows.length } };
  }
  const anyActive = Object.values(teams).some((t) => (t.counts.ACTIVE_EXPECTED ?? 0) > 0);
  eventRows.push({
    providerEventId: ev.providerEventId,
    canonicalEventId: `nfl-${ev.providerEventId}`,
    matchup: `${ev.away.abbr} @ ${ev.home.abbr}`,
    kickoffUtc: ev.dateUtc,
    seasonType: ev.seasonType,
    /** the family-level verdict every player model consumes */
    familyVerdict: anyActive ? "ROLE_EVIDENCE_AVAILABLE" : "ROLE_UNCERTAIN",
    verdictReason: anyActive
      ? "at least one player has event-bound active evidence"
      : preseason
        ? "preseason: rosters and injury designations exist, but no source publishes who dresses or how much they play. Player projections are withheld rather than invented."
        : "no event-bound active evidence is available from an authorized source",
    nextObservationWindow: preseason
      ? "the regular season, when weekly injury reports carry participation designations (and only if a rights-cleared actives source is added)"
      : `~90 minutes before ${ev.dateUtc}, if a rights-cleared actives source is added`,
    teams,
  });
}

const artifact = {
  schemaVersion: 1,
  artifact: "nfl-role-evidence",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  date: DATE,
  states: AVAILABILITY_STATES,
  sources: SOURCE_CONTRACT,
  freshness: { rosters: rosterFresh.state, injuries: injuryFresh.state },
  accounting: { eventsInWindow: events.length, evented: eventRows.length, exact: events.length === eventRows.length },
  honesty: [
    "a roster spot is not evidence of playing time, and absence from an injury report is not evidence of health",
    "ACTIVE_EXPECTED is unreachable today by construction: no authorized source carries the official game-day inactive list",
    "NOT_YET_PUBLISHED names a real future observation window; UNSUPPORTED means no source exists at all — they are different answers",
  ],
  events: eventRows,
};
if (!artifact.accounting.exact) { console.error("REFUSED: event accounting does not reconcile"); process.exit(3); }

const outPath = path.join(ROOT, "data/internal/nfl/role-evidence", `${DATE}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 1));
fs.writeFileSync(path.join(path.dirname(outPath), "latest.json"), JSON.stringify(artifact, null, 1));

const verdicts = {};
for (const e of eventRows) verdicts[e.familyVerdict] = (verdicts[e.familyVerdict] ?? 0) + 1;
console.log(`role evidence ${DATE}: ${eventRows.length} events · ${JSON.stringify(verdicts)}`);
console.log(`  freshness: rosters ${rosterFresh.state} · injuries ${injuryFresh.state}`);
if (eventRows[0]) {
  const t = Object.values(eventRows[0].teams)[0];
  console.log(`  ${eventRows[0].matchup} ${t.teamAbbr}: ${JSON.stringify(t.counts)} of ${t.rosterSize}`);
  console.log(`  next observation: ${eventRows[0].nextObservationWindow}`);
}
