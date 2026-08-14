/**
 * NFL participation intelligence (Program 182 · Release A). PRIVATE_RESEARCH.
 *
 * The authoritative, versioned answer to "who is expected to play, and how is opportunity spread?"
 * Preseason player projections are invalid without workload uncertainty, so this publishes
 * DISTRIBUTIONS with explicit unallocated mass — never a point guess.
 *
 * THE HONEST STARTING POINT. No authorized actives, inactives, depth-chart or coach-statement feed
 * is registered for this window. So this artifact cannot say a player WILL play, and it does not:
 * every named player is `AVAILABLE_ROLE_UNCERTAIN`, and the closed vocabulary's confident states
 * (`EXPECTED_STARTER`, `EXPECTED_ROTATION`, `CONFIRMED_OUT`) are unreachable until such a source is
 * registered. That is a refusal with a named cause, not a gap.
 *
 * THE PRESEASON TRAP THIS EXISTS TO AVOID. The role corpus is built from REGULAR-SEASON usage: it
 * says a starting quarterback takes ~70% of his team's pass attempts. In August that number is
 * actively misleading — starters routinely play one or two series. Carrying the corpus share
 * through unchanged would hand a preseason projection a full-game workload and call it evidence.
 *
 * So each player's share is widened by a PRESEASON ROTATION FACTOR whose own distribution is wide
 * and asymmetric (a starter may play one drive or most of a half), the residual is published as
 * explicit `unallocatedMass`, and the artifact states in words that the basis is regular-season.
 * Nothing here claims to know the rotation; it quantifies not knowing it.
 *
 * Usage: node scripts/nfl/build-nfl-participation.mjs --now <iso> [--lookahead-hours 48]
 * Writes: data/internal/nfl/participation/<date>/<providerEventId>.json   (append-only revisions)
 *         app/public/data/nfl/participation-summary.json                  (PUBLIC_DERIVED)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { PARTICIPATION_STATES, REQUIRES_AUTHORIZED_ACTIVES } from "../../src/lib/sports/nfl/participation-states.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "48"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };


/**
 * States that require a source we do not have. Listed explicitly so the absence is a documented
 * refusal rather than an accident of which branch happened to be written.
 */

/**
 * Preseason rotation factor: what fraction of a regular-season workload a listed player actually
 * sees in an August game. Deliberately wide and asymmetric — a nominal starter may take one series
 * (~0.08 of a game) or push toward a half (~0.55). The p50 sits low because that is what preseason
 * usage looks like, and the width is the point: it is uncertainty, not a forecast.
 */
const ROTATION_FACTOR = Object.freeze({
  QB: { p10: 0.05, p50: 0.20, p90: 0.55 },
  RB: { p10: 0.10, p50: 0.30, p90: 0.65 },
  WR: { p10: 0.10, p50: 0.30, p90: 0.65 },
  TE: { p10: 0.10, p50: 0.30, p90: 0.65 },
  DEFAULT: { p10: 0.10, p50: 0.35, p90: 0.75 },
});

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const roleShares = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
if (!schedule?.rows || !roleShares?.teams) {
  console.error("REFUSED: schedule or role-share evidence unreadable — participation is never guessed from an odds listing");
  process.exit(2);
}
// Any registered source that could promote a player past AVAILABLE_ROLE_UNCERTAIN. None today.
const activesSource = read(path.join(ROOT, "data/internal/research/nfl/actives/current.json"));

const nowMs = Date.parse(NOW);
const events = schedule.rows
  .filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs && Date.parse(r.dateUtc) <= nowMs + LOOKAHEAD_H * 3.6e6)
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

const MARKETS = ["passAttempts", "rushAttempts", "targets"];
const r4 = (x) => Number(x.toFixed(4));

/** Widen one corpus share into a preseason opportunity distribution. */
function shareDistribution(share, position) {
  const f = ROTATION_FACTOR[position] ?? ROTATION_FACTOR.DEFAULT;
  return { p10: r4(share * f.p10), p50: r4(share * f.p50), p90: r4(share * f.p90) };
}

const written = [];
const refused = [];

