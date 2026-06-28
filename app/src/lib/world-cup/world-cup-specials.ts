/**
 * World Cup Specials — a homepage-only feature box of 5 Moonshot-style, World-Cup-ONLY paper parlays.
 * Separate from both the disciplined Dual Bank Builder AND the Moonshot Lane. Built from REAL posted
 * team markets (moneyline / double chance / total goals / BTTS / draw-no-bet) + REAL posted player-prop
 * markets (anytime goalscorer / shots / shots on target / assists), under a strict odds discipline:
 *
 *   • combined odds  : > +700  and < +3000
 *   • per-leg odds   : > -250  and < +200   (rejects extreme favourites like Brazil ML -1100 and
 *                                            Turkey-or-Draw -400, and extreme longshots > +200)
 *   • leg mix        : >= 2 team props, >= 2 player props, >= 2 distinct games per card
 *   • pre-event only : every leg's kickoff is in the future (started games are excluded)
 *
 * Honest by construction: no fabricated markets (only the posted ones are mapped — there is no
 * "score or assist" combined market and no "team first to score" market in the feed, so neither is
 * invented), no fabricated photos/flags, settlement from official sources only, and player props are
 * labelled limited-data / market-implied (lineups not yet posted). Higher-variance by design — never
 * described as lower-risk. Paper-only. Server-only loaders read public artifacts; the generator core
 * is pure + deterministic (no Date.now / Math.random — `nowIso` is injected).
 *
 * This module NEVER touches the Moonshot or Bank Builder active artifacts — it only EXCLUDES an exact
 * duplicate of those active cards from the Specials it suggests.
 */
import fs from "node:fs";
import path from "node:path";
import { combinedAmerican, combinedDecimal, combinedHitProbability } from "@/lib/parlays/odds-math";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import {
  buildKnockoutContexts,
  knockoutFitMultiplier,
  knockoutTierLabel,
  type KnockoutContext,
} from "@/lib/world-cup/knockout-intelligence";
import {
  confidenceLabel,
  volatilityLabel,
  correlationProfile as editorialCorrelationProfile,
  expectedGameScript,
  type Confidence,
  type Volatility,
  type EditorialLeg,
} from "@/lib/world-cup/wc-editorial";
import {
  classifyPlayerRoles,
  roleKeyForRow,
  ROLE_ELIGIBLE_TIERS,
} from "@/lib/world-cup/player-role-quality";

// ── Config ─────────────────────────────────────────────────────────────────────────────────────
export const WORLD_CUP_SPECIALS_CONFIG = {
  count: 5,
  stakePreview: 10,
  minCombinedOdds: 700,
  maxCombinedOdds: 3000,
  minLegOdds: -250,
  maxLegOdds: 200,
  minTeamPropsPerCard: 2,
  minPlayerPropsPerCard: 2,
  minGamesPerCard: 2,
  maxCardsShown: 5,
  scope: "world_cup",
} as const;

export interface WorldCupSpecialsConfig {
  count: number;
  stakePreview: number;
  minCombinedOdds: number;
  maxCombinedOdds: number;
  minLegOdds: number;
  maxLegOdds: number;
  minTeamPropsPerCard: number;
  minPlayerPropsPerCard: number;
  minGamesPerCard: number;
  maxCardsShown: number;
  scope: string;
}

/** A leg's per-leg odds qualifies when STRICTLY inside the band: rejects -250/-251/+200/+201. */
export function legOddsInRange(odds: number | null | undefined, cfg: WorldCupSpecialsConfig = WORLD_CUP_SPECIALS_CONFIG): boolean {
  return typeof odds === "number" && Number.isFinite(odds) && odds > cfg.minLegOdds && odds < cfg.maxLegOdds;
}
/** A card's combined odds qualifies when STRICTLY inside the band: +701..+2999. */
export function combinedOddsInRange(odds: number | null | undefined, cfg: WorldCupSpecialsConfig = WORLD_CUP_SPECIALS_CONFIG): boolean {
  return typeof odds === "number" && Number.isFinite(odds) && odds > cfg.minCombinedOdds && odds < cfg.maxCombinedOdds;
}

// ── Types ──────────────────────────────────────────────────────────────────────────────────────
export interface SpecialLeg {
  legId: string;
  kind: "team" | "player";
  sport: "WORLD_CUP";
  fixture: string;
  eventId: string;
  participant: string;          // team name (team leg) or player name (player leg)
  team: string | null;          // the team this leg belongs to (null for match-level totals/BTTS)
  opponent: string | null;
  countryCode: string | null;   // flag, when the leg references a single team
  flagHome?: string | null;     // fixture home/away flags (shown for match-level totals)
  flagAway?: string | null;
  teamLogo?: string | null;     // team/flag logo URL when present
  playerId: number | null;
  photoUrl: string | null;      // real API-Football headshot when present, else null
  market: string;               // raw market key
  marketLabel: string;          // display label (exact posted label — never renamed)
  side: string | null;
  line: number | null;
  odds: number;
  modelProbability: number;
  startTime: string | null;
  dataQuality: string;          // "B" team / "limited" player
  confidence: string;
  settlement: string;           // official settlement rule
  limitedData: boolean;         // player props pre-lineups
  // Optional role-quality fields — populated by the role-screened (preview) builder; absent on the
  // original production specials so this stays backward-compatible.
  roleTier?: string;
  roleEvidence?: string[];
  lineupNote?: string;
  // Optional settlement fields — populated once the slate is officially settled. Backward-compatible
  // (absent on pre-event cards). settlementStatus: per-leg hit/miss/pending; settlementReason: the
  // muted subtext shown under the leg (e.g. "Belgium 0-0 Iran", "Fabian Ruiz: 0", "not started").
  settlementStatus?: "hit" | "miss" | "pending";
  settlementReason?: string;
}

export interface WorldCupSpecialCard {
  id: string;
  title: string;
  /** Optional curated theme this card was built for (e.g. "Favorites Rolling", "Goal Festival").
   *  Absent on the legacy/odds-spread generator output — cards without a theme render under "Specials". */
  theme?: string;
  risk: "longshot";
  label: "World Cup Special";
  stakePreview: number;
  combinedOdds: number;
  projectedReturn: number;
  decimalOdds: number;
  jointModelProbability: number;
  games: string[];
  legs: SpecialLeg[];
  teamPropCount: number;
  playerPropCount: number;
  correlationProfile: string;
  dataQuality: string;
  whyThisCard: string[];
  whyItCanFail: string[];
  settlementNotes: string[];
  diagnostics: string[];
  roleQualitySummary?: string; // optional — set by the role-screened (preview) builder
  // ── Editorial bundle ──────────────────────────────────────────────────────────────────────────
  // Sportsbook-desk writeup, populated for THEMED cards (and best-effort for legacy fallback cards).
  // All derived from the shared editorial brain (@/lib/world-cup/wc-editorial) + knockout-intelligence;
  // never fabricated. Optional/backward-compatible — absent on pre-editorial snapshots.
  subtitle?: string;               // one punchy line under the title
  explanation?: string;            // 2–4 sentence analyst writeup of the THEME and why it exists this slate
  confidence?: Confidence;         // confidenceLabel(jointModelProbability)
  volatility?: Volatility;         // volatilityLabel(combinedOdds)
  expectedGameScript?: string;     // stitched per-game expected scripts for the games this card touches
  correlation?: {                  // honest correlation read (correlationProfile of the legs)
    direction: "independent" | "positive" | "negative" | "mixed";
    score: number;
    summary: string;
  };
  // Optional card-level settlement state — populated once the slate is officially settled.
  // "won" | "lost" | "pending". Backward-compatible (absent on pre-event cards).
  cardStatus?: "won" | "lost" | "pending";
  settledAt?: string | null;
  settlementSource?: string | null;
}

export interface SpecialsDiagnostics {
  eligibleTeamLegs: number;
  eligiblePlayerLegs: number;
  preEventGames: number;
  excludedStartedGames: string[];
  rejectedOutOfLegOddsRange: number;
  rejectedOutOfCombinedOddsRange: number;
  rejectedStarted: number;
  rejectedDuplicates: number;
  activeMoonshotCardExcluded: boolean;
  activeBankBuilderCardExcluded: boolean;
  notes: string[];
  playerPropsUnavailable?: boolean;   // true → built from team models (no soccer player-prop data)
  fallbackMode?: "team_models" | null; // which leg source was used when player props were absent
}

export interface WorldCupSpecialsResult {
  date: string;
  generatedAt: string;
  config: WorldCupSpecialsConfig;
  cards: WorldCupSpecialCard[];
  diagnostics: SpecialsDiagnostics;
  // Optional slate-level settlement metadata — present once the slate is officially settled.
  settledAt?: string | null;
  settlementSource?: string | null;
}

// ── Market maps (posted markets only — never invent one) ─────────────────────────────────────────
const TEAM_MARKET_LABEL: Record<string, { label: string; settlement: string }> = {
  moneyline_90: { label: "Moneyline (90′)", settlement: "official 90-minute regulation result (ESPN/FIFA)" },
  double_chance: { label: "Double Chance", settlement: "official 90-minute result — win or draw" },
  match_total_goals: { label: "Total Goals", settlement: "official 90-minute combined goals" },
  btts: { label: "Both Teams To Score", settlement: "official 90-minute goals — each side scores" },
  draw_no_bet: { label: "Draw No Bet", settlement: "official 90-minute result — push on a draw" },
};
const PLAYER_MARKET_LABEL: Record<string, { label: string; settlement: string }> = {
  player_goal_scorer_anytime: { label: "Anytime Goalscorer", settlement: "official goal in regulation (ESPN/FIFA)" },
  player_shots_on_target: { label: "Shots on Target", settlement: "official shots-on-target stat" },
  player_assists: { label: "Assists", settlement: "official assist stat" },
  player_shots: { label: "Shots", settlement: "official shots stat" },
};

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

// ── Loaders (server-only) ────────────────────────────────────────────────────────────────────────
interface FixtureMeta { eventId: string; kickoffUtc: string | null; home: string; away: string }

function fixtureIndex(root: string): Map<string, FixtureMeta> {
  const out = new Map<string, FixtureMeta>();
  try {
    const team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
    for (const r of team.matches ?? []) {
      const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
      if (!out.has(fixture)) out.set(fixture, { eventId: String(r.matchId), kickoffUtc: r.kickoffUtc ?? null, home: r.homeTeam, away: r.awayTeam });
    }
  } catch { /* no team projections */ }
  return out;
}

/**
 * The team name a team-market pick references, if any (moneyline / DC / DNB). Match-level markets
 * (total goals, BTTS) reference no single team → returns null (rendered as a match-level leg).
 */
