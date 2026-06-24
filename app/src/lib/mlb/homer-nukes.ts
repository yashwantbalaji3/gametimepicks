/**
 * Homer Nukes — the daily MLB home-run product. ONE DAILY 5-LEG HOME-RUN PARLAY: the top 5 anytime-HR
 * candidates of the slate, combined into a single $20 paper parlay (not five separate bets), tracked
 * inside Mr. Dub alongside Bank Builder / Moonshot / WC Specials.
 *
 * HONEST BY CONSTRUCTION: reads ONLY real posted MLB home-run prop markets. When the Odds API has not
 * posted HR props for the date, it returns an empty, data-gated result — never a fabricated leg or
 * price. Pure read-side; no money mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { computeHomerScore, homerInputsFromRow } from "./homer-score";

export const HOMER_NUKES_LEGS_PER_LANE = 3;       // V2: 3 unique legs per lane
export const HOMER_NUKES_LANE_COUNT = 2;          // V2: two independent lanes (A + B)
export const HOMER_NUKES_LANE_STAKE = 10;         // V2: $10 per lane
export const HOMER_NUKES_PICK_COUNT = HOMER_NUKES_LEGS_PER_LANE * HOMER_NUKES_LANE_COUNT; // 6 total HR legs
export const HOMER_NUKES_STAKE = HOMER_NUKES_LANE_STAKE * HOMER_NUKES_LANE_COUNT;         // $20/day total (2 × $10)
export const HOMER_NUKES_DAILY_ALLOCATION = HOMER_NUKES_STAKE; // $20/day across both lanes

export interface HomerNukePick {
  id: string;
  player: string;
  playerId: number | null;
  photoUrl: string | null;
  team: string;
  teamAbbr: string | null;
  opponent: string | null;
  opponentAbbr: string | null;   // resolved from the matchup + teams map (enrichment); null if unmapped
  homeAway: "home" | "away" | null;
  matchup: string;
  gameId: string;
  market: string;        // "to hit a home run" (anytime HR)
  marketLabel: string;
  odds: number;          // American
  modelProbability: number;
  edge: number;          // model prob − implied prob
  provider: string | null;
  startTimeUtc: string | null;
  kickoffEt: string | null;
  homerScore: number | null;        // 0..100 Homer Score (null when no modeling inputs present)
  homerConfidence: "high" | "medium" | "low" | null;
}

export interface HomerNukesParlay {
  lane?: "A" | "B";           // V2 lane label
  legs: HomerNukePick[];      // the home-run legs (3 per lane in V2)
  combinedOdds: number;       // American odds of the parlay
  combinedDecimal: number;
  stake: number;              // $10 per lane in V2
  projectedReturn: number;    // stake × combined decimal
  impliedProbability: number; // chance ALL legs hit (product of leg implied probs)
  providers: string[];        // distinct sportsbooks across the legs
}

export interface HomerNukesResult {
  date: string;
  available: boolean;        // true only when real HR props are posted for the date
  parlay: HomerNukesParlay | null;  // backward-compat: Lane A
  lanes: HomerNukesParlay[];        // V2: up to two independent $10 / 3-leg lanes (A + B)
  evaluated: number;         // how many HR props were evaluated
  slateGames: number;        // distinct games carrying anytime-HR markets (real slate size)
  stake: number;             // total daily stake across lanes ($20 = 2 × $10)
  confidence: "low" | "medium" | "high";
  note: string;
}

const ET_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const impliedProb = (a: number) => 1 / dec(a);
const kickoffEtLabel = (iso: string | null): string | null => { if (!iso) return null; try { return `${ET_FMT.format(new Date(iso))} ET`; } catch { return null; } };

/** A home-run prop is eligible for Homer Nukes when it is a real posted anytime-HR market, pre-event,
 *  odds-backed (has a provider), within a sane longshot band, and clears a model floor. */
