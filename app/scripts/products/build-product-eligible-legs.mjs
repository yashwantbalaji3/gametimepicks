#!/usr/bin/env node
/**
 * Build the day's ProductEligibleLeg universe (v1.7 Phase C).
 *
 *   node scripts/products/build-product-eligible-legs.mjs --date YYYY-MM-DD --now <ISO> [--write]
 *
 * Reads only committed public artifacts (no network, no credits). Writes:
 *   data/internal/products/eligible-legs/<date>.json      every candidate, evaluated, with reason codes
 *   data/internal/products/eligible-legs/<date>.manifest.json   per-sport coverage
 *   public/data/products/availability/<date>.json + latest.json  PUBLIC-SAFE counts + plain reasons only
 *
 * `--now` is the publication instant every leg is evaluated at (time-lock). A replay passes the
 * historical publication instant; prices captured after it are refused as PRICE_CAPTURED_AFTER_AS_OF.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLeg, buildManifest, publicReasonFor, CONTRACT_SPORTS, MARKET_PRICED_LEG_POLICY, PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION } from "../../src/lib/products/eligible-leg/contract.mjs";
import { mlbCandidates } from "../../src/lib/products/eligible-leg/normalize-mlb.mjs";
import { nflCandidates } from "../../src/lib/products/eligible-leg/normalize-nfl.mjs";
import { ufcCandidates } from "../../src/lib/products/eligible-leg/normalize-ufc.mjs";
import { eplCandidates } from "../../src/lib/products/eligible-leg/normalize-epl.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");
const ROOT = path.join(APP, "public", "data");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const NOW = arg("--now", new Date().toISOString());
const DATE = arg("--date", NOW.slice(0, 10));
/** The ET calendar date of an instant — product dates are ET dates. */
export function etDate(iso) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/**
 * The newest NFL forecast file generated at or before `now`. Dated files are written ~23:00Z and cover the
 * games NOT yet kicked off, so a Sunday-morning publication reads Saturday night's file (time-lock).
 */
function nflForecastsAsOf(root, now) {
  const dir = path.join(root, "nfl", "forecasts");
  let best = null;
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      let doc; try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
      const at = doc?.generatedAt ?? null;
      if (at && at <= now && (!best || at > best.at)) best = { at, doc };
    }
  } catch { /* no dir */ }
  return best?.doc ?? null;
}

/** The newest NFL market capture taken at or before `now` (time-lock); falls back to latest.json. */
function nflMarketsAsOf(root, now) {
  const dir = path.join(root, "nfl", "markets");
  let best = null;
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /^capture-\d{8}T\d{4}\.json$/.test(x))) {
      const m = /^capture-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\.json$/.exec(f);
      const at = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`;
      if (at <= now && (!best || at > best.at)) best = { at, file: f };
    }
  } catch { /* no dir */ }
  if (best) { try { return JSON.parse(fs.readFileSync(path.join(dir, best.file), "utf8")); } catch { /* fall through */ } }
  try { const latest = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8")); return latest && (!latest.capturedAt || latest.capturedAt <= now) ? latest : null; } catch { return null; }
}

export function buildEligibleLegs({ date = DATE, now = NOW, root = ROOT } = {}) {
  const rj = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } };
  const sports = {
    mlb: mlbCandidates({ teamMarkets: rj(`mlb/team-markets/${date}.json`), schedule: rj(`mlb/statsapi-schedule/${date}.json`), date }),
    nfl: nflCandidates({ forecasts: nflForecastsAsOf(root, now), markets: nflMarketsAsOf(root, now) }),
    ufc: ufcCandidates({ odds: rj("ufc/odds-latest.json") }),
    epl: eplCandidates({ forecasts: rj(`soccer/epl/forecasts/${date}.json`) ?? rj("soccer/epl/forecasts/latest.json"), odds: rj("soccer/epl/odds/latest.json"), date }),
    nba: { candidates: [], rawForecastCount: 0, publicForecastCount: 0, ownerNote: "HISTORICAL_ONLY — no current NBA forecast owner; nothing is normalized by design" },
  };
  const legs = []; const perSport = {};
  for (const sport of CONTRACT_SPORTS) {
    const s = sports[sport];
    // Only legs for events on the product date, in ET — the product date is an ET date and a Monday-night
    // kickoff at 00:15Z belongs to the Monday slate. ("latest" files for NFL/EPL/UFC span days.)
    const evaluated = s.candidates.map((c) => evaluateLeg(c, { asOf: now })).filter((l) => !l.eventStartUtc || etDate(l.eventStartUtc) === date || sport === "mlb");
    legs.push(...evaluated);
    perSport[sport] = { legs: evaluated, rawForecastCount: s.rawForecastCount, publicForecastCount: s.publicForecastCount, ownerNote: s.ownerNote };
  }
  const manifest = buildManifest({ date, asOf: now, sports: perSport });
  manifest.marketPricedLegPolicy = MARKET_PRICED_LEG_POLICY;
  const artifact = { schemaVersion: PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION, artifact: "product-eligible-legs", dataClass: "internal", date, asOf: now, generatedAt: new Date().toISOString(), marketPricedLegPolicy: MARKET_PRICED_LEG_POLICY, counts: { total: legs.length, eligible: legs.filter((l) => l.productEligible).length }, legs };
  const availability = {
    schemaVersion: 1, artifact: "product-availability", dataClass: "PUBLIC_DERIVED", date, asOf: now,
    note: "Today's eligible universe for Bank Builder / Moonshot, per sport. Counts and plain reasons only.",
    sports: Object.fromEntries(CONTRACT_SPORTS.map((sport) => {
      const m = manifest.sports[sport];
      const eligible = perSport[sport].legs.filter((l) => l.productEligible);
      const marketPricedOnly = eligible.length > 0 && eligible.every((l) => l.eligibilityReasonCodes.includes("MARKET_PRICED_NO_FORECAST"));
      return [sport, { eligibleLegs: m.eligibleLegCount, events: m.eventCount, marketFamilies: m.marketFamilyCount, reason: publicReasonFor(m), marketPricedOnly }];
    })),
  };
  return { artifact, manifest, availability };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { artifact, manifest, availability } = buildEligibleLegs({});
  const line = CONTRACT_SPORTS.map((s) => `${s}: ${manifest.sports[s].eligibleLegCount}/${manifest.sports[s].eligibleLegCount + manifest.sports[s].rejectedLegCount} (${publicReasonFor(manifest.sports[s])})`).join(" · ");
  console.log(`eligible legs ${DATE} @ ${NOW}: ${line}`);
  for (const s of CONTRACT_SPORTS) { const r = manifest.sports[s].rejectedByReason; if (Object.keys(r).length) console.log(`  ${s} rejected by reason: ${JSON.stringify(r)}`); }
  if (WRITE) {
    const dir = path.join(REPO, "data", "internal", "products", "eligible-legs"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${DATE}.json`), JSON.stringify(artifact, null, 1));
    fs.writeFileSync(path.join(dir, `${DATE}.manifest.json`), JSON.stringify(manifest, null, 1));
    const pub = path.join(ROOT, "products", "availability"); fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, `${DATE}.json`), JSON.stringify(availability, null, 2));
    fs.writeFileSync(path.join(pub, "latest.json"), JSON.stringify(availability, null, 2));
    console.log(`wrote ${dir}/${DATE}.json (+manifest) and public/data/products/availability/${DATE}.json`);
  } else console.log("(dry run — pass --write to persist)");
}