function teamForPick(market: string, pickLabel: string, home: string, away: string): string | null {
  if (market === "match_total_goals" || market === "btts") return null;
  const lc = pickLabel.toLowerCase();
  if (lc.includes(home.toLowerCase())) return home;
  if (lc.includes(away.toLowerCase())) return away;
  return null;
}

/** In-range, pre-event World Cup TEAM legs from the posted team-market projections. */
export function loadSpecialsTeamLegs(root: string, nowIso: string, date: string): SpecialLeg[] {
  let team: { matches?: Array<Record<string, any>>; date?: string };
  try {
    team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
  } catch { return []; }
  if (!date || (team.date && team.date !== date)) return [];
  const legs: SpecialLeg[] = [];
  for (const r of team.matches ?? []) {
    const mk = TEAM_MARKET_LABEL[r.market];
    if (!mk) continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (!legOddsInRange(odds)) continue;
    const startTime: string | null = r.kickoffUtc ?? null;
    if (!startTime || startTime <= nowIso) continue; // pre-event only
    const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
    const flagHome = wcTeamCodeFromName(r.homeTeam);
    const flagAway = wcTeamCodeFromName(r.awayTeam);
    // Clean, honest display labels (americanOdds is the HOME moneyline; the total side comes from the
    // posted pick or the model-favored side). Never fabricated — derived from the projection's own fields.
    let participant: string;
    let refTeam: string | null = null;
    let side: string | null = null;
    let countryCode: string | null = null;
    let teamLogo: string | null = null;
    if (r.market === "moneyline_90" || r.market === "draw_no_bet") {
      refTeam = r.homeTeam;                       // the side the posted price refers to
      participant = `${r.homeTeam} to win`;
      countryCode = flagHome; teamLogo = r.homeLogo ?? null;
    } else if (r.market === "match_total_goals") {
      side = r.pickLabel ? String(r.pickLabel) : `${(typeof r.modelProbability === "number" ? r.modelProbability : 0) >= 0.5 ? "Over" : "Under"} ${r.line}`;
      participant = side; teamLogo = r.homeLogo ?? null;
    } else { // btts + other team markets
      participant = String(r.pickLabel ?? mk.label); side = String(r.pickLabel ?? "");
      teamLogo = r.homeLogo ?? null;
    }
    const opponent = refTeam ? (refTeam === r.homeTeam ? r.awayTeam : r.homeTeam) : null;
    legs.push({
      legId: `wc-special:team:${r.matchId}:${r.market}`,
      kind: "team", sport: "WORLD_CUP", fixture, eventId: String(r.matchId),
      participant, team: refTeam, opponent,
      countryCode, flagHome, flagAway, teamLogo,
      playerId: null, photoUrl: null,
      market: r.market, marketLabel: mk.label, side,
      line: typeof r.line === "number" ? r.line : null,
      odds: odds as number, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "B", confidence: String(r.confidence ?? "Lean"),
      settlement: mk.settlement, limitedData: false,
    });
  }
  return legs;
}

/** In-range, pre-event World Cup PLAYER-PROP legs from the posted player-prop projections. */
export function loadSpecialsPlayerLegs(root: string, nowIso: string, date: string): SpecialLeg[] {
  let pp: { matches?: Array<Record<string, any>>; date?: string };
  try {
    pp = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", "latest.json"), "utf8"));
  } catch { return []; }
  if (!date || (pp.date && pp.date !== date)) return [];
  const fixtures = fixtureIndex(root);
  const legs: SpecialLeg[] = [];
  for (const r of pp.matches ?? []) {
    const mk = PLAYER_MARKET_LABEL[r.market];
    if (!mk) continue;
    if (r.projectionStatus && r.projectionStatus !== "active") continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (!legOddsInRange(odds)) continue;
    const fx = fixtures.get(String(r.fixture));
    if (!fx) continue; // can't join to a fixture → can't settle/group by game
    const startTime = fx.kickoffUtc;
    if (!startTime || startTime <= nowIso) continue; // pre-event only
    const player = r.player ?? {};
    const team = player.team ?? null;
    const opponent = team === fx.home ? fx.away : fx.home;
    const side = String(r.pick ?? (r.market === "player_goal_scorer_anytime" || r.market === "player_assists" ? "Yes" : "Over"));
    legs.push({
      legId: `wc-special:player:${fx.eventId}:${r.market}:${player.id ?? player.name}`,
      kind: "player", sport: "WORLD_CUP", fixture: `${fx.home} vs ${fx.away}`, eventId: fx.eventId,
      participant: String(player.name ?? "Player"), team, opponent,
      countryCode: team ? wcTeamCodeFromName(team) : null,
      playerId: player.id != null ? Number(player.id) : null,
      photoUrl: typeof player.photo === "string" ? player.photo : null,
      market: r.market, marketLabel: mk.label,
      side, line: typeof r.line === "number" ? r.line : null,
      odds: odds as number, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "limited", confidence: String(r.confidence ?? "Lower confidence"),
      settlement: mk.settlement, limitedData: true,
    });
  }
  return legs;
}