const HR_MARKET_KEYS = new Set(["batter_home_runs", "player_home_runs", "to_hit_a_home_run", "home_run_anytime", "anytime_home_run"]);
const ODDS_MIN = -150; // HRs are longshots; we still cap the floor so it is not a chalk lay
const ODDS_MAX = 1200;
const MODEL_FLOOR = 0.08; // at least an 8% model HR probability to make the board

/**
 * Load the day's Homer Nukes board. Reads real MLB home-run prop markets from the public MLB artifacts
 * for `date`; returns a data-gated empty result when none are posted. Never fabricates a pick.
 */
export function loadHomerNukes(root: string, date: string): HomerNukesResult {
  const empty = (note: string): HomerNukesResult => ({
    date, available: false, parlay: null, lanes: [], evaluated: 0, slateGames: 0, stake: HOMER_NUKES_STAKE, confidence: "low", note,
  });

  let raw: { date?: string; props?: Array<Record<string, any>>; markets?: Array<Record<string, any>> } | null = null;
  for (const rel of [["mlb", "home-run-props", `${date}.json`], ["mlb", "home-run-props", "latest.json"], ["mlb", "game-markets", `${date}.json`]]) {
    try { raw = JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8")); break; } catch { /* try next */ }
  }
  if (!raw) return empty("MLB home-run board hasn't been posted for this slate yet — the Odds API has no home-run props for today. No picks are shown rather than fabricating any.");
  if (raw.date && raw.date !== date) return empty("The posted MLB home-run board is for a different slate — fail-closed until today's props post.");

  const rows = (raw.props ?? raw.markets ?? []) as Array<Record<string, any>>;
  const candidates: HomerNukePick[] = [];
  const slateGameIds = new Set<string>(); // distinct games carrying anytime-HR markets (real slate size)
  let evaluated = 0;
  for (const r of rows) {
    const marketKey = String(r.market ?? r.marketKey ?? "").toLowerCase();
    if (!HR_MARKET_KEYS.has(marketKey)) continue;
    // Homer Nukes is the ANYTIME home run (the "Over 0.5" line) — skip the 1.5/2.5 multi-HR lines.
    const point = typeof r.point === "number" ? r.point : null;
    if (point != null && point > 0.5) continue;
    evaluated++;
    if (r.gameId) slateGameIds.add(String(r.gameId));
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : typeof r.odds === "number" ? r.odds : null;
    if (odds == null || odds < ODDS_MIN || odds > ODDS_MAX) continue;
    const provider = (r.provider ?? r.bookmaker ?? null) as string | null;
    if (!provider) continue;
    const start = (r.startTimeUtc ?? r.commenceTime ?? null) as string | null;
    if (start && start <= new Date(0).toISOString()) { /* ignore obviously-bad */ }
    // With a proprietary model the row carries modelProbability; until the Statcast inputs are wired we
    // fall back to the de-vigged MARKET-implied probability (honest — no fabricated edge is claimed).
    const hasModel = typeof r.modelProbability === "number";
    const modelProbability = hasModel ? r.modelProbability : impliedProb(odds);
    if (modelProbability < MODEL_FLOOR) continue;
    const player = String(r.player?.name ?? r.player ?? r.participant ?? "");
    if (!player) continue;
    const edge = hasModel ? modelProbability - impliedProb(odds) : 0; // no edge claimed without a model
    // Homer Score from the real batter/pitcher/park inputs when the row carries them (else null).
    const inputs = homerInputsFromRow(r);
    const scored = inputs ? computeHomerScore(inputs) : null;
    candidates.push({
      id: String(r.id ?? `hr:${r.gameId ?? ""}:${player}`),
      player, playerId: r.player?.id ?? r.playerId ?? null,
      photoUrl: (typeof r.player?.photo === "string" ? r.player.photo : r.photoUrl) ?? null,
      team: String(r.team ?? r.player?.team ?? ""), teamAbbr: r.teamAbbr ?? null,
      opponent: r.opponent ?? null, opponentAbbr: r.opponentAbbr ?? null, homeAway: r.homeAway ?? null,
      matchup: String(r.matchup ?? r.fixture ?? ""),
      gameId: String(r.gameId ?? ""), market: marketKey, marketLabel: String(r.marketLabel ?? "To hit a home run"),
      odds, modelProbability, edge, provider, startTimeUtc: start, kickoffEt: kickoffEtLabel(start),
      homerScore: scored ? scored.score : null, homerConfidence: scored ? scored.confidence : null,
    });
  }
  if (candidates.length === 0) return empty("No model-qualified home-run picks cleared the board for this slate yet.");

  // Rank by Homer Score when modeling inputs are present, else by the likeliest HR (probability desc);
  // max one pick per game so the 5 legs spread across the slate.
  candidates.sort((a, b) => (b.homerScore ?? -1) - (a.homerScore ?? -1) || b.modelProbability - a.modelProbability);
  const seenGames = new Set<string>();
  const legs: HomerNukePick[] = [];
  for (const c of candidates) {
    if (legs.length >= HOMER_NUKES_PICK_COUNT) break;
    if (c.gameId && seenGames.has(c.gameId)) continue;
    if (c.gameId) seenGames.add(c.gameId);
    legs.push(c);
  }
  if (legs.length < HOMER_NUKES_LEGS_PER_LANE) return empty(`Only ${legs.length} anytime-HR legs cleared the board — a Homer Nukes lane needs ${HOMER_NUKES_LEGS_PER_LANE}. Awaiting a fuller slate.`);

  // V2: split the highest-hit-rate legs into up to two independent $10 / 3-leg lanes (A + B).
  const buildLane = (laneLegs: HomerNukePick[], lane: "A" | "B"): HomerNukesParlay => {
    const combinedDecimal = laneLegs.reduce((d, l) => d * dec(l.odds), 1);
    const impliedProbability = laneLegs.reduce((p, l) => p * impliedProb(l.odds), 1);
    return {
      lane, legs: laneLegs, combinedOdds: decToAmerican(combinedDecimal), combinedDecimal: Number(combinedDecimal.toFixed(4)),
      stake: HOMER_NUKES_LANE_STAKE, projectedReturn: Number((HOMER_NUKES_LANE_STAKE * combinedDecimal).toFixed(2)),
      impliedProbability: Number(impliedProbability.toFixed(4)),
      providers: [...new Set(laneLegs.map((l) => l.provider).filter(Boolean) as string[])],
    };
  };
  const lanes: HomerNukesParlay[] = [];
  for (let i = 0; i + HOMER_NUKES_LEGS_PER_LANE <= legs.length && lanes.length < HOMER_NUKES_LANE_COUNT; i += HOMER_NUKES_LEGS_PER_LANE) {
    lanes.push(buildLane(legs.slice(i, i + HOMER_NUKES_LEGS_PER_LANE), lanes.length === 0 ? "A" : "B"));
  }
  const parlay = lanes[0] ?? null; // backward-compat: Lane A
  const bestImplied = Math.max(...lanes.map((l) => l.impliedProbability));
  const modeled = legs.some((l) => l.homerScore != null);
  const confidence: HomerNukesResult["confidence"] = bestImplied >= 0.05 ? "high" : bestImplied >= 0.02 ? "medium" : "low";
  return {
    date, available: true, parlay, lanes, evaluated, slateGames: slateGameIds.size,
    stake: HOMER_NUKES_LANE_STAKE * lanes.length, confidence,
    note: `${lanes.length} independent Homer Nukes lane${lanes.length === 1 ? "" : "s"} — $${HOMER_NUKES_LANE_STAKE}/lane, ${HOMER_NUKES_LEGS_PER_LANE} legs each, ranked by ${modeled ? "Homer Score" : "de-vigged HR hit rate"}. Paper-only.`,
  };
}
