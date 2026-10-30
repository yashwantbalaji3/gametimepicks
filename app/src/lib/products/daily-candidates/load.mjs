/**
 * DAILY CANDIDATE INPUTS · BUILD TIME / SERVER ONLY (fs). Reads the canonical official forecasts and the authorized
 * price artifacts through their existing readers and shapes them as DailyLegInput rows for engine.mjs. It never
 * computes a probability, never picks a side the forecast does not name, and never invents a price.
 *
 * DailyLegInput: { legType, sport, eventId, eventStartUtc, eventLabel, team, opponent, participantId, participantName,
 *   family, marketFamily ("player_prop" | "team_result"), marketKey, side, line, selection, availabilityState,
 *   forecast: { owner, id, forecastClass, modelStatus, probability, probabilityBasis, probabilityReason, projection,
 *               estimate, sourceRefs, publishedAt },
 *   price: { american, bookmaker, capturedAt, receipt } | null }
 *
 * Sources
 *   NBA forecast   app/public/data/nba/experimental-public/<day>.json (the public lane: medians + the Elo side)
 *   NBA prices     lib/sports/nba/public-line-records.mjs nbaPublicLineRecords (null without the display key)
 *   NFL forecast   app/public/data/nfl/forecasts/latest.json + nfl/product-eligibility.json
 *   NFL prices     lib/sports/nfl/public-line-records.mjs nflPublicLineRecords per event (null without the key)
 */