// ── Generator core (pure) ────────────────────────────────────────────────────────────────────────
/** Identity used to compare a Special's legs against the active Moonshot / Bank Builder cards. */
function legMatchKey(fixture: string, marketLabel: string, participant: string, side: string | null, line: number | null): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(fixture)}|${norm(marketLabel)}|${norm(participant)}|${norm(side)}|${line ?? ""}`;
}
function cardSignature(legs: Array<{ fixture: string; marketLabel: string; participant: string; side: string | null; line: number | null }>): string {
  return legs.map((l) => legMatchKey(l.fixture, l.marketLabel, l.participant, l.side, l.line)).sort().join("||");
}

const PICK_LABEL = (l: SpecialLeg) =>
  `${l.marketLabel}${l.side && l.kind === "player" ? ` ${l.side}` : ""}${l.line != null ? ` ${l.line}` : ""}`.trim();

/** "team-result" markets (moneyline / DC / DNB) — at most one per team per card (they're redundant). */
const TEAM_RESULT_MARKETS = new Set(["moneyline_90", "double_chance", "draw_no_bet"]);

/** Hard contradiction / duplicate between two legs (these can never co-exist in one card). */
function legsConflict(a: SpecialLeg, b: SpecialLeg): boolean {
  if (a.legId === b.legId) return true;
  // Same player appearing twice (any markets) — keep cards clean + diverse.
  if (a.kind === "player" && b.kind === "player" && a.playerId != null && a.playerId === b.playerId) return true;
  if (a.eventId !== b.eventId) return false; // cross-game legs never contradict
  // Same match-level market with opposite sides (BTTS Yes vs No, Over vs Under).
  if (a.market === b.market && (a.market === "btts" || a.market === "match_total_goals")) return true;
  // Two redundant team-result markets for the SAME team (e.g. Turkey ML + Turkey DNB).
  if (TEAM_RESULT_MARKETS.has(a.market) && TEAM_RESULT_MARKETS.has(b.market) && a.team && a.team === b.team) return true;
  return false;
}

function cardValid(legs: SpecialLeg[], cfg: WorldCupSpecialsConfig): boolean {
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++)
      if (legsConflict(legs[i], legs[j])) return false;
  const team = legs.filter((l) => l.kind === "team").length;
  const player = legs.filter((l) => l.kind === "player").length;
  const games = new Set(legs.map((l) => l.eventId)).size;
  return team >= cfg.minTeamPropsPerCard && player >= cfg.minPlayerPropsPerCard && games >= cfg.minGamesPerCard;
}

/** Mean same-game pair fraction — a light, honest correlation estimate (0 = all cross-game). */
function meanSameGameCorrelation(legs: SpecialLeg[]): number {
  let pairs = 0, same = 0;
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      pairs++;
      if (legs[i].eventId === legs[j].eventId) same++;
    }
  return pairs ? (same / pairs) * 0.4 : 0; // same-game attacking/result legs ~ mildly positive
}

const isOverish = (l: SpecialLeg) =>
  (l.market === "match_total_goals" && /over/i.test(l.side ?? l.participant)) ||
  (l.market === "btts" && /yes/i.test(l.participant));

/**
 * Honest same-game correlation classifier. A POSITIVE (intentional) stack is a same-game pair that
 * moves together: an Over/BTTS-Yes total + any attacking player in that game, or a team-result market
 * for team X + an attacking player ON team X. Cross-team same-game pairs (e.g. a team market + the
 * opponent's player) are "mixed", not a positive stack — disclosed as such, not overclaimed.
 */
function classifyCorrelation(legs: SpecialLeg[]): { profile: string; intentionalStack: boolean } {
  let positive = false, anySameGame = false;
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.eventId !== b.eventId) continue;
      anySameGame = true;
      const [t, p] = a.kind === "player" ? [b, a] : [a, b]; // t = the (possible) team leg
      if (p.kind !== "player") continue;
      if (isOverish(t) && p.kind === "player") positive = true;                     // more goals ↔ a scorer/shot
      if (TEAM_RESULT_MARKETS.has(t.market) && t.team && p.team === t.team) positive = true; // team X wins ↔ team X attacker
    }
  if (positive) return { profile: "multi_game_with_intentional_stack", intentionalStack: true };
  if (anySameGame) return { profile: "multi_game_mixed_correlation", intentionalStack: false };
  return { profile: "multi_game_low_correlation", intentionalStack: false };
}

/** Curate a per-game player subset that spans the odds spectrum (favourites → plus-money upside). */
function curatePlayers(players: SpecialLeg[], perGame: number): SpecialLeg[] {
  const byGame = new Map<string, SpecialLeg[]>();
  for (const l of players) (byGame.get(l.eventId) ?? byGame.set(l.eventId, []).get(l.eventId)!).push(l);
  const out: SpecialLeg[] = [];
  for (const list of byGame.values()) {
    const sorted = [...list].sort((a, b) => a.odds - b.odds); // shortest (favourite) → longest (upside)
    if (sorted.length <= perGame) { out.push(...sorted); continue; }
    // Evenly sample across the odds spectrum so cards can reach both low and high combined targets.
    const picks: SpecialLeg[] = [];
    for (let i = 0; i < perGame; i++) picks.push(sorted[Math.round((i * (sorted.length - 1)) / (perGame - 1))]);
    out.push(...Array.from(new Set(picks)));
  }
  return out;
}

/** Enumerate valid leg combinations (bounded) — distinct, constraint-satisfying, in-range cards. */
function enumerate(pool: SpecialLeg[], legCounts: number[], cfg: WorldCupSpecialsConfig): { combo: SpecialLeg[]; combined: number }[] {
  const sorted = [...pool].sort((a, b) => b.modelProbability - a.modelProbability);
  const out: { combo: SpecialLeg[]; combined: number }[] = [];
  const seen = new Set<string>();
  const n = sorted.length;
  for (const L of legCounts) {
    const idx: number[] = [];
    const rec = (start: number) => {
      if (idx.length === L) {
        const combo = idx.map((i) => sorted[i]);
        if (!cardValid(combo, cfg)) return;
        const combined = combinedAmerican(combo.map((l) => l.odds));
        if (!combinedOddsInRange(combined, cfg)) return;
        const sig = cardSignature(combo);
        if (seen.has(sig)) return;
        seen.add(sig);
        out.push({ combo, combined: combined as number });
        return;
      }
      for (let i = start; i < n; i++) {
        // prune: even if we add the remaining shortest-priced legs we still need to be < maxCombined,
        // and adding more legs only raises odds — but legs can be either sign, so we don't hard-prune here.
        idx.push(i);
        rec(i + 1);
        idx.pop();
      }
    };
    rec(0);
  }
  return out;
}

/** Score a candidate (higher = better): sweet-spot odds, joint prob, team/player balance, low correlation, clarity. */
function scoreCard(combo: SpecialLeg[], combined: number): number {
  const joint = combinedHitProbability(combo.map((l) => l.modelProbability)) ?? 0;
  const team = combo.filter((l) => l.kind === "team").length;
  const player = combo.filter((l) => l.kind === "player").length;
  // sweet spot peaks at +1500 (spec prefers +1200..+1800), 0 at the band edges.
  const sweet = 1 - Math.min(1, Math.abs(combined - 1500) / 1500);
  const jointNorm = Math.min(1, joint / 0.08); // ~8% joint is a strong longshot
  const balance = 1 - Math.abs(team - player) / combo.length;
  const corr = 1 - meanSameGameCorrelation(combo);
  const clarity = combo.length <= 5 ? 1 : combo.length === 6 ? 0.7 : 0.4; // prefer 4–5 legs
  return 0.34 * sweet + 0.24 * jointNorm + 0.2 * balance + 0.12 * corr + 0.1 * clarity;
}

/** Jaccard overlap of two leg sets (for diversity selection). */
function overlap(a: SpecialLeg[], b: SpecialLeg[]): number {
  const sa = new Set(a.map((l) => l.legId)), sb = new Set(b.map((l) => l.legId));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface GenerateOptions {
  date: string;
  generatedAt: string;
  config?: WorldCupSpecialsConfig;
  excludeSignatures?: string[]; // active Moonshot / Bank Builder card signatures to never duplicate
  excludedStartedGames?: string[];
  rejectedStarted?: number;
}

const WHY_STACK = "Includes an intentional same-game stack (a team market + a player from that game) — correlation-disclosed, not hidden.";

/** Pure generator: from the in-range, pre-event team + player pools, build up to 5 ranked Specials. */
export function generateWorldCupSpecials(
  teamLegs: SpecialLeg[],
  playerLegs: SpecialLeg[],
  opts: GenerateOptions,
): WorldCupSpecialsResult {
  const cfg = opts.config ?? WORLD_CUP_SPECIALS_CONFIG;
  const excluded = new Set(opts.excludeSignatures ?? []);
  const games = new Set([...teamLegs, ...playerLegs].map((l) => l.eventId));

  const diagnostics: SpecialsDiagnostics = {
    eligibleTeamLegs: teamLegs.length,
    eligiblePlayerLegs: playerLegs.length,
    preEventGames: games.size,
    excludedStartedGames: opts.excludedStartedGames ?? [],
    rejectedOutOfLegOddsRange: 0, // filtered upstream in the loaders (logged separately by the snapshot builder)
    rejectedOutOfCombinedOddsRange: 0,
    rejectedStarted: opts.rejectedStarted ?? 0,
    rejectedDuplicates: 0,
    activeMoonshotCardExcluded: false,
    activeBankBuilderCardExcluded: false,
    notes: [],
  };

  if (games.size < cfg.minGamesPerCard) {
    diagnostics.notes.push(`not_enough_valid_specials: only ${games.size} pre-event World Cup game(s) — a Special needs ${cfg.minGamesPerCard}.`);
    return { date: opts.date, generatedAt: opts.generatedAt, config: cfg, cards: [], diagnostics };
  }

  // FALLBACK HIERARCHY: player props → team props. When fewer than the required player props are available
  // (e.g. The Odds API exposes no soccer player-prop markets), DO NOT block the product — build the cards
  // from TEAM models instead (relax the player requirement to 0 and require the full card be team legs).
  const playerPropsAvailable = cfg.minPlayerPropsPerCard > 0 && playerLegs.length >= cfg.minPlayerPropsPerCard;
  const effCfg: WorldCupSpecialsConfig = playerPropsAvailable
    ? cfg
    : { ...cfg, minPlayerPropsPerCard: 0, minTeamPropsPerCard: Math.max(cfg.minTeamPropsPerCard, 4) };
  if (!playerPropsAvailable) {
    diagnostics.playerPropsUnavailable = true;
    diagnostics.fallbackMode = "team_models";
    diagnostics.notes.push("player_props_unavailable: built from team models (moneyline / double-chance / totals / BTTS) — no soccer player-prop data this slate.");
  } else {
    diagnostics.fallbackMode = null;
  }

  // Curate the player pool (span the odds spectrum per game) to bound the enumeration, then enumerate.
  const curated = curatePlayers(playerLegs, 7);
  const pool = [...teamLegs, ...curated];
  const candidates = enumerate(pool, [4, 5, 6], effCfg);

  // Drop exact duplicates of the active Moonshot / Bank Builder cards.
  const kept = candidates.filter((c) => {
    const sig = cardSignature(c.combo);
    if (excluded.has(sig)) {
      diagnostics.rejectedDuplicates++;
      diagnostics.activeMoonshotCardExcluded = true; // we only seed Moonshot/BB sigs into `excluded`
      return false;
    }
    return true;
  });

  // Rank by quality, then SPREAD across the odds band so the 5 cards aren't all clustered at +1500:
  // pick the best, diverse card from each of 5 sub-bands covering +700..+3000.
  const ranked = kept
    .map((c) => ({ ...c, score: scoreCard(c.combo, c.combined) }))
    .sort((a, b) => b.score - a.score || a.combined - b.combined);

  const BANDS: Array<[number, number]> = [[700, 1050], [1050, 1450], [1450, 1900], [1900, 2400], [2400, 3000]];
  const chosen: typeof ranked = [];
  const tooSimilar = (cand: { combo: SpecialLeg[] }) =>
    chosen.some((ch) => overlap(cand.combo, ch.combo) > 0.5 || cardSignature(ch.combo) === cardSignature(cand.combo));

  for (const [lo, hi] of BANDS) {
    const pick = ranked.find((c) => c.combined > lo && c.combined <= hi && !tooSimilar(c));
    if (pick) chosen.push(pick);
  }
  // Fill any empty bands from the global ranked remainder (still distinct), preserving the target of 5.
  if (chosen.length < cfg.maxCardsShown)
    for (const cand of ranked) {
      if (chosen.length >= cfg.maxCardsShown) break;
      if (chosen.includes(cand) || tooSimilar(cand)) continue;
      chosen.push(cand);
    }
  // Present low → high combined odds.
  chosen.sort((a, b) => a.combined - b.combined);

  if (chosen.length < cfg.count) {
    diagnostics.notes.push(`not_enough_valid_specials: produced ${chosen.length} of ${cfg.count} (pool: ${teamLegs.length} team + ${playerLegs.length} player legs across ${games.size} pre-event games).`);
  }

  const cards: WorldCupSpecialCard[] = chosen.map((c, i) => buildCard(c.combo, c.combined, i, opts, cfg));
  return { date: opts.date, generatedAt: opts.generatedAt, config: cfg, cards, diagnostics };
}

function titleFor(legs: SpecialLeg[], combined: number): string {
  const players = legs.filter((l) => l.kind === "player");
  const scorers = players.filter((l) => l.market === "player_goal_scorer_anytime").length;
  const sot = players.filter((l) => l.market === "player_shots_on_target").length;
  const overs = legs.filter((l) => isOverish(l)).length;
  const tier = combined >= 2000 ? "longshot " : "";
  if (scorers >= 2) return `Multi-goalscorer ${tier}special`;
  if (scorers >= 1 && sot >= 1) return `Goalscorer + shots ${tier}special`;
  if (overs >= 1 && (scorers >= 1 || sot >= 1)) return `Goals-and-attackers ${tier}special`;
  if (sot >= 2) return `Shots-on-target ${tier}stack`;
  return `Two-game team & player ${tier}special`;
}

function buildCard(
  combo: SpecialLeg[],
  combined: number,
  index: number,
  opts: GenerateOptions,
  cfg: WorldCupSpecialsConfig,
): WorldCupSpecialCard {
  // Stable, story-clear ordering: team anchors first, then players by model probability.
  const legs = [...combo].sort((a, b) =>
    (a.kind === b.kind ? b.modelProbability - a.modelProbability : a.kind === "team" ? -1 : 1));
  const decimal = combinedDecimal(legs.map((l) => l.odds)) ?? dec(combined);
  const joint = combinedHitProbability(legs.map((l) => l.modelProbability)) ?? 0;
  const team = legs.filter((l) => l.kind === "team").length;
  const player = legs.filter((l) => l.kind === "player").length;
  const gameNames = Array.from(new Set(legs.map((l) => l.fixture)));
  const { profile, intentionalStack: stack } = classifyCorrelation(legs);
  const anchors = legs.filter((l) => l.kind === "team").slice(0, 2).map((l) => `${l.participant} (${l.marketLabel})`);
  const ups = legs.filter((l) => l.kind === "player").slice(0, 2).map((l) => `${l.participant} ${l.marketLabel}`);

  return {
    id: `wc-special-${opts.date}-${index + 1}`,
    title: titleFor(legs, combined),
    risk: "longshot",
    label: "World Cup Special",
    stakePreview: cfg.stakePreview,
    combinedOdds: combined,
    projectedReturn: Math.round(cfg.stakePreview * decimal * 100) / 100,
    decimalOdds: Math.round(decimal * 1000) / 1000,
    jointModelProbability: Math.round(joint * 1000) / 1000,
    games: gameNames,
    legs,
    teamPropCount: team,
    playerPropCount: player,
    correlationProfile: profile,
    dataQuality: "mixed (team B · player limited-data / market-implied)",
    whyThisCard: [
      `World Cup-only, ${gameNames.length} distinct games — a high-volatility, odds-backed paper longshot.`,
      `${team} team anchor${team === 1 ? "" : "s"} (${anchors.join(", ")}) carry the card; ${player} attacking player prop${player === 1 ? "" : "s"} (${ups.join(", ")}) supply the upside.`,
      ...(stack ? [WHY_STACK] : ["Legs spread across two games with no same-team alignment — mixed, mostly independent correlation."]),
    ],
    whyItCanFail: [
      `${legs.length} legs must ALL hit — joint model probability ≈ ${(joint * 100).toFixed(0)}%. Higher variance by design.`,
      "Player props are limited-data / market-implied (lineups not yet posted) — lower confidence than the team markets.",
      ...(stack ? ["The intentional same-game stack cuts both ways — a quiet game can sink multiple legs at once."] : ["A single upset in either game ends the card."]),
    ],
    settlementNotes: Array.from(new Set(legs.map((l) => l.settlement))),
    diagnostics: [
      `combined ${combined > 0 ? "+" : ""}${combined} (band +${cfg.minCombinedOdds}..+${cfg.maxCombinedOdds})`,
      `legs ${legs.length} · team ${team} · player ${player} · games ${gameNames.length}`,
      `every leg odds in (${cfg.minLegOdds}, ${cfg.maxLegOdds})`,
    ],
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THEMED SPECIALS — curated, story-first cards built for a named theme (Favorites Rolling, Goal
// Festival, Defensive Games, Chaos Builder, Underdog Ladder, Giant Killer), re-ranked by the SHARED
// knockout-intelligence layer so every product agrees on what fits the knockout script. Quality over
// quantity: a theme only emits cards when REAL in-band legs support it — never forced, never invented.
//
// All themed cards still satisfy the same hard discipline as the legacy generator: combined odds in
// (+700, +3000), per-leg odds in (-250, +200), >= 2 team + >= 2 player legs across >= 2 distinct games,
// the no-bench/role-quality gate on player legs, and no contradictory/duplicate legs in one card.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A per-outcome team leg (correct per-side price, sourced from the projection's `outcomes` array —
 *  NOT the top-level home/pick price). Carries a stable `selectionKey` so themes can pick the right side. */
interface TeamOutcomeLeg extends SpecialLeg {
  selectionKey: string; // e.g. "moneyline_90:home", "double_chance:X2", "match_total_goals:over", "btts:no"
}

/** Build every in-band, pre-event team-OUTCOME leg from the team projections (one row → up to N legs,
 *  one per priced outcome). This is the honest source for themed cards: each leg's odds + probability
 *  come from that exact outcome, so a leg labelled "South Africa to win" carries South Africa's price. */
function loadThemedTeamLegs(root: string, nowIso: string, date: string): TeamOutcomeLeg[] {
  let team: { matches?: Array<Record<string, any>>; date?: string };
  try {
    team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
  } catch { return []; }
  if (!date || (team.date && team.date !== date)) return [];
  const legs: TeamOutcomeLeg[] = [];
  for (const r of team.matches ?? []) {
    const mk = TEAM_MARKET_LABEL[r.market];
    if (!mk) continue;
    const startTime: string | null = r.kickoffUtc ?? null;
    if (!startTime || startTime <= nowIso) continue; // pre-event only
    const home: string = r.homeTeam, away: string = r.awayTeam;
    const fixture = `${home} vs ${away}`;
    const flagHome = wcTeamCodeFromName(home);
    const flagAway = wcTeamCodeFromName(away);
    for (const o of (Array.isArray(r.outcomes) ? r.outcomes : [])) {
      const odds = typeof o.americanOdds === "number" ? o.americanOdds : null;
      if (!legOddsInRange(odds)) continue; // strict per-leg band — rejects extreme favourites/longshots
      const sideRaw = String(o.side ?? "");
      const sideLc = sideRaw.toLowerCase();
      const label = String(o.label ?? mk.label);
      // Resolve the team this outcome references (null for match-level totals/BTTS and "draw").
      let refTeam: string | null = null;
      if (r.market === "moneyline_90" || r.market === "draw_no_bet") {
        if (sideLc === "home") refTeam = home; else if (sideLc === "away") refTeam = away;
      } else if (r.market === "double_chance") {
        if (sideLc === "1x") refTeam = home; else if (sideLc === "x2") refTeam = away; // "12" spans both → null
      }
      const participant =
        r.market === "moneyline_90" ? (refTeam ? `${refTeam} to win` : label)
        : r.market === "draw_no_bet" ? label
        : r.market === "double_chance" ? label
        : label; // totals / BTTS use the posted outcome label verbatim
      const opponent = refTeam ? (refTeam === home ? away : home) : null;
      const countryCode = refTeam ? wcTeamCodeFromName(refTeam) : null;
      legs.push({
        legId: `wc-special-theme:team:${r.matchId}:${r.market}:${sideRaw}`,
        kind: "team", sport: "WORLD_CUP", fixture, eventId: String(r.matchId),
        participant, team: refTeam, opponent,
        countryCode, flagHome, flagAway, teamLogo: r.homeLogo ?? null,
        playerId: null, photoUrl: null,
        market: r.market, marketLabel: mk.label, side: r.market === "moneyline_90" ? null : sideRaw,
        line: typeof r.line === "number" ? r.line : null,
        odds: odds as number,
        modelProbability: typeof o.modelProbability === "number" ? o.modelProbability : 0,
        startTime, dataQuality: "B", confidence: String(r.confidence ?? "Lean"),
        settlement: mk.settlement, limitedData: false,
        selectionKey: `${r.market}:${sideLc}`,
      });
    }
  }
  return legs;
}

/** Role-gated player legs: the in-band, pre-event player legs that ALSO pass the no-bench/role-quality
 *  gate (projected starter / key attacker / confirmed starter). Bench, rotation, defender-on-attacking,
 *  goalkeeper and unknown-role players are excluded — same gate the role-screened preview uses. */
function loadThemedPlayerLegs(root: string, nowIso: string, date: string): SpecialLeg[] {
  const all = loadSpecialsPlayerLegs(root, nowIso, date);
  let pp: { matches?: Array<Record<string, any>> };
  try {
    pp = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", "latest.json"), "utf8"));
  } catch { return all; }
  const roleMap = classifyPlayerRoles((pp.matches ?? []) as any[], false);
  return all.filter((l) => {
    const role = roleMap.get(roleKeyForRow({ player: { id: l.playerId ?? undefined, name: l.participant, team: l.team ?? undefined } }));
    if (!role || !ROLE_ELIGIBLE_TIERS.has(role.roleTier)) return false;
    l.roleTier = role.roleTier;
    l.roleEvidence = role.evidence;
    l.lineupNote = "lineups not posted — projected role (market-implied)";
    return true;
  });
}

const isOverishTeamLeg = (l: SpecialLeg) =>
  (l.market === "match_total_goals" && /over/i.test(l.side ?? l.participant)) ||
  (l.market === "btts" && /yes/i.test(l.participant));
const isUnderTeamLeg = (l: SpecialLeg) => l.market === "match_total_goals" && /under/i.test(l.side ?? l.participant);
const isBttsNoLeg = (l: SpecialLeg) => l.market === "btts" && /no/i.test(l.side ?? l.participant);
const isResultLeg = (l: SpecialLeg) => TEAM_RESULT_MARKETS.has(l.market);

/** The knockout-intelligence multiplier for a team leg (0.85..1.15 — fits vs. fights the knockout script). */
function fitForTeamLeg(l: SpecialLeg, ctxs: Map<string, KnockoutContext>): number {
  const selection = (l.side ?? l.participant ?? "").toLowerCase();
  return knockoutFitMultiplier({ marketKey: l.market, selection, odds: l.odds }, ctxs.get(l.eventId));
}

/** Pick the best attacking player on a given team in a given game (highest model prob, in-band).
 *  `preferMarkets` (e.g. goalscorer-first for goal themes) is tried before falling back to any market. */
function bestAttackerOn(
  players: SpecialLeg[], eventId: string, team: string | null, exclude: Set<string>, preferMarkets?: string[],
): SpecialLeg | null {
  const pool = players.filter((p) => p.eventId === eventId && (!team || p.team === team) && !exclude.has(p.legId) && p.playerId != null);
  if (preferMarkets?.length) {
    const preferred = pool.filter((p) => preferMarkets.includes(p.market)).sort((a, b) => b.modelProbability - a.modelProbability);
    if (preferred[0]) return preferred[0];
  }
  return [...pool].sort((a, b) => b.modelProbability - a.modelProbability)[0] ?? null;
}
/** Pick the best attacking player in a game regardless of side (for festival/total stacks). */
function bestAttackerInGame(players: SpecialLeg[], eventId: string, exclude: Set<string>, preferMarkets?: string[]): SpecialLeg | null {
  return bestAttackerOn(players, eventId, null, exclude, preferMarkets);
}

/** Theme spec: which team legs anchor it + how to source the players + a narrative. */
interface ThemeOutcome { combo: SpecialLeg[]; combined: number; theme: string; notes: string[] }

/** Try to assemble ONE card for a theme from an ordered list of candidate team-leg picks + a player
 *  sourcing strategy. Returns null when the slate can't support the theme at quality (combined out of
 *  band, not enough in-band legs, etc.) — themes are never forced. */
function tryThemeCard(
  theme: string,
  teamPicks: SpecialLeg[],
  players: SpecialLeg[],
  ctxs: Map<string, KnockoutContext>,
  cfg: WorldCupSpecialsConfig,
  opts: {
    playerStrategy: "same-team" | "in-game";
    minPlayers?: number;
    preferMarkets?: string[];   // e.g. ["player_goal_scorer_anytime"] to lead a goal theme with scorers
    requireMarkets?: string[];  // HARD filter — only these player markets are eligible (e.g. goalscorer-only trio)
    avoidPlayerIds?: Set<number>; // players already spent by other themes — diversifies the published set
    extraNotes?: string[];
  },
): ThemeOutcome | null {
  const minPlayers = opts.minPlayers ?? cfg.minPlayerPropsPerCard;
  const pref = opts.preferMarkets;
  // When a theme HARD-requires certain player markets (e.g. a goalscorer-only trio), restrict the player
  // pool up front so the card honestly contains only those markets — never a silent fallback to others.
  if (opts.requireMarkets?.length) players = players.filter((p) => opts.requireMarkets!.includes(p.market));
  // De-dupe team picks + reject contradictory pairs.
  const teamLegs: SpecialLeg[] = [];
  for (const t of teamPicks) {
    if (teamLegs.some((x) => x.legId === t.legId)) continue;
    if (teamLegs.some((x) => legsConflict(x, t))) continue;
    teamLegs.push(t);
  }
  if (teamLegs.length < cfg.minTeamPropsPerCard) return null;

  const used = new Set<string>(teamLegs.map((l) => l.legId));
  const playerLegs: SpecialLeg[] = [];
  const gamesInPlay = Array.from(new Set(teamLegs.map((l) => l.eventId)));
  const teamsInPlay = teamLegs.map((l) => l.team).filter((t): t is string => !!t);
  // Prefer not to reuse a player another theme already spent (diversifies the final 5); relaxed below.
  const avoidPool = (opts.avoidPlayerIds && opts.avoidPlayerIds.size)
    ? players.filter((p) => p.playerId == null || !opts.avoidPlayerIds!.has(p.playerId))
    : players;

  const addFrom = (src: SpecialLeg[], p: SpecialLeg | null) => {
    if (!p) return false;
    if (used.has(p.legId)) return false;
    if (playerLegs.some((x) => legsConflict(x, p))) return false;
    if (teamLegs.some((x) => legsConflict(x, p))) return false;
    playerLegs.push(p); used.add(p.legId); return true;
  };
  // Try the diversified pool first, then the full pool (so a theme is never blocked for lack of fresh names).
  const pickOn = (ev: string, team: string | null) =>
    addFrom(avoidPool, bestAttackerOn(avoidPool, ev, team, used, pref)) || addFrom(players, bestAttackerOn(players, ev, team, used, pref));
  const pickInGame = (ev: string) =>
    addFrom(avoidPool, bestAttackerInGame(avoidPool, ev, used, pref)) || addFrom(players, bestAttackerInGame(players, ev, used, pref));

  if (opts.playerStrategy === "same-team") {
    for (const team of teamsInPlay) pickOn(teamLegs.find((l) => l.team === team)!.eventId, team);
  } else {
    for (const ev of gamesInPlay) { pickInGame(ev); pickInGame(ev); }
  }
  // Top up players from any game already in the card until we hit the minimum.
  if (playerLegs.length < minPlayers)
    for (const ev of gamesInPlay) { if (playerLegs.length >= minPlayers) break; pickInGame(ev); }

  if (playerLegs.length < minPlayers) return null;

  const combo = [...teamLegs, ...playerLegs];
  if (!cardValid(combo, { ...cfg, minPlayerPropsPerCard: minPlayers })) return null;
  const combined = combinedAmerican(combo.map((l) => l.odds));
  if (!combinedOddsInRange(combined, cfg)) return null;

  // Bake the relevant knockout-context notes from every game the card touches.
  const notes = new Set<string>(opts.extraNotes ?? []);
  for (const ev of gamesInPlay) {
    const ctx = ctxs.get(ev);
    if (!ctx) continue;
    notes.add(knockoutTierLabel(ctx));
    for (const n of ctx.notes.slice(1)) notes.add(n); // skip the generic "Knockout (single-leg…)" preamble (shared once)
  }
  notes.add("Knockout (single-leg elimination): a draw at 90' goes to extra time — 90-minute markets price in cautious, lead-protecting football.");
  return { combo, combined: combined as number, theme, notes: Array.from(notes) };
}

/** Mean knockout-fit across a card's team legs — used to rank competing cards for the same theme. */
function cardKnockoutFit(combo: SpecialLeg[], ctxs: Map<string, KnockoutContext>): number {
  const teamLegs = combo.filter((l) => l.kind === "team");
  if (!teamLegs.length) return 1;
  return teamLegs.reduce((s, l) => s + fitForTeamLeg(l, ctxs), 0) / teamLegs.length;
}

/** The full catalogue of honest themed Specials the engine attempts. A theme only PUBLISHES when the
 *  slate's REAL in-band markets support it; the others are skipped + recorded in diagnostics (never forced,
 *  never invented). Used for honest "built vs skipped" accounting in `buildWorldCupSpecials`. */
export const WORLD_CUP_SPECIAL_THEMES = [
  "Favorites Rolling",
  "Heavy Favorite Builder",
  "Tournament Favorite Builder",
  "Goal Festival",
  "Goalscorer Trio",
  "Defensive Games",
  "Underdog Ladder",
  "Chaos Builder",
  "Giant Killer",
  "Bracket Survivor",
] as const;

/**
 * Build the themed card set. Pure + deterministic. Each theme produces 0..N quality cards; the union is
 * de-duplicated and (theme-tagged) returned low → high combined odds. Themes that the slate can't support
 * at quality simply yield nothing — we never force a weak combination or invent a market.
 */
export function buildThemedCards(
  teamLegs: TeamOutcomeLeg[],
  playerLegs: SpecialLeg[],
  ctxs: Map<string, KnockoutContext>,
  opts: GenerateOptions,
): ThemeOutcome[] {
  const cfg = opts.config ?? WORLD_CUP_SPECIALS_CONFIG;
  const out: ThemeOutcome[] = [];
  // Players already spent by accepted cards — later themes prefer fresh names so the published set is
  // diverse (not the same three SOT favourites on every card).
  const spentPlayers = new Set<number>();
  const recordSpent = (o: ThemeOutcome) => {
    for (const l of o.combo) if (l.kind === "player" && l.playerId != null) spentPlayers.add(l.playerId);
  };
  // Keep up to `max` distinct, low-overlap cards for a theme (best knockout-fit first, then shortest price).
  const pushBest = (cands: (ThemeOutcome | null)[], max: number) => {
    const ranked = cands.filter((c): c is ThemeOutcome => !!c)
      .sort((a, b) => cardKnockoutFit(b.combo, ctxs) - cardKnockoutFit(a.combo, ctxs) || a.combined - b.combined);
    const keptForTheme: ThemeOutcome[] = [];
    const seen = new Set<string>();
    for (const c of ranked) {
      if (keptForTheme.length >= max) break;
      const sig = cardSignature(c.combo);
      if (seen.has(sig)) continue;
      if (keptForTheme.some((k) => overlap(k.combo, c.combo) > 0.5)) continue; // diverse within a theme
      if (out.some((o) => overlap(o.combo, c.combo) > 0.5)) continue;          // diverse across themes
      seen.add(sig);
      keptForTheme.push(c);
      out.push(c);
      recordSpent(c);
    }
  };

  // Convenience selectors over the in-band team legs.
  const resultLegs = teamLegs.filter(isResultLeg);
  const favResultLegs = resultLegs
    .filter((l) => l.team && ctxs.get(l.eventId)?.favoriteTeam === l.team)
    .sort((a, b) => b.modelProbability - a.modelProbability);
  const dogResultLegs = resultLegs
    .filter((l) => !l.team || ctxs.get(l.eventId)?.favoriteTeam !== l.team)
    .sort((a, b) => b.odds - a.odds); // longest price first = the genuine value/upside dog leg
  const underLegs = teamLegs.filter(isUnderTeamLeg).sort((a, b) => b.modelProbability - a.modelProbability);
  const bttsNoLegs = teamLegs.filter(isBttsNoLeg).sort((a, b) => b.modelProbability - a.modelProbability);
  const overLegs = teamLegs.filter((l) => l.market === "match_total_goals" && /over/i.test(l.side ?? l.participant))
    .sort((a, b) => b.modelProbability - a.modelProbability);
  const bttsYesLegs = teamLegs.filter((l) => l.market === "btts" && /yes/i.test(l.participant))
    .sort((a, b) => b.modelProbability - a.modelProbability);

  // ── Favorites Rolling — clear/slight favourites advancing (result markets), backed by their attackers.
  {
    const favs = favResultLegs;
    const cands: (ThemeOutcome | null)[] = [];
    // pair the two strongest favourite result legs from DISTINCT games
    for (let i = 0; i < favs.length; i++)
      for (let j = i + 1; j < favs.length; j++) {
        if (favs[i].eventId === favs[j].eventId) continue;
        cands.push(tryThemeCard("Favorites Rolling", [favs[i], favs[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "same-team", avoidPlayerIds: spentPlayers,
          extraNotes: ["Lower combined odds, higher joint probability — the favourites are expected to advance, and attackers ON those favourites carry the upside."],
        }));
      }
    pushBest(cands, 2);
  }

  // ── Goal Festival — Over 2.5 + BTTS Yes in the most open games + goalscorers/shots from those games.
  {
    const opens = [...overLegs, ...bttsYesLegs];
    const cands: (ThemeOutcome | null)[] = [];
    // Prefer two open-game team legs from distinct games (an Over and a BTTS-Yes, or two Overs).
    for (let i = 0; i < opens.length; i++)
      for (let j = i + 1; j < opens.length; j++) {
        if (opens[i].eventId === opens[j].eventId && opens[i].market === opens[j].market) continue;
        cands.push(tryThemeCard("Goal Festival", [opens[i], opens[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "in-game", avoidPlayerIds: spentPlayers,
          preferMarkets: ["player_goal_scorer_anytime"], // lead the goal theme with scorers when posted
          extraNotes: ["Goals-and-attackers: Over 2.5 / BTTS-Yes anchors paired with goalscorers in the same games — a correlated, high-variance 'open game' bet."],
        }));
      }
    pushBest(cands, 2);
  }

  // ── Defensive Games — Under 2.5 + BTTS No across cautious ties, plus a couple of shots props.
  {
    const lowEvent = [...underLegs, ...bttsNoLegs].sort((a, b) => b.modelProbability - a.modelProbability);
    const cands: (ThemeOutcome | null)[] = [];
    for (let i = 0; i < lowEvent.length; i++)
      for (let j = i + 1; j < lowEvent.length; j++) {
        if (lowEvent[i].eventId === lowEvent[j].eventId) continue; // distinct games (Under + BTTS-No in same game is fine but we want spread)
        cands.push(tryThemeCard("Defensive Games", [lowEvent[i], lowEvent[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "in-game", avoidPlayerIds: spentPlayers,
          extraNotes: ["Cautious knockout ties: Under 2.5 + BTTS-No anchors. The attacking props are the card's upside, but the team read is a low-event game."],
        }));
      }
    pushBest(cands, 1);
  }

  // ── Underdog Ladder — value-heavy underdog double-chance / moneyline, with underdog attackers.
  {
    const dogs = dogResultLegs;
    const cands: (ThemeOutcome | null)[] = [];
    for (let i = 0; i < dogs.length; i++)
      for (let j = i + 1; j < dogs.length; j++) {
        if (dogs[i].eventId === dogs[j].eventId) continue;
        cands.push(tryThemeCard("Underdog Ladder", [dogs[i], dogs[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "in-game", avoidPlayerIds: spentPlayers,
          extraNotes: ["Value-heavy underdog ladder: priced underdogs (double-chance / moneyline) stacked for a longer combined price — every leg is live, none is a coin-flip favourite."],
        }));
      }
    pushBest(cands, 1);
  }

  // ── Chaos Builder — one or two reasonably-priced upsets mixed with value (a dog leg + an open-game leg).
  {
    const dogs = dogResultLegs;
    const value = [...overLegs, ...bttsYesLegs, ...favResultLegs];
    const cands: (ThemeOutcome | null)[] = [];
    for (const d of dogs)
      for (const v of value) {
        if (d.eventId === v.eventId) continue;
        if (d.legId === v.legId) continue;
        cands.push(tryThemeCard("Chaos Builder", [d, v], playerLegs, ctxs, cfg, {
          playerStrategy: "in-game", avoidPlayerIds: spentPlayers,
          extraNotes: ["A reasonably-priced upset paired with a value leg — chaos by design, but every leg is market-supported, not a flyer."],
        }));
      }
    pushBest(cands, 1);
  }

  // ── Giant Killer — ONE carefully chosen upset framed as the card's anchor (only if a defensible one
  //    exists: a live underdog in an EVEN tie with real extra-time risk). Supported by a second in-band
  //    team leg + that underdog's attackers so the card meets the >=2 team / >=2 player discipline.
  {
    const defensible = dogResultLegs.filter((l) => {
      const ctx = ctxs.get(l.eventId);
      return ctx && (ctx.contenderTier === "underdog-live" || ctx.contenderTier === "even") && ctx.extraTimeRisk >= 0.2;
    }).sort((a, b) => b.odds - a.odds); // the boldest defensible upset first
    const cands: (ThemeOutcome | null)[] = [];
    for (const killer of defensible) {
      // a calmer second team leg from a DIFFERENT game (a favourite result or a low-event anchor) to support it
      const supports = [...favResultLegs, ...underLegs, ...bttsNoLegs].filter((s) => s.eventId !== killer.eventId);
      for (const s of supports) {
        cands.push(tryThemeCard("Giant Killer", [killer, s], playerLegs, ctxs, cfg, {
          playerStrategy: "in-game", avoidPlayerIds: spentPlayers,
          extraNotes: [`The card is built around one upset — ${killer.participant} (${killer.marketLabel}) — in an even, extra-time-live tie; the rest of the card is the calmer support around it.`],
        }));
      }
    }
    pushBest(cands, 1);
  }

  // ── Heavy Favorite Builder — the board's CLEAREST sides stacked into one survival-priced ticket.
  //    Sourced from in-band result legs on market-favourites; each leg uses the cleanest in-band side
  //    (DC/DNB before steep moneylines) so no leg is a sub-floor favourite, backed by those favs' attackers.
  {
    // The favourite RESULT legs, shortest (clearest) price first — these are the "heavy" sides we can take in-band.
    const heavies = favResultLegs
      .filter((l) => { const c = ctxs.get(l.eventId); return c && (c.contenderTier === "strong-favorite" || c.contenderTier === "favorite"); })
      .sort((a, b) => a.odds - b.odds); // clearest favourite first
    const cands: (ThemeOutcome | null)[] = [];
    for (let i = 0; i < heavies.length; i++)
      for (let j = i + 1; j < heavies.length; j++) {
        if (heavies[i].eventId === heavies[j].eventId) continue;
        cands.push(tryThemeCard("Heavy Favorite Builder", [heavies[i], heavies[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "same-team", avoidPlayerIds: spentPlayers,
          extraNotes: ["The board's clearest sides combined — individually short, together a longer survival-priced number. Each side is taken from its in-band outcome (DC/DNB over a steep moneyline), so no leg is a sub-floor favourite."],
        }));
      }
    pushBest(cands, 1);
  }

  // ── Tournament Favorite Builder — the strongest CONTENDERS taken to ADVANCE (double-chance / draw-no-bet),
  //    not merely win in 90'. This is the lowest-drama "these teams go through" expression — survives extra time.
  {
    const advance = resultLegs
      .filter((l) => (l.market === "double_chance" || l.market === "draw_no_bet"))
      .filter((l) => { const c = ctxs.get(l.eventId); return c && l.team && c.favoriteTeam === l.team && (c.contenderTier === "strong-favorite" || c.contenderTier === "favorite"); })
      .sort((a, b) => b.modelProbability - a.modelProbability);
    const cands: (ThemeOutcome | null)[] = [];
    for (let i = 0; i < advance.length; i++)
      for (let j = i + 1; j < advance.length; j++) {
        if (advance[i].eventId === advance[j].eventId) continue;
        cands.push(tryThemeCard("Tournament Favorite Builder", [advance[i], advance[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "same-team", avoidPlayerIds: spentPlayers,
          extraNotes: ["Strongest contenders to ADVANCE — double-chance / draw-no-bet that survives extra time, where deep-run sides actually get eliminated. Lowest-drama way to back the favourites through."],
        }));
      }
    pushBest(cands, 1);
  }

  // ── Goalscorer Trio — THREE anytime-goalscorer legs on likely (role-screened) scorers, plus the two
  //    team anchors the discipline requires. A pure attacking longshot: only emitted if 3 in-band scorers
  //    on eligible roles exist across the games in play (never padded with non-scorer markets).
  {
    const scorerPool = playerLegs.filter((p) => p.market === "player_goal_scorer_anytime");
    const distinctScorerGames = new Set(scorerPool.map((p) => p.eventId)).size;
    const cands: (ThemeOutcome | null)[] = [];
    if (scorerPool.length >= 3 && distinctScorerGames >= cfg.minGamesPerCard) {
      // Anchor on the two clearest favourite result legs from DISTINCT games that have scorers available,
      // then require three goalscorer legs on top.
      const anchorPool = favResultLegs.length >= 2 ? favResultLegs : resultLegs.sort((a, b) => b.modelProbability - a.modelProbability);
      for (let i = 0; i < anchorPool.length; i++)
        for (let j = i + 1; j < anchorPool.length; j++) {
          if (anchorPool[i].eventId === anchorPool[j].eventId) continue;
          cands.push(tryThemeCard("Goalscorer Trio", [anchorPool[i], anchorPool[j]], scorerPool, ctxs, cfg, {
            playerStrategy: "in-game", minPlayers: 3,
            requireMarkets: ["player_goal_scorer_anytime"],
            avoidPlayerIds: spentPlayers,
            extraNotes: ["Three likely scorers (role-screened — no bench / rotation / defenders) across the games in play, on top of two team anchors. Anytime-goalscorer is the highest-variance honest market we post — upside-first by design."],
          }));
        }
    }
    pushBest(cands, 1);
  }

  // ── Bracket Survivor — the LOWEST-variance survival ticket the slate allows: favourite double-chance /
  //    draw-no-bet + the favourites' attackers, ranked SHORTEST combined price first (least likely to be
  //    undone by a single swing). The honest "just get me through the round" card.
  {
    const survival = resultLegs
      .filter((l) => (l.market === "double_chance" || l.market === "draw_no_bet") && l.team)
      .filter((l) => { const c = ctxs.get(l.eventId); return c && c.favoriteTeam === l.team; })
      .sort((a, b) => a.odds - b.odds); // shortest (safest) survival leg first
    const cands: (ThemeOutcome | null)[] = [];
    for (let i = 0; i < survival.length; i++)
      for (let j = i + 1; j < survival.length; j++) {
        if (survival[i].eventId === survival[j].eventId) continue;
        cands.push(tryThemeCard("Bracket Survivor", [survival[i], survival[j]], playerLegs, ctxs, cfg, {
          playerStrategy: "same-team", avoidPlayerIds: spentPlayers,
          extraNotes: ["Lowest-variance survival across the slate — double-chance / draw-no-bet on the favourites (survives extra time) plus their attackers, the legs least likely to be undone by one swing."],
        }));
      }
    pushBest(cands, 1);
  }

  // NOTE — a misleading "favourite straight-survival" card built from the steepest moneyline prices is NOT
  // emitted: clear-favourite moneylines (Germany −305) and steep DC/DNB (Germany DC −2500, Brazil DC −625,
  // Netherlands DC −455, Germany DNB −1430, South Africa→Canada DC −770) sit SHORTER than the −250 per-leg
  // floor. Heavy Favorite Builder / Bracket Survivor only use the in-band favourite outcomes; the sub-floor
  // ones are honestly skipped rather than forced under a "survival" banner.

  return out;
}

// ── Editorial bundle (sportsbook-desk voice) ─────────────────────────────────────────────────────
/** Map a SpecialLeg onto the editorial brain's minimal leg shape. */
function toEditorialLeg(l: SpecialLeg): EditorialLeg {
  return {
    gameId: l.eventId,
    marketKey: l.market,
    selection: l.side ?? l.participant,
    team: l.team,
    player: l.kind === "player" ? l.participant : null,
    odds: l.odds,
  };
}

/** Distinct games this card touches, in card order, as knockout contexts (skips any we can't resolve). */
function cardContexts(legs: SpecialLeg[], ctxs: Map<string, KnockoutContext>): KnockoutContext[] {
  const seen = new Set<string>();
  const out: KnockoutContext[] = [];
  for (const l of legs) {
    if (seen.has(l.eventId)) continue;
    seen.add(l.eventId);
    const ctx = ctxs.get(l.eventId);
    if (ctx) out.push(ctx);
  }
  return out;
}

/** Stitch the per-game expectedGameScript lines into one short combined script (de-duplicated, capped). */
function combinedGameScript(legs: SpecialLeg[], ctxs: Map<string, KnockoutContext>): string {
  const ctx = cardContexts(legs, ctxs);
  if (!ctx.length) return "";
  // One sentence per game (already analyst-voice); join with the connective the desk would use.
  const scripts = ctx.slice(0, 4).map((c) => expectedGameScript(c).trim());
  return Array.from(new Set(scripts)).join(" ");
}

/** A punchy one-line subtitle keyed off the theme + the card's actual game shape this slate. */
function subtitleFor(theme: string, legs: SpecialLeg[], ctxs: Map<string, KnockoutContext>): string {
  const ctx = cardContexts(legs, ctxs);
  const teamLegs = legs.filter((l) => l.kind === "team");
  const players = legs.filter((l) => l.kind === "player");
  const scorers = players.filter((l) => l.market === "player_goal_scorer_anytime").length;
  const games = ctx.length || new Set(legs.map((l) => l.eventId)).size;
  const favNames = teamLegs.map((l) => l.team).filter((t): t is string => !!t);
  const favList = Array.from(new Set(favNames)).slice(0, 3).join(" + ");
  switch (theme) {
    case "Favorites Rolling":
      return `${games} knockout favorites the market expects to control their ties, backed by their own attackers.`;
    case "Heavy Favorite Builder":
      return `The clearest sides on the board${favList ? ` — ${favList}` : ""} stacked into one survival-priced ticket.`;
    case "Tournament Favorite Builder":
      return `The strongest contenders advancing — double-chance / draw-no-bet that survives extra time.`;
    case "Goal Festival":
      return `The most open games on the slate — Over 2.5 / BTTS-Yes paired with scorers in the same fixtures.`;
    case "Goalscorer Trio":
      return `${scorers || players.length} likely scorers across ${games} ties — a pure attacking longshot, role-screened.`;
    case "Defensive Games":
      return `Cautious knockout ties expected to stay tight — Under 2.5 / BTTS-No with the attacking upside on top.`;
    case "Underdog Ladder":
      return `Priced underdogs stacked for a longer combined number — every leg live, none a coin-flip favorite.`;
    case "Chaos Builder":
      return `A reasonably-priced upset welded to a value leg — variance by design, every leg market-supported.`;
    case "Giant Killer":
      return `Built around one defensible upset in an extra-time-live tie, with calmer support around it.`;
    case "Bracket Survivor":
      return `Lowest-variance survival across ${games} ties — the legs least likely to be undone by a single swing.`;
    default:
      return `${games} World Cup ties, model-ranked into one high-variance paper longshot.`;
  }
}

/** The 2–4 sentence analyst writeup of WHY this theme exists on THIS slate (no fabricated stats). */
function explanationFor(theme: string, legs: SpecialLeg[], ctxs: Map<string, KnockoutContext>, joint: number, combined: number): string {
  const ctx = cardContexts(legs, ctxs);
  const teamLegs = legs.filter((l) => l.kind === "team");
  const players = legs.filter((l) => l.kind === "player");
  const games = ctx.length || new Set(legs.map((l) => l.eventId)).size;
  const jointPct = (joint * 100).toFixed(0);
  const conf = confidenceLabel(joint);
  const favTeams = Array.from(new Set(teamLegs.map((l) => l.team).filter((t): t is string => !!t)));
  const strongFavs = ctx.filter((c) => c.contenderTier === "strong-favorite").map((c) => c.favoriteTeam).filter(Boolean);
  const evenTies = ctx.filter((c) => c.contenderTier === "even").length;
  const lead = {
    "Favorites Rolling": `This card backs the sides the market already expects to control their knockout ties, then adds attackers ON those favorites so the result and the upside pull the same way. In single-leg elimination football a clear favorite manages the game and protects a lead, which is exactly the script these result legs are priced for.`,
    "Heavy Favorite Builder": `The board's clearest sides${favTeams.length ? ` (${favTeams.slice(0, 3).join(", ")})` : ""} are combined into one ticket — individually short, together a survival-priced longshot. We stay in-band by sourcing each side from the cleaner double-chance / draw-no-bet outcome rather than the steepest moneyline, so no single leg is a sub-floor favorite.`,
    "Tournament Favorite Builder": `The strongest contenders on the slate are taken to ADVANCE rather than simply win in 90' — double-chance and draw-no-bet legs that survive extra time, which is where deep-run sides actually get eliminated. It's the lowest-drama way to express "these teams go through."`,
    "Goal Festival": `Built only on the games whose own markets lean open — an Over 2.5 or BTTS-Yes that the price actually supports — then stacked with scorers from those same fixtures. This is a deliberately correlated bet: if the games flow as the totals suggest, the legs hit as a bloc.`,
    "Goalscorer Trio": `A pure attacking longshot — likely scorers across ${games} ties, every name role-screened so no bench, rotation or defensive player sneaks in. Anytime-goalscorer is the highest-variance honest market we post, so this is upside-first by construction, not a favorites play.`,
    "Defensive Games": `These are the ties the market reads as cautious — Under 2.5 and BTTS-No that the prices back, typical of knockout football where a draw at 90' just means extra time. The attacking props ride on top as the card's only real upside; the team read is a low-event game.`,
    "Underdog Ladder": `Priced underdogs are laddered for a longer combined number, with every leg kept genuinely live (double-chance / moneyline inside the band) rather than a flyer. None of these is a coin-flip favorite — the value is in the price, not the safety.`,
    "Chaos Builder": `A reasonably-priced upset is welded to a value leg from another game — high variance by intent, but each leg is market-supported, not a dart. ${evenTies ? `With ${evenTies} even tie(s) on the slate, the upset side is defensible rather than wishful.` : `The upset side is the one the slate actually prices as live.`}`,
    "Giant Killer": `The whole card is organized around ONE upset — a live underdog in an even, extra-time-live tie where the favorite's edge is thin — with the rest of the slip as calmer support. It's a single bold idea, disclosed as such, not a pile of longshots.`,
    "Bracket Survivor": `The lowest-variance survival ticket the slate allows: the legs least likely to be undone by one swing, leaning on double-chance / draw-no-bet and the favorites' control rather than exact scorelines. ${strongFavs.length ? `${strongFavs.join(", ")} anchor${strongFavs.length === 1 ? "s" : ""} the survival case.` : ""}`,
  }[theme] ?? `A World Cup-only, model-ranked longshot across ${games} ties.`;
  const tail = `Joint model probability ≈ ${jointPct}% (${conf}) at a combined ${combined > 0 ? "+" : ""}${combined} — higher variance by design, ${players.length} player leg(s) limited-data / market-implied until lineups post.`;
  return `${lead} ${tail}`;
}