for (const ev of events) {
  const teams = {};
  let ok = true;
  for (const side of ["home", "away"]) {
    const abbr = ev[side]?.abbr;
    const teamRoles = abbr ? roleShares.teams[abbr] : null;
    if (!teamRoles) { ok = false; break; }
    const markets = {};
    for (const m of MARKETS) {
      const players = (teamRoles[m]?.players ?? []).map((p) => {
        // Every named player is ROLE_UNCERTAIN today: no registered source can confirm otherwise.
        const state = "AVAILABLE_ROLE_UNCERTAIN";
        return {
          playerId: p.playerId,
          name: p.name,
          position: p.position ?? null,
          state,
          stateReason: "no registered actives, inactives, depth-chart or coach-statement source covers this window, so participation cannot be confirmed — this is a refusal with a named cause, not an estimate",
          regularSeasonShare: r4(p.share),
          preseasonShare: shareDistribution(p.share, p.position),
          evidence: { nEff: p.nEff, games: p.games, basis: p.shareBasis, sourceAsOf: roleShares.rosterAsOf },
        };
      });
      // Named mass uses the MEDIAN of each distribution; everything else is explicitly unallocated —
      // backups, unlisted players, and the part of the game the listed players do not play.
      const namedMass = players.reduce((s, p) => s + p.preseasonShare.p50, 0);
      markets[m] = {
        players,
        namedMassP50: r4(namedMass),
        unallocatedMass: r4(Math.max(0, 1 - namedMass)),
        reconciles: namedMass <= 1 + 1e-9,
        note: "shares are PRESEASON opportunity distributions derived from a regular-season basis and widened by a documented rotation factor. The unallocated mass is backups, unlisted players, and the share of the game the listed players do not take.",
      };
      if (!markets[m].reconciles) ok = false;
    }
    teams[abbr] = { markets, rosterAsOf: roleShares.rosterAsOf };
  }

  if (!ok) {
    refused.push({ providerEventId: ev.providerEventId, matchup: ev.shortName, state: "REFUSED", reason: "role evidence missing for a participant, or named share mass exceeded the team total" });
    continue;
  }

  const body = {
    schemaVersion: 1,
    artifact: "nfl-participation",
    dataClass: "PRIVATE_RESEARCH",
    providerEventId: ev.providerEventId,
    canonicalEventId: `nfl-${ev.providerEventId}`,
    matchup: ev.shortName,
    kickoffUtc: ev.dateUtc,
    generatedAt: NOW,
    sourceContract: {
      registered: ["ESPN roster capture (identities only)", "role-shares-v1 decayed-stint corpus (regular-season usage)"],
      absent: "authorized actives / inactives / depth chart / coach playing-time statements",
      whatAbsenceMeans: `without that source, ${REQUIRES_AUTHORIZED_ACTIVES.join(", ")} are all UNREACHABLE. Every named player stays AVAILABLE_ROLE_UNCERTAIN.`,
      basisWarning: "the share basis is REGULAR-SEASON usage. In preseason a nominal starter often plays one or two series, so carrying that basis through unchanged would hand a projection a full-game workload and call it evidence.",
    },
    rotationFactor: ROTATION_FACTOR,
    teams,
    cutoffSafe: Date.parse(roleShares.rosterAsOf) < Date.parse(ev.dateUtc),
  };
  body.inputHash = crypto.createHash("md5").update(JSON.stringify({ e: ev.providerEventId, r: roleShares.generatedAt, f: ROTATION_FACTOR })).digest("hex").slice(0, 16);

  const day = ev.dateUtc.slice(0, 10);
  const dir = path.join(ROOT, "data/internal/nfl/participation", day);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${ev.providerEventId}.json`);
  // Append-only: an existing artifact with different inputs becomes a stamped revision beside it.
  if (fs.existsSync(base)) {
    const existing = read(base);
    if (existing?.inputHash !== body.inputHash) {
      fs.writeFileSync(path.join(dir, `${ev.providerEventId}-rev-${NOW.slice(11, 16).replace(":", "")}Z.json`), JSON.stringify({ ...body, revisionOf: `${ev.providerEventId}.json`, priorInputHash: existing?.inputHash ?? null }, null, 1) + "\n");
    }
  } else {
    fs.writeFileSync(base, JSON.stringify(body, null, 1) + "\n");
  }
  written.push({ providerEventId: ev.providerEventId, matchup: ev.shortName, kickoffUtc: ev.dateUtc, teams: Object.keys(teams) });
}

// ── PUBLIC summary: what we know, said plainly, with the limitation first ──────────────────────
const summary = {
  schemaVersion: 1,
  artifact: "nfl-participation-public",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  eventsCovered: written.length,
  eventsRefused: refused.length,
  headline: "We do not know who will play in these preseason games — and we would rather size that uncertainty than hide it.",
  whyNotKnown:
    "No source we are authorized to use publishes confirmed actives, inactives or preseason playing-time plans for this window. So no player on this slate is listed as expected to start or expected to rotate; every one is marked role-uncertain.",
  whatWeDoInstead:
    "For each listed player we publish a RANGE of how much of his team's work he might take, not a single number. The range is deliberately wide because August starters often play one or two series, and the part of the game nobody on our list accounts for is published too, as unallocated share.",
  whyItMatters:
    "A player projection is only as good as the playing-time assumption behind it. Quoting a regular-season workload in August would make a projection look precise while being wrong for a reason that has nothing to do with the player.",
  states: { AVAILABLE_ROLE_UNCERTAIN: written.length ? "every named player on this slate" : "no events in window" },
  reachableStatesToday: ["AVAILABLE_ROLE_UNCERTAIN", "UNKNOWN", "SOURCE_STALE", "STARTED_LOCKED"],
  unreachableWithoutSource: REQUIRES_AUTHORIZED_ACTIVES,
};
fs.writeFileSync(path.join(APP, "public/data/nfl/participation-summary.json"), JSON.stringify(summary, null, 2) + "\n");

console.log(`nfl participation: ${written.length} events written · ${refused.length} refused · actives source ${activesSource ? "PRESENT" : "ABSENT"}`);
for (const w of written) console.log(`  ${w.matchup.padEnd(12)} ${w.kickoffUtc} · ${w.teams.join(" / ")}`);
for (const r of refused) console.log(`  REFUSED ${r.matchup}: ${r.reason}`);
if (written.length === 0 && events.length > 0) { console.error("REFUSED: events existed but none produced an artifact"); process.exit(3); }
