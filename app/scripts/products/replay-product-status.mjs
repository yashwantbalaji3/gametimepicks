#!/usr/bin/env node
/**
 * PREP ONLY (Product Engine, Stage 4). Replays the unwired product-status prototype against the committed
 * recommendation universe and compares its verdict with today's leg floor (engine-v2 leg-floor@2).
 *
 *   node --experimental-strip-types --no-warnings app/scripts/products/replay-product-status.mjs [--json]
 *
 * Reads committed artifacts only (data/internal/products/recommendation-universe/<date>.json for the dates and
 * asOf instants, then rebuilds each day's full receipt list with buildRecommendationUniverse). Writes nothing.
 *
 * Two health joins are compared, because the prototype as exported joins the live-record scorecard to a family
 * by key even when the leg carries only a sportsbook price:
 *   A · "all-legs": health applies to every leg (market-priced legs included).
 *   B · "model-only":  health applies only when the leg carries a GameTimePicks model probability.
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
function healthAsOf(asOf) {
  const sha = execFileSync("git", ["-C", REPO, "log", "-1", "--format=%H", `--before=${asOf}`, "--", HEALTH_PATH], { encoding: "utf8" }).trim();
  return sha ? JSON.parse(execFileSync("git", ["-C", REPO, "show", `${sha}:${HEALTH_PATH}`], { encoding: "utf8", maxBuffer: 64e6 })) : null;
}
let health = null;

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

function healthEntry(sport, family, { modelOnly, probabilityKind }) {
  if (modelOnly && probabilityKind !== "MODEL") return { skip: true };
  const id = HEALTH_KEY[sport]?.[family];
  const f = id && health ? health.families.find((x) => x.id === id) : null;
  return f ? { state: f.state, generatedAt: health.generatedAt } : null;
}

function inputFor(rec, { asOf, granted, admitsMarketImplied, modelOnly }) {
  const r = rec, id = r.identity, m = r.market, f = r.forecast, c = r.context;
  const h = healthEntry(id.sport, m.family, { modelOnly, probabilityKind: f.probabilityKind });
  return {
    product: id.sport === "mlb" && r.legClass === "TEAM" ? PRODUCT.BANK_BUILDER : PRODUCT.SUGGESTED_PARLAY,
    asOf,
    sport: id.sport,
    family: m.family,
    eventId: id.eventId,
    eventStartUtc: id.eventStartUtc,
    registryState: capabilityState(id.sport),
    coverage: coverageRow(id.sport, r.legClass, m.family),
    // model-only join: a market-priced leg has no GTP live record to read, so it is judged as "fresh, not breached".
    health: h?.skip ? { state: null, generatedAt: asOf } : h,
    familyGranted: granted.has(`${id.sport}:${m.family}`),
    probabilityKind: f.probabilityKind,
    gtpProbability: f.probabilityKind === "MODEL" ? f.probability : null,
    marketImpliedProbability: m.marketImpliedProbability ?? null,
    marketImpliedAdmitted: admitsMarketImplied && r.legClass === "TEAM",
    isPlayer: r.legClass === "PLAYER",
    availabilityState: c.availabilityState,
    roleState: c.roleState,
    market: { price: m.price, capturedAt: m.marketCapturedAt },
    maxPriceAgeMs: 12 * 3600e3,
    maxHealthAgeMs: 72 * 3600e3,
    settlementProven: c.settlementSupport === "PROVEN",
    liveRecordScope: modelOnly ? "MODEL_ONLY" : "ALL_LEGS",
  };
}

const dir = path.join(REPO, "data/internal/products/recommendation-universe");
const days = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => read(path.join(dir, f)));
const report = [];
for (const day of days) {
  const u = buildRecommendationUniverse({ date: day.date, now: day.asOf });
  const granted = new Set(u.grantedFamilies ?? []);
  health = healthAsOf(day.asOf);
  for (const variant of ["all-legs", "model-only"]) {
    const diff = new Map();
    let v2Eligible = 0, protoEligible = 0;
    for (const row of u._rows) {
      const rec = row.receipt, v2 = row.evaluation ?? rec.evaluation;
      const s = resolveProductStatus(inputFor(rec, { asOf: day.asOf, granted, admitsMarketImplied: !!u.floor?.admitsMarketImplied, modelOnly: variant === "model-only" }));
      if (v2.eligible) v2Eligible++;
      if (s.eligible) protoEligible++;
      if (v2.eligible !== s.eligible) {
        const k = `${rec.identity.sport}/${rec.market.family} v2=${v2.eligible} proto=${s.eligible} [${s.reasonCodes.join(",")}] vs v2 [${v2.exclusionCodes.join(",")}]`;
        diff.set(k, (diff.get(k) ?? 0) + 1);
      }
    }
    report.push({ date: day.date, asOf: day.asOf, healthAt: health?.generatedAt ?? null, mlbTotal: health?.families?.find((x) => x.id === "mlb_total")?.state ?? null, variant, receipts: u._rows.length, v2Eligible, protoEligible, committedEligible: day.counts.eligible, diffs: Object.fromEntries(diff) });
  }
}

if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(report, null, 1) + "\n");
else for (const r of report) {
  console.log(`${r.date} ${r.variant.padEnd(11)} health@${r.healthAt} mlb_total=${r.mlbTotal} receipts=${r.receipts} committed=${r.committedEligible} v2=${r.v2Eligible} proto=${r.protoEligible}`);
  for (const [k, n] of Object.entries(r.diffs)) console.log(`   ${String(n).padStart(4)}  ${k}`);
}