/** Build the full editorial bundle for a card (subtitle / explanation / confidence / volatility /
 *  expectedGameScript / correlation). Pure — derived from the shared editorial brain + knockout ctxs. */
function buildEditorial(
  theme: string,
  legs: SpecialLeg[],
  combined: number,
  joint: number,
  ctxs: Map<string, KnockoutContext>,
): Pick<WorldCupSpecialCard, "subtitle" | "explanation" | "confidence" | "volatility" | "expectedGameScript" | "correlation"> {
  const corr = editorialCorrelationProfile(legs.map(toEditorialLeg));
  return {
    subtitle: subtitleFor(theme, legs, ctxs),
    explanation: explanationFor(theme, legs, ctxs, joint, combined),
    confidence: confidenceLabel(joint),
    volatility: volatilityLabel(combined),
    expectedGameScript: combinedGameScript(legs, ctxs),
    correlation: { direction: corr.direction, score: corr.score, summary: corr.summary },
  };
}

/** Build a themed WorldCupSpecialCard from a ThemeOutcome (reuses the disclosure scaffold + adds theme). */
function buildThemedCard(
  o: ThemeOutcome,
  index: number,
  opts: GenerateOptions,
  cfg: WorldCupSpecialsConfig,
  ctxs: Map<string, KnockoutContext>,
): WorldCupSpecialCard {
  const base = buildCard(o.combo, o.combined, index, opts, cfg);
  const joint = base.jointModelProbability;
  const editorial = buildEditorial(o.theme, base.legs, base.combinedOdds, joint, ctxs);
  // Lead the "why a sharp bettor places this" with the theme + its knockout-intelligence notes, then keep
  // the structural lines + the honest editorial correlation read.
  const whyThisCard = [
    `Why a sharp bettor places this — ${o.theme}: ${themeBlurb(o.theme)}`,
    ...o.notes,
    ...base.whyThisCard.slice(1),
    editorial.correlation!.summary,
  ];
  return {
    ...base,
    ...editorial,
    id: `wc-special-${opts.date}-${index + 1}`,
    theme: o.theme,
    title: `${o.theme} — ${base.title}`,
    correlationProfile: editorial.correlation!.summary,
    whyThisCard,
    diagnostics: [
      ...base.diagnostics,
      `theme ${o.theme}`,
      `joint model prob ≈ ${(joint * 100).toFixed(1)}%`,
      `confidence ${editorial.confidence} · volatility ${editorial.volatility} · correlation ${editorial.correlation!.direction}`,
    ],
  };
}

