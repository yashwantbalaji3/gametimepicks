/**
 * LEG POOL (`leg-pool@1`). The day's eligible legs, from CANONICAL OFFICIAL FORECASTS ONLY, for every sport with a game
 * that day. Node-only, read-only. Bank Builder, Moonshot and the suggested parlay tiers (daily-cards.mjs) consume it.
 *
 * SOURCES. Exactly the Level A readers (level-a/sources.mjs): the NBA official lane
 * (app/public/data/nba/experimental-public/<date>.json), the MLB official snapshot, the EPL and Ligue 1 public
 * forecasts. Never a Simulation Theater run, never an internal research path, never a sportsbook field. NFL and UFC are
 * CLOSED on the registry's Level A axis, so they appear with that reason and contribute nothing.
 *
 * GATES, in order. A leg is refused with every reason that applies, never silently dropped:
 *   1. Level A leg gates (levelALeg): sport open, product day, start known / not started / outside 30 min, forecast
 *      frozen before start, a selection, a valid probability where the owner publishes one, source readiness.
 *   2. FRESHNESS (NBA): the lane names this date, was generated at or before the evaluation instant and no more than
 *      24 h before it (one slate day), and each game carries its receipt hash.
 *   3. DUPLICATES: one leg per sport + event + market.
 *   4. AVAILABILITY (NBA game winner): the favoured team's five most-minuted projected players are checked against R1
 *      (frozen injury status). A hit marks the leg `review` — kept for Moonshot and the tiers, flagged, and kept OUT of
 *      Bank Builder (the conservative product). Players the lane already ruled Out are listed as context. The Elo side
 *      itself ignores availability; this flag says so rather than changing the side.
 *   5. TIERABILITY: a leg is usable in a card only with a published probability (NBA: the Elo display accessor, with
 *      its provenance cross-check, via nba-game-winner-tiers@1).
 * PLAYER PROJECTIONS (NBA) run the R1–R3 + readiness guard (nba-guard.mjs) and are listed with their verdict. They are
 * never card legs: the lane publishes medians only, with no probability and no line, so they cannot be tiered and no
 * threshold may be invented for them.
 *
 * PRICING. No sportsbook price enters the pool. Every leg is MODEL_ONLY. `qualified` (a priced, bettable state) needs
 * fresh, permitted odds and does not exist today.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { levelASources } from "../level-a/sources.mjs";
import { levelASuggestions, productDayOf } from "../level-a/suggestions.mjs";
import { nbaGameWinnerDisplay } from "../level-a/nba-game-winner-source.mjs";
import { MODEL_SUGGESTION_CAPABILITIES } from "../../sport-capability-registry.ts";
import { loadSeasonBoxscores, seasonHistory, playerGuard, GUARD_TEXT } from "./nba-guard.mjs";

export const LEG_POOL_VERSION = "leg-pool@1";
export const LEG_STATUS = Object.freeze({ MODEL_ONLY: "MODEL_ONLY", PRICED: "PRICED" });
export const MAX_LANE_AGE_MS = 24 * 60 * 60 * 1000;
export const ROTATION_SIZE = 5;
const R1_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve|questionable)/i;

export const POOL_REFUSAL = Object.freeze({
  LANE_MISSING: "No official NBA lane file for this date.",
  LANE_OTHER_DATE: "The NBA lane file names a different date.",
  LANE_FROM_FUTURE: "The NBA lane was generated after the evaluation instant.",
  LANE_STALE: "The NBA lane is more than 24 hours old at the evaluation instant.",
  NO_RECEIPT: "The game has no frozen forecast receipt hash.",
  DUPLICATE: "A leg for this event and market is already in the pool.",
});
export const FLAG_TEXT = Object.freeze({
  FAVOURED_ROTATION_R1: "A top-five-minutes player on the favoured team was listed Day-To-Day, Questionable, Doubtful or Out at freeze; the Elo side does not account for it.",
});

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const readRaw = (f) => { try { return fs.readFileSync(f); } catch { return null; } };

/** NBA lane freshness for (date, evaluatedAt): a list of POOL_REFUSAL codes (empty = fresh). */
export function laneFreshness(lane, { date, evaluatedAt }) {
  if (!lane) return ["LANE_MISSING"];
  const out = [];
  if (lane.date !== date) out.push("LANE_OTHER_DATE");
  const gen = Date.parse(lane.generatedAt ?? ""); const at = Date.parse(evaluatedAt);
  if (!Number.isFinite(gen) || gen > at) out.push("LANE_FROM_FUTURE");
  else if (at - gen > MAX_LANE_AGE_MS) out.push("LANE_STALE");
  return out;
}

