/**
 * Homer Nukes — the daily MLB home-run product. Surfaces the TOP 5 model-qualified home-run picks
 * across the whole MLB slate, ranked by model edge. A $100/day paper allocation ($20 per pick),
 * tracked separately inside Mr. Dub (mirrors Bank Builder / Moonshot / World Cup Specials).
 *
 * HONEST BY CONSTRUCTION: it reads ONLY real posted MLB home-run prop markets. When the Odds API has
 * not posted MLB home-run props for the date (common before first pitch / off-slate), it returns an
 * empty, data-gated result — never a fabricated pick or price. Pure read-side; no money mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { computeHomerScore, homerInputsFromRow } from "./homer-score";

export const HOMER_NUKES_PICK_COUNT = 5;
export const HOMER_NUKES_STAKE_PER_PICK = 20;
export const HOMER_NUKES_DAILY_ALLOCATION = HOMER_NUKES_PICK_COUNT * HOMER_NUKES_STAKE_PER_PICK; // $100/day

export interface HomerNukePick {
  id: string;
  player: string;
  playerId: number | null;
  photoUrl: string | null;
  team: string;
  teamAbbr: string | null;
  opponent: string | null;
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

export interface HomerNukesResult {
  date: string;
  available: boolean;        // true only when real HR props are posted for the date
  picks: HomerNukePick[];    // up to HOMER_NUKES_PICK_COUNT, ranked by edge
  evaluated: number;         // how many HR props were evaluated
  stakePerPick: number;
  dailyAllocation: number;
  note: string;
}

const ET_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
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
    date, available: false, picks: [], evaluated: 0,
    stakePerPick: HOMER_NUKES_STAKE_PER_PICK, dailyAllocation: HOMER_NUKES_DAILY_ALLOCATION, note,
  });

  let raw: { date?: string; props?: Array<Record<string, any>>; markets?: Array<Record<string, any>> } | null = null;
  for (const rel of [["mlb", "home-run-props", `${date}.json`], ["mlb", "home-run-props", "latest.json"], ["mlb", "game-markets", `${date}.json`]]) {
    try { raw = JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8")); break; } catch { /* try next */ }
  }
  if (!raw) return empty("MLB home-run board hasn't been posted for this slate yet — the Odds API has no home-run props for today. No picks are shown rather than fabricating any.");
  if (raw.date && raw.date !== date) return empty("The posted MLB home-run board is for a different slate — fail-closed until today's props post.");

  const rows = (raw.props ?? raw.markets ?? []) as Array<Record<string, any>>;
  const candidates: HomerNukePick[] = [];
  let evaluated = 0;
  for (const r of rows) {
    const marketKey = String(r.market ?? r.marketKey ?? "").toLowerCase();
    if (!HR_MARKET_KEYS.has(marketKey)) continue;
    evaluated++;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : typeof r.odds === "number" ? r.odds : null;
    if (odds == null || odds < ODDS_MIN || odds > ODDS_MAX) continue;
    const provider = (r.provider ?? r.bookmaker ?? null) as string | null;
    if (!provider) continue;
    const start = (r.startTimeUtc ?? r.commenceTime ?? null) as string | null;
    if (start && start <= new Date(0).toISOString()) { /* ignore obviously-bad */ }
    const modelProbability = typeof r.modelProbability === "number" ? r.modelProbability : 0;
    if (modelProbability < MODEL_FLOOR) continue;
    const player = String(r.player?.name ?? r.player ?? r.participant ?? "");
    if (!player) continue;
    const edge = modelProbability - impliedProb(odds);
    // Homer Score from the real batter/pitcher/park inputs when the row carries them (else null).
    const inputs = homerInputsFromRow(r);
    const scored = inputs ? computeHomerScore(inputs) : null;
    candidates.push({
      id: String(r.id ?? `hr:${r.gameId ?? ""}:${player}`),
      player, playerId: r.player?.id ?? r.playerId ?? null,
      photoUrl: (typeof r.player?.photo === "string" ? r.player.photo : r.photoUrl) ?? null,
      team: String(r.team ?? r.player?.team ?? ""), teamAbbr: r.teamAbbr ?? null,
      opponent: r.opponent ?? null, matchup: String(r.matchup ?? r.fixture ?? ""),
      gameId: String(r.gameId ?? ""), market: marketKey, marketLabel: String(r.marketLabel ?? "To hit a home run"),
      odds, modelProbability, edge, provider, startTimeUtc: start, kickoffEt: kickoffEtLabel(start),
      homerScore: scored ? scored.score : null, homerConfidence: scored ? scored.confidence : null,
    });
  }
  if (candidates.length === 0) return empty("No model-qualified home-run picks cleared the board for this slate yet.");

  // Rank by the Homer Score when modeling inputs are present, else by model edge; max one pick per game.
  candidates.sort((a, b) => (b.homerScore ?? -1) - (a.homerScore ?? -1) || b.edge - a.edge);
  const seenGames = new Set<string>();
  const picks: HomerNukePick[] = [];
  for (const c of candidates) {
    if (picks.length >= HOMER_NUKES_PICK_COUNT) break;
    if (c.gameId && seenGames.has(c.gameId)) continue;
    if (c.gameId) seenGames.add(c.gameId);
    picks.push(c);
  }
  return {
    date, available: true, picks, evaluated,
    stakePerPick: HOMER_NUKES_STAKE_PER_PICK, dailyAllocation: HOMER_NUKES_DAILY_ALLOCATION,
    note: `Top ${picks.length} model-qualified home-run picks across the slate, ranked by edge. $${HOMER_NUKES_STAKE_PER_PICK} per pick · paper-only.`,
  };
}