function themeBlurb(theme: string): string {
  switch (theme) {
    case "Favorites Rolling": return "expected favourites advancing, backed by attackers on those favourites — lower odds, higher joint probability.";
    case "Heavy Favorite Builder": return "the board's clearest sides combined into one survival-priced ticket — each leg taken from its in-band outcome so none is a sub-floor favourite.";
    case "Tournament Favorite Builder": return "the strongest contenders taken to ADVANCE via double-chance / draw-no-bet — the lowest-drama 'these teams go through' play.";
    case "Goal Festival": return "the most open games — Over 2.5 / BTTS-Yes plus goalscorers from those same fixtures.";
    case "Goalscorer Trio": return "three role-screened likely scorers plus two team anchors — a pure attacking, upside-first longshot.";
    case "Defensive Games": return "cautious knockout ties — Under 2.5 + BTTS-No anchors with the attacking props as upside.";
    case "Underdog Ladder": return "value-heavy priced underdogs stacked for a longer combined price.";
    case "Chaos Builder": return "a reasonably-priced upset mixed with a value leg — higher variance, still market-supported.";
    case "Giant Killer": return "one carefully chosen upset in an even, extra-time-live tie, with calmer support around it.";
    case "Bracket Survivor": return "the lowest-variance survival ticket the slate allows — favourites' double-chance / draw-no-bet, least likely to be undone by one swing.";
    default: return "a World Cup-only, model-ranked longshot card.";
  }
}