import fs from "node:fs";
import path from "node:path";
import { nbaPublicLineRecords } from "../../sports/nba/public-line-records.mjs";
import { nflPublicLineRecords } from "../../sports/nfl/public-line-records.mjs";
import { FAMILY_BY_MARKET } from "../../sports/nba/line-comparison.mjs";
import { NFL_FAMILY_BY_MARKET } from "../../sports/nfl/prop-line-adapter.mjs";
import { PROBABILITY_BASIS } from "../recommendation-receipt.mjs";
import { FORECAST_CLASS } from "../eligible-leg/contract.mjs";
import { LEG_TYPE, NFL_ESTIMATE_FAMILIES } from "./policy.mjs";
import { buildDailyCandidate } from "./engine.mjs";
import { productDayOf } from "../level-a/suggestions.mjs";
import { buildAsOfIso } from "../../build-asof.ts";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const iso = (s) => { const t = Date.parse(s ?? ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** Lane injury text → the receipt's availability vocabulary. No status listed is ACTIVE_EXPECTED, never CONFIRMED. */
export function availabilityOf(injuryStatus) {
  if (injuryStatus == null || injuryStatus === "") return "ACTIVE_EXPECTED";
  const s = String(injuryStatus).toLowerCase();
  if (s.includes("out")) return "OUT";
  if (s.includes("question") || s.includes("doubt") || s.includes("day-to-day") || s.includes("probable")) return "QUESTIONABLE";
  return "UNKNOWN";
}

/** NBA inputs for one product day. */
export function nbaInputs({ appRoot, productDay, env }) {
  const rel = `app/public/data/nba/experimental-public/${productDay}.json`;
  const lane = readJson(path.join(appRoot, "public", "data", "nba", "experimental-public", `${productDay}.json`));
  const notes = {
    [LEG_TYPE.NBA_PLAYER_PROP]: { forecast: null, price: null },
    [LEG_TYPE.NBA_GAME_WINNER]: { forecast: null, price: "The authorized NBA line capture carries player props only; it has no game-winner (moneyline) prices." },
  };
  if (!lane) {
    const msg = `Today's NBA forecast (${productDay}) has not been published in this build yet.`;
    notes[LEG_TYPE.NBA_PLAYER_PROP].forecast = msg;
    notes[LEG_TYPE.NBA_GAME_WINNER].forecast = msg;
  }
  let records = null;
  try { records = nbaPublicLineRecords(productDay, { appRoot, env }); } catch (e) { notes[LEG_TYPE.NBA_PLAYER_PROP].price = `The NBA line artifact for ${productDay} failed validation, so no NBA price is used.`; }
  if (records == null && !notes[LEG_TYPE.NBA_PLAYER_PROP].price) {
    notes[LEG_TYPE.NBA_PLAYER_PROP].price = `No authorized NBA line artifact for ${productDay} is readable by this build (it needs the encrypted capture and the display key at build time).`;
  }
  const legs = [];
  for (const g of lane?.games ?? []) {
    const eventId = String(g.providerEventId);
    const start = iso(g.tipUtc);
    const label = `${g.away?.abbr} @ ${g.home?.abbr}`;
    const forecastBase = {
      owner: "nba-official-composition@1", id: g.receipt?.payloadSha256 ?? null, forecastClass: FORECAST_CLASS.EXPERIMENTAL_MODEL,
      modelStatus: "PUBLIC_EXPERIMENTAL", estimate: false, sourceRefs: [rel], publishedAt: g.frozenAt ?? null,
    };
    const fav = g.elo?.favoured ?? null;
    if (fav && (fav === g.home?.abbr || fav === g.away?.abbr)) {
      const home = fav === g.home?.abbr;
      legs.push({
        legType: LEG_TYPE.NBA_GAME_WINNER, sport: "nba", eventId, eventStartUtc: start, eventLabel: label,
        team: fav, opponent: home ? g.away?.abbr : g.home?.abbr, participantId: null, participantName: null,
        family: "winner", marketFamily: "team_result", marketKey: "h2h", side: fav, line: null, selection: `${fav} to win`,
        availabilityState: "UNKNOWN",
        forecast: { ...forecastBase, probability: g.elo?.winProbability?.[home ? "home" : "away"] ?? null, probabilityBasis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, probabilityReason: "Elo-derived estimate; accuracy not established", projection: null },
        price: null,
      });
    }
    if (!records) continue;
    const players = new Map();
    for (const side of ["home", "away"]) for (const p of g.players?.[side] ?? []) players.set(String(p.providerAthleteId), { ...p, team: g[side]?.abbr, opponent: g[side === "home" ? "away" : "home"]?.abbr });
    for (const r of records.filter((x) => String(x.eventId) === eventId)) {
      const p = players.get(String(r.providerAthleteId));
      const family = r.family ?? FAMILY_BY_MARKET[r.providerMarketKey];
      const median = p ? (p.medians?.[family] ?? p.comboMedians?.[family] ?? null) : null;
      if (!p || median == null || typeof r.line !== "number" || median === r.line) continue;
      // The side the official median points to. It is displayed for explanation only: the engine refuses it for
      // having no calibrated probability, so a median above a line can never select a leg by itself.
      const over = median > r.line;
      const american = over ? r.overAmerican : r.underAmerican;
      legs.push({
        legType: LEG_TYPE.NBA_PLAYER_PROP, sport: "nba", eventId, eventStartUtc: start, eventLabel: label,
        team: p.team, opponent: p.opponent, participantId: String(r.providerAthleteId), participantName: p.name ?? null,
        family, marketFamily: "player_prop", marketKey: r.providerMarketKey, side: over ? "Over" : "Under", line: r.line,
        selection: `${p.name} ${over ? "Over" : "Under"} ${r.line}`, availabilityState: availabilityOf(p.injuryStatus),
        forecast: { ...forecastBase, probability: null, probabilityBasis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, probabilityReason: "the forecast publishes a median, not an over/under probability", projection: median },
        price: typeof american === "number" ? { american, bookmaker: r.book, capturedAt: r.capturedAt, receipt: `nba/lines/${productDay}` } : null,
      });
    }
  }
  return { legs, notes };
}

/** NFL inputs: games that have not started at `asOf` from the forecasts of record. */
export function nflInputs({ appRoot, asOf, env }) {
  const data = path.join(appRoot, "public", "data", "nfl");
  const doc = readJson(path.join(data, "forecasts", "latest.json"));
  const elig = readJson(path.join(data, "product-eligibility.json"));
  const stateOf = new Map((elig?.events ?? []).map((e) => [String(e.canonicalEventId), e.state]));
  const asOfMs = Date.parse(asOf);
  const games = (doc?.forecasts ?? []).filter((f) => Date.parse(f.kickoffUtc) > asOfMs);
  const notes = {
    [LEG_TYPE.NFL_GAME_WINNER]: { forecast: games.length ? null : "No NFL forecast of record for an upcoming game in this build.", price: "No verified NFL game-winner (moneyline) price artifact exists; the authorized NFL capture is player props only." },
    [LEG_TYPE.NFL_PLAYER_PROP]: { forecast: null, price: null, forecastPublished: games.length > 0, pricesReadable: false },
  };
  const legs = [];
  let offers = 0, estimateOffers = 0;
  for (const f of games) {
    const side = f.sideDecision?.publishedSide;
    const team = side === "HOME" ? f.home?.abbr : side === "AWAY" ? f.away?.abbr : null;
    if (team) {
      legs.push({
        legType: LEG_TYPE.NFL_GAME_WINNER, sport: "nfl", eventId: String(f.providerEventId), eventStartUtc: iso(f.kickoffUtc), eventLabel: f.matchup,
        team, opponent: side === "HOME" ? f.away?.abbr : f.home?.abbr, participantId: null, participantName: null,
        family: "winner", marketFamily: "team_result", marketKey: "h2h", side: team, line: null, selection: `${team} to win`, availabilityState: "UNKNOWN",
        forecast: {
          owner: "nfl/forecasts-of-record", id: f.model?.inputHash ?? null, forecastClass: FORECAST_CLASS.EXPERIMENTAL_MODEL,
          modelStatus: stateOf.get(String(f.canonicalEventId)) ?? f.state ?? null, estimate: false,
          probability: f.forecastSummary?.winProbability?.[side === "HOME" ? "home" : "away"] ?? null,
          probabilityBasis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, probabilityReason: "experimental forecast; only a validated pick may become a product leg",
          projection: null, sourceRefs: ["app/public/data/nfl/forecasts/latest.json", "app/public/data/nfl/product-eligibility.json"], publishedAt: f.generatedAt ?? null,
        },
        price: null,
      });
    }
    let rows = null;
    try { rows = nflPublicLineRecords(String(f.providerEventId), { appRoot, env }); } catch { rows = null; }
    for (const r of rows ?? []) {
      offers++;
      if (NFL_ESTIMATE_FAMILIES.includes(NFL_FAMILY_BY_MARKET[r.market])) estimateOffers++;
    }
  }
  notes[LEG_TYPE.NFL_PLAYER_PROP].pricesReadable = offers > 0;
  notes[LEG_TYPE.NFL_PLAYER_PROP].price = offers > 0
    ? `${offers} NFL prop offers are readable (${estimateOffers} are passing or rushing ESTIMATE markets, research only); none is paired with a calibrated probability.`
    : "No authorized NFL prop line artifact is readable by this build (it needs the encrypted capture and the display key at build time).";
  return { legs, notes };
}

/** Everything the engine needs for one product day. */
export function loadDailyCandidateInputs({ appRoot = process.cwd(), productDay, asOf, env = process.env }) {
  const nba = nbaInputs({ appRoot, productDay, env });
  const nfl = nflInputs({ appRoot, asOf, env });
  return { inputs: [...nba.legs, ...nfl.legs], sourceNotes: { ...nba.notes, ...nfl.notes } };
}

/** The page's one evaluation: the build's stamped instant, that instant's ET product day, the real sources. */
export function dailyCandidateForPage(product, { appRoot = process.cwd(), asOf = buildAsOfIso(), env = process.env } = {}) {
  const productDay = productDayOf(asOf);
  const { inputs, sourceNotes } = loadDailyCandidateInputs({ appRoot, productDay, asOf, env });
  return buildDailyCandidate({ product, productDay, asOf, inputs, sourceNotes });
}
