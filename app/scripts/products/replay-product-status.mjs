#!/usr/bin/env node
/**
 * Stage 4A replay. Runs the unwired product-status contract (schema 1, founder-decided) against the committed
 * recommendation universe and compares its verdict with today's leg floor (engine-v2 leg-floor@2). 4A is
 * behaviour-neutral only if the diff count is zero; any slice that changes it stops.
 *
 *   node --experimental-strip-types --no-warnings app/scripts/products/replay-product-status.mjs [--json]
 *
 * Reads committed artifacts only (data/internal/products/recommendation-universe/<date>.json for the dates and
 * asOf instants, then rebuilds each day's full receipt list with buildRecommendationUniverse). Writes nothing.
 * The live-record scorecard is read from git AS OF each day (today's file is newer and would refuse everything);
 * the pinned test passes a fixture instead (replay-product-status.test.mjs).
 *
 * Freshness, the live-record scope (Q8 MODEL-ONLY) and price age (Q5) come from the contract's own defaults: the
 * replay passes no overrides.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildRecommendationUniverse } from "./build-recommendation-universe.mjs";
import { capabilityState } from "../../src/lib/sport-capability-registry.ts";
import { resolveProductStatus, PRODUCT } from "../../src/lib/products/product-status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const coverage = read(path.join(REPO, "data/ask-projection/v1/coverage.json"));
/** The scorecard as committed at or before `asOf` (the file is overwritten nightly; git keeps each version). */
const HEALTH_PATH = "app/public/data/admin/model-health.json";
export function healthFromGit(asOf) {
  const sha = execFileSync("git", ["-C", REPO, "log", "-1", "--format=%H", `--before=${asOf}`, "--", HEALTH_PATH], { encoding: "utf8" }).trim();
  return sha ? JSON.parse(execFileSync("git", ["-C", REPO, "show", `${sha}:${HEALTH_PATH}`], { encoding: "utf8", maxBuffer: 64e6 })) : null;
}

/** Receipt family → coverage market key, per sport. Unlisted → null (coverage unknown). */
const COVERAGE_KEY = {
  mlb: { team_result: "moneyline", team_spread: "run_line", team_total: "total", PLAYER: "player_props" },
  nfl: { team_result: "moneyline", team_spread: "market_consensus", team_total: "totals", anytime_td: "anytime_touchdown", PLAYER: "player_props" },
};
/** Receipt family → scorecard family id (GTP model calls only). */
const HEALTH_KEY = {
  mlb: { team_result: "mlb_moneyline", team_spread: "mlb_run_line", team_total: "mlb_total" },
  nfl: { team_result: "nfl_winner", anytime_td: "nfl_anytime_td", player_receptions: "nfl_player_receptions", player_reception_yds: "nfl_player_reception_yds", player_rush_yds: "nfl_player_rush_yds", player_pass_yds: "nfl_player_pass_yds" },
};

function coverageRow(sport, legClass, family) {
  const key = COVERAGE_KEY[sport]?.[family] ?? (legClass === "PLAYER" ? COVERAGE_KEY[sport]?.PLAYER : null);
  const row = coverage.markets.find((m) => m.sport === sport && m.market === key);
  if (!row) return null;
  return { status: row.status, demoted: (row.demotedFamilies ?? []).includes(family) };
}

function healthEntry(health, sport, family) {
  const id = HEALTH_KEY[sport]?.[family];
  const f = id && health ? health.families.find((x) => x.id === id) : null;
  return f ? { state: f.state, generatedAt: health.generatedAt } : null;
}

function inputFor(rec, { asOf, granted, admitsMarketImplied, health }) {
  const r = rec, id = r.identity, m = r.market, f = r.forecast, c = r.context;
  return {
    product: id.sport === "mlb" && r.legClass === "TEAM" ? PRODUCT.BANK_BUILDER : PRODUCT.SUGGESTED_PARLAY,
    asOf,
    sport: id.sport,
    family: m.family,
    eventId: id.eventId,
    eventStartUtc: id.eventStartUtc,
    registryState: capabilityState(id.sport),
    coverage: coverageRow(id.sport, r.legClass, m.family),
    health: healthEntry(health, id.sport, m.family), // the contract ignores it for price-only legs (Q8)
    familyGranted: granted.has(`${id.sport}:${m.family}`),
    probabilityKind: f.probabilityKind,
    gtpProbability: f.probabilityKind === "MODEL" ? f.probability : null,
    marketImpliedProbability: m.marketImpliedProbability ?? null,
    marketImpliedAdmitted: admitsMarketImplied && r.legClass === "TEAM",
    isPlayer: r.legClass === "PLAYER",
    availabilityState: c.availabilityState,
    roleState: c.roleState,
    market: { price: m.price, capturedAt: m.marketCapturedAt },
    settlementProven: c.settlementSupport === "PROVEN",
  };
}

/**
 * Replay the committed universe days. `healthAsOf(asOf)` returns the scorecard document to use for that day.
 * `dates` limits the replay to a fixed window (the pinned test uses one; live data keeps growing).
 */
export function replayProductStatus({ healthAsOf = healthFromGit, dates = null } = {}) {
  const dir = path.join(REPO, "data/internal/products/recommendation-universe");
  const days = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => read(path.join(dir, f)))
    .filter((d) => !dates || dates.includes(d.date));
  const report = [];
  for (const day of days) {
    const u = buildRecommendationUniverse({ date: day.date, now: day.asOf });
    const granted = new Set(u.grantedFamilies ?? []);
    const health = healthAsOf(day.asOf);
    const diff = new Map();
    let v2Eligible = 0, contractEligible = 0;
    for (const row of u._rows) {
      const rec = row.receipt, v2 = row.evaluation ?? rec.evaluation;
      const s = resolveProductStatus(inputFor(rec, { asOf: day.asOf, granted, admitsMarketImplied: !!u.floor?.admitsMarketImplied, health }));
      if (v2.eligible) v2Eligible++;
      if (s.eligible) contractEligible++;
      if (v2.eligible !== s.eligible) {
        const k = `${rec.identity.sport}/${rec.market.family} v2=${v2.eligible} contract=${s.eligible} [${s.reasonCodes.join(",")}] vs v2 [${v2.exclusionCodes.join(",")}]`;
        diff.set(k, (diff.get(k) ?? 0) + 1);
      }
    }
    report.push({ date: day.date, asOf: day.asOf, healthAt: health?.generatedAt ?? null, mlbTotal: health?.families?.find((x) => x.id === "mlb_total")?.state ?? null, receipts: u._rows.length, v2Eligible, contractEligible, committedEligible: day.counts.eligible, diffs: Object.fromEntries(diff) });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = replayProductStatus();
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(report, null, 1) + "\n");
  else for (const r of report) {
    console.log(`${r.date} health@${r.healthAt} mlb_total=${r.mlbTotal} receipts=${r.receipts} committed=${r.committedEligible} v2=${r.v2Eligible} contract=${r.contractEligible}`);
    for (const [k, n] of Object.entries(r.diffs)) console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
}