/** Select the published themed set: maximise THEME COVERAGE first (one card per theme), drop the weakest
 *  themes only when more than `maxCardsShown` exist, then backfill any spare slots with a 2nd card of the
 *  strongest themes. "Strength" = how well the card's legs fit the knockout script (shared intelligence),
 *  so a theme that fights the slate (e.g. a Goal Festival on a cautious-ties slate) is the first to drop. */
function selectThemed(
  themed: ThemeOutcome[], excluded: Set<string>, ctxs: Map<string, KnockoutContext>,
  cfg: WorldCupSpecialsConfig, diagnostics: SpecialsDiagnostics,
): ThemeOutcome[] {
  // Drop exact duplicates of the active Moonshot / Bank Builder cards + within-set dupes.
  const seen = new Set<string>();
  const unique: ThemeOutcome[] = [];
  for (const t of themed) {
    const sig = cardSignature(t.combo);
    if (excluded.has(sig)) { diagnostics.rejectedDuplicates++; diagnostics.activeMoonshotCardExcluded = true; continue; }
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(t);
  }
  const strength = (t: ThemeOutcome) => cardKnockoutFit(t.combo, ctxs);
  // Group by theme, keeping each theme's cards best-first.
  const byTheme = new Map<string, ThemeOutcome[]>();
  for (const t of unique) (byTheme.get(t.theme) ?? byTheme.set(t.theme, []).get(t.theme)!).push(t);
  for (const list of byTheme.values()) list.sort((a, b) => strength(b) - strength(a) || a.combined - b.combined);
  // Rank themes by their best card's fit — strongest themes kept first when over the cap.
  const themesRanked = Array.from(byTheme.entries()).sort((a, b) => strength(b[1][0]) - strength(a[1][0]));

  const chosen: ThemeOutcome[] = [];
  const notTooClose = (cand: ThemeOutcome) => !chosen.some((c) => overlap(c.combo, cand.combo) > 0.5);
  // Round 1: one card per theme, strongest themes first (so a dropped theme is the weakest-fitting one).
  const droppedThemes: string[] = [];
  for (const [theme, list] of themesRanked) {
    if (chosen.length >= cfg.maxCardsShown) { droppedThemes.push(theme); continue; }
    const pick = list.find(notTooClose);
    if (pick) chosen.push(pick); else droppedThemes.push(theme);
  }
  // Round 2: backfill spare slots with a 2nd card of the strongest themes (still distinct).
  if (chosen.length < cfg.maxCardsShown)
    for (const [, list] of themesRanked) {
      for (const t of list) {
        if (chosen.length >= cfg.maxCardsShown) break;
        if (chosen.includes(t) || !notTooClose(t)) continue;
        chosen.push(t);
      }
      if (chosen.length >= cfg.maxCardsShown) break;
    }
  if (droppedThemes.length)
    diagnostics.notes.push(`themed_specials: ${droppedThemes.length} theme(s) over the ${cfg.maxCardsShown}-card cap, weakest-fit dropped: ${droppedThemes.join(", ")}.`);
  chosen.sort((a, b) => a.combined - b.combined);
  return chosen.slice(0, cfg.maxCardsShown);
}

