/**
 * EPL current-results adapter (Program 154 · Release A) — the operational bridge from the results
 * capture to the PROVEN settlement contract, deployable before opening day.
 *
 * States, honest by construction:
 *   NOT_CONFIGURED   no capture artifact exists (adapter says so; never invents an empty slate)
 *   PRESEASON        capture exists, season not started — fresh stamps, zero rows, the truth
 *   NO_RESULTS_YET   season started, source fresh, no completed fixture yet
 *   SOURCE_STALE     capture exists but its stamps exceed the freshness window
 *   RESULTS          completed fixtures exist — each joins by CANONICAL KICKOFF IDENTITY to the
 *                    committed fixture capture (never fuzzy names), grades through the FT-only
 *                    settlement contract, and reconciles exactly once
 *
 * Join discipline: ESPN result rows carry ESPN ids; the fixture capture carries openfootball
 * refs. The bridge is the canonical `soccer:epl:<home-v-away>:<kickoff-minute>` identity BUILT BY
 * THE SAME lane function on both sides — identityFromFixture — so a result that cannot resolve
 * both clubs and kickoff QUARANTINES with its reason instead of settling anything.
 */
import fs from "node:fs";
import path from "node:path";

import { identityFromFixture } from "./epl-identity.ts";
import { buildEplClubIndex } from "./epl-clubs.ts";
import { ESPN_SCHEDULE_FILE, confirmFixtureKickoffs, normalizeUtc, pairOf, PAIR_JOIN_WINDOW_DAYS } from "../sports/epl/kickoff-truth.mjs";
import { gradeEplLeg } from "../sports/epl/settlement-contract.mjs";

const RESULTS_PATH = () => path.join(process.cwd(), "public", "data", "soccer", "epl", "results", "latest.json");
const FIXTURES_DIR = () => path.join(process.cwd(), "public", "data", "soccer", "epl", "fixtures");

function readScheduleCapture() {
  try { return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR(), "..", ESPN_SCHEDULE_FILE), "utf8")); } catch { return null; }
}

function newestFixtureCapture() {
  try {
    const files = fs.readdirSync(FIXTURES_DIR()).filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR(), files[files.length - 1]), "utf8"));
  } catch { return null; }
}


