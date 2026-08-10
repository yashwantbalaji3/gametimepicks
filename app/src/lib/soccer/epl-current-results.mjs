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
import { gradeEplLeg } from "../sports/epl/settlement-contract.mjs";

const RESULTS_PATH = () => path.join(process.cwd(), "public", "data", "soccer", "epl", "results", "latest.json");
const FIXTURES_DIR = () => path.join(process.cwd(), "public", "data", "soccer", "epl", "fixtures");

function newestFixtureCapture() {
  try {
    const files = fs.readdirSync(FIXTURES_DIR()).filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR(), files[files.length - 1]), "utf8"));
  } catch { return null; }
}

export function loadCurrentEplResults({ nowIso, artifact: artifactOverride, fixtures: fixturesOverride, freshWindowHours = 36 } = {}) {
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

  const quarantined = [];
  const results = [];
  const consumedFixtures = new Set();
  for (const r of completed) {
    const out = identityFromFixture({ homeClub: r.home, awayClub: r.away, kickoffIso: r.dateUtc }, nowIso);
    if (!("identity" in out)) { quarantined.push({ providerEventId: r.providerEventId, reason: `identity: ${out.rejection.code} — a result that cannot resolve does not settle anything` }); continue; }
    const canonical = out.identity.eventId;
    const fixture = fixtureByCanonical.get(canonical);
    if (!fixture) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "no scheduled fixture with this canonical identity — unjoined results never settle" }); continue; }
    if (consumedFixtures.has(canonical)) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "fixture already consumed — a result settles exactly once" }); continue; }
    consumedFixtures.add(canonical);
    if (!Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) { quarantined.push({ providerEventId: r.providerEventId, canonical, reason: "completed status without integer goals — the StatsAPI lesson, quarantined" }); continue; }
    results.push({
      canonicalEventId: canonical,
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