// ── Snapshot build + load ────────────────────────────────────────────────────────────────────────
const SNAPSHOT_PATH = ["world-cup", "world-cup-specials.json"];

/** Active Moonshot / Bank Builder card signatures to exclude as exact Special duplicates. */
function activeCardSignatures(root: string): string[] {
  const sigs: string[] = [];
  const toLeg = (l: any) => ({ fixture: String(l.fixture ?? ""), marketLabel: String(l.marketLabel ?? l.market ?? ""), participant: String(l.participant ?? l.label ?? ""), side: l.side ?? null, line: l.line ?? null });
  try {
    const moon = JSON.parse(fs.readFileSync(path.join(root, "moonshot-lane", "active.json"), "utf8"));
    for (const step of moon.ladder ?? []) if (step?.card?.legs) sigs.push(cardSignature(step.card.legs.map(toLeg)));
  } catch { /* no moonshot */ }
  try {
    const dual = JSON.parse(fs.readFileSync(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"), "utf8"));
    for (const laneKey of ["laneA", "laneB"]) {
      const lane = dual?.run?.[laneKey];
      if (lane?.legs) sigs.push(cardSignature(lane.legs.map(toLeg)));
    }
  } catch { /* no dual bank builder */ }
  return sigs;
}

/**
 * Build the full World Cup Specials result from the public data root (server-only). Loads the team +
 * player pools, applies the strict filters, excludes the active Moonshot/Bank Builder cards, and
 * returns the ranked 5 + diagnostics. Used by the snapshot script and by tests.
 */
export function buildWorldCupSpecials(opts: { root?: string; nowIso: string; date: string }): WorldCupSpecialsResult {
  const root = opts.root ?? path.join(process.cwd(), "public", "data");
  const teamLegs = loadSpecialsTeamLegs(root, opts.nowIso, opts.date);
  const playerLegs = loadSpecialsPlayerLegs(root, opts.nowIso, opts.date);

  // Honest diagnostics: which games kicked off (excluded), and started-leg rejections.
  const fixtures = fixtureIndex(root);
  const excludedStartedGames: string[] = [];
  for (const f of fixtures.values())
    if (f.kickoffUtc && f.kickoffUtc <= opts.nowIso) excludedStartedGames.push(`${f.home} vs ${f.away}`);

  const excludeSignatures = activeCardSignatures(root);
  const result = generateWorldCupSpecials(teamLegs, playerLegs, {
    date: opts.date,
    generatedAt: opts.nowIso,
    excludeSignatures,
    excludedStartedGames,
  });

  // ── THEMED layer ────────────────────────────────────────────────────────────────────────────────
  // Build the curated, theme-tagged cards from the OUTCOME-level team legs (correct per-side prices) +
  // role-gated player legs, re-ranked by the shared knockout-intelligence layer. When the slate supports
  // a quality, odds-spread themed set (>= 2 cards spanning >= 500 combined-odds), it REPLACES the legacy
  // odds-spread cards. Otherwise we keep the legacy generator's output (honest fallback — never forced).
  const cfg = result.config;
  const themeTeamLegs = loadThemedTeamLegs(root, opts.nowIso, opts.date);
  const themePlayerLegs = loadThemedPlayerLegs(root, opts.nowIso, opts.date);
  let team: { matches?: Array<Record<string, any>> } = {};
  try { team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8")); } catch { /* none */ }
  const ctxs = buildKnockoutContexts((team.matches ?? []) as Array<Record<string, any>>);
  const themeOpts: GenerateOptions = { date: opts.date, generatedAt: opts.nowIso, config: cfg, excludeSignatures };
  const themed = buildThemedCards(themeTeamLegs, themePlayerLegs, ctxs, themeOpts);
  // Honest theme accounting: which themes the slate could actually support at quality, and which were
  // attempted but yielded nothing in-band (so a reader can see e.g. "Goal Festival skipped — cautious slate").
  {
    const built = new Set(themed.map((t) => t.theme));
    const skipped = WORLD_CUP_SPECIAL_THEMES.filter((t) => !built.has(t));
    if (skipped.length)
      result.diagnostics.notes.push(`themed_specials: ${skipped.length} theme(s) not buildable in-band on this slate (skipped honestly): ${skipped.join(", ")}.`);
  }
  const chosenThemed = selectThemed(themed, new Set(excludeSignatures), ctxs, cfg, result.diagnostics);
  const themedSpread = chosenThemed.length
    ? Math.max(...chosenThemed.map((c) => c.combined)) - Math.min(...chosenThemed.map((c) => c.combined))
    : 0;
  if (chosenThemed.length >= 2 && themedSpread >= 500) {
    result.cards = chosenThemed.map((o, i) => buildThemedCard(o, i, themeOpts, cfg, ctxs));
    const perTheme = new Map<string, number>();
    for (const c of result.cards) perTheme.set(c.theme ?? "Specials", (perTheme.get(c.theme ?? "Specials") ?? 0) + 1);
    result.diagnostics.notes.push(
      `themed_specials: ${result.cards.length} curated cards — ${Array.from(perTheme.entries()).map(([t, n]) => `${t} ×${n}`).join(", ")}.`,
    );
  } else {
    // Even on the legacy fallback, surface the editorial bundle so every published card reads like the
    // desk wrote it (no theme → the generic "Specials" voice). Derived from the same shared brain.
    result.cards = result.cards.map((card) => {
      const editorial = buildEditorial(card.theme ?? "Specials", card.legs, card.combinedOdds, card.jointModelProbability, ctxs);
      return {
        ...card,
        ...editorial,
        correlationProfile: editorial.correlation!.summary,
        whyThisCard: [...card.whyThisCard, editorial.correlation!.summary],
      };
    });
    result.diagnostics.notes.push("themed_specials: slate did not support a quality, odds-spread themed set — kept the legacy odds-spread cards (editorial bundle applied).");
  }

  // Surface the out-of-range / started rejection counts at the feed level for the snapshot diagnostics.
  result.diagnostics.rejectedOutOfLegOddsRange = countOutOfLegRange(root, opts.date);
  result.diagnostics.notes.unshift(
    `${excludedStartedGames.length} of ${fixtures.size} World Cup games already kicked off and were excluded (pre-event only).`,
  );
  return result;
}

/** Count posted WC markets (team + player) that exist but fall outside the strict per-leg odds band. */
function countOutOfLegRange(root: string, date: string): number {
  let n = 0;
  try {
    const team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
    if (!team.date || team.date === date)
      for (const r of team.matches ?? [])
        if (TEAM_MARKET_LABEL[r.market] && typeof r.americanOdds === "number" && !legOddsInRange(r.americanOdds)) n++;
  } catch { /* ignore */ }
  try {
    const pp = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", "latest.json"), "utf8"));
    if (!pp.date || pp.date === date)
      for (const r of pp.matches ?? [])
        if (PLAYER_MARKET_LABEL[r.market] && typeof r.americanOdds === "number" && !legOddsInRange(r.americanOdds)) n++;
  } catch { /* ignore */ }
  return n;
}

/** Load the committed World Cup Specials snapshot (homepage). Returns null when missing/unparseable. */
export function loadWorldCupSpecials(rootOverride?: string): WorldCupSpecialsResult | null {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    return JSON.parse(fs.readFileSync(path.join(root, ...SNAPSHOT_PATH), "utf8")) as WorldCupSpecialsResult;
  } catch {
    return null;
  }
}

/** Every leg of every card is still pre-event relative to `nowIso` (render-time safety for the box). */
export function specialsAllPreEvent(result: WorldCupSpecialsResult | null, nowIso: string): boolean {
  if (!result || !result.cards.length) return false;
  return result.cards.every((c) => c.legs.every((l) => !!l.startTime && l.startTime > nowIso));
}

// ── World Cup Specials HISTORY (durable, append-only across days) ─────────────────────────────────
// The daily snapshot file is overwritten each slate; the history file (built by
// app/scripts/archive-world-cup-specials.mjs) persists a compact record of each day so the tracker can
// show past slates. Honest: archived as-recorded, never backfilled with fabricated outcomes.
export interface SpecialsHistoryLeg { selection: string; settlementStatus: string; fixture: string | null }
export interface SpecialsHistoryCard {
  id: string | null; title: string; combinedOdds: number | null; projectedReturn: number | null;
  result: string | null; legCount: number; legs: SpecialsHistoryLeg[];
}
export interface SpecialsHistoryDay { date: string; generatedAt: string | null; cardCount: number; cards: SpecialsHistoryCard[] }
export interface SpecialsHistory { version: string; updatedAt?: string | null; days: SpecialsHistoryDay[] }

const HISTORY_PATH = ["world-cup", "world-cup-specials-history.json"];

/** Load the durable Specials history (newest day first). Returns an empty history when absent. */
export function loadWorldCupSpecialsHistory(rootOverride?: string): SpecialsHistory {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    const h = JSON.parse(fs.readFileSync(path.join(root, ...HISTORY_PATH), "utf8")) as SpecialsHistory;
    if (!Array.isArray(h.days)) return { version: "world-cup-specials-history-v1", days: [] };
    h.days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return h;
  } catch {
    return { version: "world-cup-specials-history-v1", days: [] };
  }
}

/** Past slates only (excludes the current/most-recent day so the tracker doesn't double-show today). */
export function specialsPastSlates(history: SpecialsHistory, currentDate: string): SpecialsHistoryDay[] {
  return (history.days ?? []).filter((d) => d.date !== currentDate);
}