export function loadCurrentEplResults({ nowIso, artifact: artifactOverride, fixtures: fixturesOverride, espnSchedule: espnScheduleOverride, freshWindowHours = 36 } = {}) {
  // `artifact: null` means "none exists" (tests, unconfigured); only UNDEFINED falls to disk.
  const artifact = artifactOverride !== undefined ? artifactOverride : (() => { try { return JSON.parse(fs.readFileSync(RESULTS_PATH(), "utf8")); } catch { return null; } })();
  if (!artifact) {
    return { state: "NOT_CONFIGURED", results: [], quarantined: [], note: "no results capture artifact exists — run scripts/epl/capture-epl-results.mjs" };
  }
  const ageH = (Date.parse(nowIso) - Date.parse(artifact.sourceAsOf ?? artifact.generatedAt ?? "")) / 3_600_000;
  const stale = !Number.isFinite(ageH) || ageH < 0 || ageH > freshWindowHours;

  const completed = (artifact.rows ?? []).filter((r) => /^STATUS_FULL_TIME|^STATUS_FINAL/.test(r.statusRaw ?? ""));
  if (completed.length === 0) {
    const state = stale ? "SOURCE_STALE" : Date.parse(nowIso) < Date.parse(`${artifact.seasonStart}T00:00:00Z`) ? "PRESEASON" : "NO_RESULTS_YET";
    return { state, results: [], quarantined: [], sourceAsOf: artifact.sourceAsOf, ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null };
  }

  // Fixture index by canonical identity — one entry per scheduled event, collisions impossible by
  // the identity contract (kickoff minute separates reverse fixtures).
  const fixtures = fixturesOverride ?? newestFixtureCapture();
  const fixtureByCanonical = new Map();
  for (const f of fixtures?.rows ?? []) fixtureByCanonical.set(f.eventId, f);
  /* Option A (2026-11-09): a fixture whose provisional slot ESPN has since confirmed at another minute is ALSO indexed
     under its confirmed canonical id — additive, so no earlier join changes. A result can then settle the fixture it
     belongs to; a forecast published under the provisional id still finds no result (the grader keys on the
     forecast's own id), so no settled record is touched. Unconfirmable fixtures add nothing. */
  if (!fixturesOverride) {
    const schedule = espnScheduleOverride !== undefined ? espnScheduleOverride : readScheduleCapture();
    if (schedule) {
      const index = buildEplClubIndex();
      const { confirmed } = confirmFixtureKickoffs(fixtures?.rows ?? [], schedule, {
        resolve: (n) => index.resolve(n),
        rebuildId: (f, kickoffIso) => { const o = identityFromFixture({ homeClub: f.homeClub, awayClub: f.awayClub, kickoffIso, status: "SCHEDULED" }, nowIso, index); return "identity" in o ? o.identity.eventId : null; },
        nowIso: schedule.capturedAt,
      });
      for (const f of confirmed) if (!fixtureByCanonical.has(f.eventId)) fixtureByCanonical.set(f.eventId, f);
    }
  }

  /* STABLE-KEY FALLBACK (2026-11-12, MW10 grading break): the canonical id embeds the kickoff minute, and the only fixture
     capture (openfootball, 2026-10-24) carries placeholder 15:00Z kickoffs, so a match ESPN played at another time (Everton
     v Coventry: real Fri 20:00Z) has a different canonical id on the result than on the fixture and the forecast. A
     result that misses the canonical index joins instead on the CLUB PAIR — the identity's pair segment (the two clubs;
     the pair meets twice a season, months apart) — when exactly one fixture with that pair kicks off within
     PAIR_JOIN_WINDOW_DAYS of the result AND names the same home club (the goals are the result's home/away, so an
     orientation mismatch would swap them: refused). Several, none, or a reversed fixture still quarantine. */
  let pairIndex = null;
  const byPair = new Map();
  for (const f of fixtures?.rows ?? []) { const k = pairOf(f.eventId); if (k) byPair.set(k, [...(byPair.get(k) ?? []), f]); }

  const quarantined = [];
  const results = [];
  const consumedFixtures = new Set();
  for (const r of completed) {
    const out = identityFromFixture({ homeClub: r.home, awayClub: r.away, kickoffIso: r.dateUtc }, nowIso);
    if (!("identity" in out)) { quarantined.push({ providerEventId: r.providerEventId, reason: `identity: ${out.rejection.code} — a result that cannot resolve does not settle anything` }); continue; }
    const canonical = out.identity.eventId;
    let fixture = fixtureByCanonical.get(canonical);
    let joinedBy = "CANONICAL";
    if (!fixture) {
      const clubs = pairIndex ?? (pairIndex = buildEplClubIndex());
      const same = (a, b) => { const x = clubs.resolve(a)?.canonical, y = clubs.resolve(b)?.canonical; return x != null && x === y; };
      const near = (byPair.get(pairOf(canonical)) ?? []).filter((f) => Math.abs(Date.parse(f.kickoffIso) - Date.parse(normalizeUtc(r.dateUtc))) <= PAIR_JOIN_WINDOW_DAYS * 86_400_000 && same(f.homeClub, r.home) && same(f.awayClub, r.away));
      if (near.length === 1) { fixture = near[0]; joinedBy = "CLUB_PAIR_WINDOW"; }
    }
    if (!fixture) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "no scheduled fixture with this canonical identity — unjoined results never settle" }); continue; }
    if (consumedFixtures.has(fixture.eventId) || consumedFixtures.has(canonical)) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "fixture already consumed — a result settles exactly once" }); continue; }
    consumedFixtures.add(canonical); consumedFixtures.add(fixture.eventId);
    if (!Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "completed status without integer goals — the StatsAPI lesson, quarantined" }); continue; }
    results.push({
      canonicalEventId: canonical,
      /* the fixture's own id (the one forecasts were published under) and how the result reached it */
      fixtureEventId: fixture.provisionalEventId ?? fixture.eventId,
      joinedBy,
      kickoffUtc: normalizeUtc(r.dateUtc),
      providerEventId: r.providerEventId,
      matchweek: fixture.matchweek ?? null,
      home: fixture.homeClub, away: fixture.awayClub,
      ftHome: r.ftHome, ftAway: r.ftAway,
      settlementResult: { status: "FULL_TIME", homeGoalsFT: r.ftHome, awayGoalsFT: r.ftAway },
      // The contract is exercised here so a defective row surfaces NOW, not on settle day.
      contractCheck: gradeEplLeg({ market: "match_result", side: "home" }, { status: "FULL_TIME", homeGoalsFT: r.ftHome, awayGoalsFT: r.ftAway }).outcome,
    });
  }
  return {
    state: stale ? "SOURCE_STALE" : "RESULTS",
    results, quarantined,
    reconciliation: { completedRows: completed.length, joined: results.length, quarantined: quarantined.length, exact: completed.length === results.length + quarantined.length },
    sourceAsOf: artifact.sourceAsOf,
    ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null,
  };
}