/** Availability context for one lane game's favoured side. */
export function favouredAvailability(game, side) {
  if (!side) return { flags: [], rotationFlagged: [], outAtFreeze: [] };
  const rotation = [...(game.players?.[side] ?? [])].sort((a, b) => (b.expectedMinutes ?? 0) - (a.expectedMinutes ?? 0) || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId))).slice(0, ROTATION_SIZE);
  const rotationFlagged = rotation.filter((p) => p.injuryStatus && R1_STATUS.test(p.injuryStatus)).map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, status: p.injuryStatus }));
  const outAtFreeze = (game.players?.unavailable?.[side] ?? []).filter((p) => p.reason === "RULED_OUT").map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, status: p.status ?? "Out" }));
  return { flags: rotationFlagged.length ? ["FAVOURED_ROTATION_R1"] : [], rotationFlagged, outAtFreeze };
}

/**
 * Build the pool.
 * @param {{ repoRoot: string, date: string, evaluatedAt: string, sources?: object, lane?: object|null, boxscores?: object[], display?: object }} input
 *   `sources`, `lane`, `boxscores`, `display` replace the files read (tests pin committed inputs with them).
 */
export function buildLegPool({ repoRoot, date, evaluatedAt, sources = null, lane = undefined, boxscores = null, display = null }) {
  if (!Number.isFinite(Date.parse(evaluatedAt ?? ""))) throw new TypeError("buildLegPool: evaluatedAt must be an ISO instant");
  const laneRel = `app/public/data/nba/experimental-public/${date}.json`;
  const laneRaw = lane === undefined ? readRaw(path.join(repoRoot, laneRel)) : null;
  const laneDoc = lane !== undefined ? lane : laneRaw ? JSON.parse(laneRaw.toString("utf8")) : null;
  const src = sources ?? levelASources({ repoRoot, date });
  const answer = levelASuggestions({ selections: src.selections, now: evaluatedAt, productDay: date });
  const inputs = [];
  if (laneRaw) inputs.push({ sport: "nba", file: laneRel, sha256: sha256(laneRaw), generatedAt: laneDoc?.generatedAt ?? null });

  // ── NBA ──
  const fresh = laneFreshness(laneDoc, { date, evaluatedAt });
  const nbaGames = laneDoc?.date === date ? laneDoc.games ?? [] : [];
  const gameById = new Map(nbaGames.map((g) => [String(g.providerEventId), g]));
  const d = display ?? nbaGameWinnerDisplay({ repoRoot, date, lane: laneDoc });
  const nbaLegs = []; const refused = [];
  const seen = new Set();
  const nbaLevelA = answer.untiered.filter((l) => l.sport === "nba");
  for (const l of nbaLevelA) {
    const g = gameById.get(String(l.eventId));
    const key = `nba:${l.eventId}:${l.market}`;
    const reasons = [...fresh];
    if (!g?.receipt?.payloadSha256) reasons.push("NO_RECEIPT");
    if (seen.has(key)) reasons.push("DUPLICATE");
    if (reasons.length) { refused.push({ sport: "nba", eventId: l.eventId, eventLabel: l.eventLabel, market: l.market, reasons, text: reasons.map((r) => POOL_REFUSAL[r]) }); continue; }
    seen.add(key);
    const avail = favouredAvailability(g, l.selection.code);
    const shown = d.accessor?.(l.eventId) ?? null;
    nbaLegs.push({
      leg: l, // the Level A leg, unchanged, for the shared selection engine
      legId: key, sport: "nba", eventId: String(l.eventId), eventLabel: l.eventLabel, startUtc: l.startUtc, market: l.market,
      selection: { ...l.selection, teamAbbr: g[l.selection.code]?.abbr ?? null }, status: LEG_STATUS.MODEL_ONLY,
      probability: shown ? (l.selection.code === "home" ? shown.pHome : 1 - shown.pHome) : null,
      probabilityShown: shown?.shown?.[l.selection.code] ?? null,
      forecast: { ...l.forecast, receiptSha256: g.receipt.payloadSha256 },
      guard: { state: avail.flags.length ? "review" : "pass", flags: avail.flags, flagText: avail.flags.map((f) => FLAG_TEXT[f]), rotationFlagged: avail.rotationFlagged, outAtFreeze: avail.outAtFreeze },
    });
  }
  for (const r of answer.refused.filter((x) => x.sport === "nba")) refused.push({ ...r, market: r.market ?? "winner" });

  // NBA player projections + guard
  const box = boxscores ?? (nbaGames.length ? loadSeasonBoxscores({ repoRoot, date, asOf: evaluatedAt }) : []);
  const hist = seasonHistory(box);
  const playerProjections = [];
  for (const g of nbaGames) for (const side of ["away", "home"]) for (const p of g.players?.[side] ?? []) {
    const team = g[side]?.abbr;
    const v = playerGuard(p, hist[team]);
    playerProjections.push({
      eventId: String(g.providerEventId), eventLabel: `${g.away?.abbr} @ ${g.home?.abbr}`, startUtc: g.tipUtc,
      playerId: String(p.providerAthleteId), name: p.name, team, expectedMinutes: p.expectedMinutes ?? null,
      injuryStatus: p.injuryStatus ?? null, medians: p.medians ?? null, comboMedians: p.comboMedians ?? null,
      guard: { state: fresh.length ? "blocked" : v.state, rules: fresh.length ? [...fresh, ...v.rules] : v.rules, review: v.review, cells: v.cells, ruleText: v.rules.map((r) => GUARD_TEXT[r] ?? r), history: v.history },
      usableInCards: false,
      why: "Medians only: the official lane publishes no probability or range for player stats, so no threshold can be tiered.",
    });
  }

  // ── Cross-sport legs (MLB / EPL / Ligue 1): the Level A tierable legs, verbatim ──
  const crossLegs = [];
  for (const l of answer.legs.filter((x) => x.sport !== "nba")) {
    const key = `${l.sport}:${l.eventId}:${l.market}`;
    if (seen.has(key)) { refused.push({ sport: l.sport, eventId: l.eventId, eventLabel: l.eventLabel, market: l.market, reasons: ["DUPLICATE"], text: [POOL_REFUSAL.DUPLICATE] }); continue; }
    seen.add(key);
    crossLegs.push({ leg: l, legId: key, sport: l.sport, eventId: String(l.eventId), eventLabel: l.eventLabel, startUtc: l.startUtc, market: l.market, selection: l.selection, status: LEG_STATUS.MODEL_ONLY, probability: l.tierable ? l.probability : null, probabilityShown: l.tierable ? `${(l.probability * 100).toFixed(1)}%` : null, forecast: { ...l.forecast }, guard: { state: "pass", flags: [] } });
  }
  for (const r of answer.refused.filter((x) => x.sport !== "nba" && !x.reasons.every((c) => c === "OTHER_PRODUCT_DAY"))) refused.push(r);

  // ── Per-sport status ──
  const sports = {};
  for (const cap of MODEL_SUGGESTION_CAPABILITIES) {
    const legs = [...nbaLegs, ...crossLegs].filter((l) => l.sport === cap.key);
    const ref = refused.filter((r) => r.sport === cap.key);
    const byReason = {};
    for (const r of ref) for (const c of r.reasons) byReason[c] = (byReason[c] ?? 0) + 1;
    const state = cap.state === "CLOSED" ? "closed"
      : cap.key === "nba" && fresh.includes("LANE_MISSING") ? "no-games"
      : cap.key === "nba" && fresh.length ? "blocked"
      : legs.length ? "active" : ref.length ? "no-eligible-legs" : "no-games";
    sports[cap.key] = {
      state, reason: cap.state === "CLOSED" ? cap.reason : cap.key === "nba" && fresh.length ? fresh.map((f) => POOL_REFUSAL[f]).join(" ") : null,
      events: new Set([...legs, ...ref].map((l) => String(l.eventId))).size,
      legPool: { eligible: legs.length, tierable: legs.filter((l) => typeof l.probability === "number").length, review: legs.filter((l) => l.guard.state === "review").length, refused: ref.length, byReason },
    };
  }
  if (sports.nba) {
    const pp = playerProjections;
    sports.nba.playerProjections = { total: pp.length, pass: pp.filter((p) => p.guard.state === "pass").length, review: pp.filter((p) => p.guard.state === "review").length, blocked: pp.filter((p) => p.guard.state === "blocked").length };
  }
  return { version: LEG_POOL_VERSION, productDay: date, evaluatedAt, inputs, display: { enabled: d.enabled === true, disclosure: d.disclosure ?? null }, accessor: d.accessor, receiptOf: d.receiptOf, nbaLegs, crossLegs, playerProjections, refused, sports };
}

export { productDayOf };
